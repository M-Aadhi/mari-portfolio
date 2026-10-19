/*
 * Mari portfolio — Cloudflare Worker
 *
 * Serves the static site from ./public (ASSETS binding) and the private vault API under /api/*:
 *   - real authenticator (TOTP, RFC 6238) check; the secret lives only in the TOTP_SECRET Worker secret
 *   - 8-hour session in an HTTP-only, Secure, SameSite=Strict cookie (stored in KV, revoked on lock)
 *   - login rate limit: 5 wrong codes per IP → 15-minute lock, plus a global cap
 *   - files and images: upload, list, download, delete (R2 if bound as FILES, otherwise KV)
 *   - clipboard: text snippets that sync across devices
 * Nothing private is ever shipped in the HTML; the browser only gets data after a valid session.
 */

const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;          // per hour, across all IPs
const LOCK_SECONDS = 15 * 60;
const KV_FILE_LIMIT = 25 * 1024 * 1024;   // KV value limit
const R2_FILE_LIMIT = 100 * 1024 * 1024;  // Worker request body limit on the free plan
const CLIP_LIMIT = 100 * 1024;
const CLIP_MAX = 200;
// Only these are ever shown inline (as <img>). Everything else, SVG and HTML included, downloads.
const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
const COOKIE = "__Host-mv";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await api(req, env, url);
    } catch (err) {
      console.error(err);
      return json({ error: `Server error: ${err && err.message ? err.message : "unexpected failure"}` }, 500);
    }
  }
};

async function api(req, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;

  if (path === "/api/health" && method === "GET") {
    // Setup diagnostics only: says whether each piece is configured, never the secret itself.
    return json({
      ok: true,
      vault: Boolean(env.TOTP_SECRET),
      secretValid: Boolean(secretBytes(env)),
      storageReady: Boolean(env.VAULT),
      storage: env.FILES ? "r2" : "kv",
      maxFile: fileLimit(env)
    });
  }

  // CSRF: every state-changing call must be same-origin and carry the custom header
  // (a cross-site form or image cannot add it, and cross-origin fetch would need CORS, which we never grant).
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("Origin");
    if (req.headers.get("X-Vault") !== "1" || (origin && origin !== url.origin)) return json({ error: "Forbidden" }, 403);
  }

  if (path === "/api/auth" && method === "POST") return login(req, env);

  const session = await getSession(req, env);
  if (path === "/api/session" && method === "GET") {
    return session ? json({ ok: true, expiresAt: session.expiresAt }) : json({ ok: false }, 401);
  }
  if (!session) return json({ error: "Not signed in" }, 401);

  if (path === "/api/logout" && method === "POST") {
    await env.VAULT.delete(`sess:${session.id}`);
    return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` });
  }

  // Files and images
  if (path === "/api/files" && method === "GET") return json({ files: await store(env).list() });
  if (path === "/api/files" && method === "PUT") return upload(req, env, url);
  const fm = path.match(/^\/api\/files\/([a-f0-9-]{36})$/);
  if (fm && method === "GET") return download(env, fm[1], url.searchParams.get("inline") === "1");
  if (fm && method === "DELETE") { await store(env).remove(fm[1]); return json({ ok: true }); }

  // Clipboard snippets (one small JSON list; single user, so no write contention)
  if (path === "/api/clips" && method === "GET") return json({ clips: await getClips(env) });
  if (path === "/api/clips" && method === "POST") {
    const { text } = await req.json().catch(() => ({}));
    if (typeof text !== "string" || !text.trim()) return json({ error: "Nothing to save" }, 400);
    if (new TextEncoder().encode(text).length > CLIP_LIMIT) return json({ error: "Snippet is larger than 100 KB" }, 413);
    const clip = { id: crypto.randomUUID(), text, created: Date.now() };
    const clips = [clip, ...(await getClips(env))].slice(0, CLIP_MAX);
    await env.VAULT.put("clips", JSON.stringify(clips));
    return json({ clip });
  }
  const cm = path.match(/^\/api\/clips\/([a-f0-9-]{36})$/);
  if (cm && method === "DELETE") {
    await env.VAULT.put("clips", JSON.stringify((await getClips(env)).filter((c) => c.id !== cm[1])));
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

/* ---------- authentication ---------- */

async function login(req, env) {
  if (!env.TOTP_SECRET) return json({ error: "Vault is not configured: add the TOTP_SECRET secret to the Worker." }, 503);
  if (!env.VAULT) return json({ error: "Vault storage is not connected: the Worker has no VAULT KV binding." }, 503);
  const key = secretBytes(env);
  if (!key) return json({ error: "TOTP_SECRET is not a valid authenticator secret. Re-create it with tools/totp-setup.html and paste only the letters and digits." }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = `rl:ip:${ip}`;
  const fails = Number(await env.VAULT.get(ipKey)) || 0;
  const globalFails = Number(await env.VAULT.get("rl:all")) || 0;
  if (fails >= MAX_FAILS_PER_IP || globalFails >= MAX_FAILS_GLOBAL) {
    return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  const { code } = await req.json().catch(() => ({}));
  const counter = /^\d{6}$/.test(code || "") ? await verifyTotpBytes(key, code, Date.now()) : null;
  const last = Number(await env.VAULT.get("totp:last")) || 0;
  if (counter === null || counter <= last) {           // wrong code, or a code that was already used
    await env.VAULT.put(ipKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
    await env.VAULT.put("rl:all", String(globalFails + 1), { expirationTtl: 3600 });
    return json({ error: "Verification failed", attemptsLeft: Math.max(0, MAX_FAILS_PER_IP - fails - 1) }, 401);
  }
  await env.VAULT.put("totp:last", String(counter), { expirationTtl: 300 });
  await env.VAULT.delete(ipKey);

  const id = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  await env.VAULT.put(`sess:${id}`, JSON.stringify({ expiresAt }), { expirationTtl: SESSION_SECONDS });
  return json({ ok: true, expiresAt }, 200, {
    "Set-Cookie": `${COOKIE}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}`
  });
}

async function getSession(req, env) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  if (!m) return null;
  const raw = await env.VAULT.get(`sess:${m[1]}`);
  if (!raw) return null;
  const { expiresAt } = JSON.parse(raw);
  return Date.now() < expiresAt ? { id: m[1], expiresAt } : null;
}

export function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const s = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const i = alphabet.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 secret");
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export async function hotp(secretBytes, counter) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg.buffer));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, "0");
}

/**
 * Cleans up a pasted secret: surrounding quotes, spaces, dashes and padding are ignored, and a full
 * otpauth:// link (what a QR code contains) is accepted too. Returns the base32 text, uppercased.
 */
export function normalizeSecret(raw) {
  let s = String(raw || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  if (/^otpauth:\/\//i.test(s)) {
    try { s = new URL(s).searchParams.get("secret") || ""; } catch { s = ""; }
  }
  return s.replace(/[\s=-]/g, "").toUpperCase();
}

/** Decoded TOTP key, or null when TOTP_SECRET is missing or not valid base32 (at least 80 bits). */
function secretBytes(env) {
  try {
    const bytes = base32Decode(normalizeSecret(env.TOTP_SECRET));
    return bytes.length >= 10 ? bytes : null;
  } catch {
    return null;
  }
}

/** Returns the matching time-step counter (current step ±1 for clock drift), or null. */
export async function verifyTotp(secret, code, now) {
  return verifyTotpBytes(base32Decode(normalizeSecret(secret)), code, now);
}

async function verifyTotpBytes(bytes, code, now) {
  const step = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) {
    if (safeEqual(await hotp(bytes, step + d), code)) return step + d;
  }
  return null;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- files ---------- */

const fileLimit = (env) => (env.FILES ? R2_FILE_LIMIT : KV_FILE_LIMIT);

function cleanName(name) {
  const n = String(name || "file").replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 200);
  return n || "file";
}

async function upload(req, env, url) {
  const size = Number(req.headers.get("Content-Length"));
  if (!size) return json({ error: "Empty or unknown-size upload" }, 411);
  if (size > fileLimit(env)) return json({ error: `File is larger than ${fileLimit(env) / 1048576} MB` }, 413);
  const meta = {
    name: cleanName(url.searchParams.get("name")),
    type: String(url.searchParams.get("type") || "application/octet-stream").slice(0, 100),
    size,
    uploaded: Date.now()
  };
  const id = crypto.randomUUID();
  await store(env).put(id, req.body, size, meta);
  return json({ file: { id, ...meta } });
}

async function download(env, id, inline) {
  const obj = await store(env).get(id);
  if (!obj) return json({ error: "Not found" }, 404);
  const showInline = inline && INLINE_IMAGES.has(obj.meta.type);
  return new Response(obj.body, {
    headers: {
      "Content-Type": showInline ? obj.meta.type : "application/octet-stream",
      "Content-Disposition": `${showInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(obj.meta.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox"
    }
  });
}

/** Storage adapter: R2 when the FILES bucket is bound, otherwise KV (files up to 25 MB). */
function store(env) {
  if (env.FILES) {
    const b = env.FILES;
    return {
      async put(id, body, size, meta) {
        const { readable, writable } = new FixedLengthStream(size);
        const pumping = body.pipeTo(writable);
        await b.put(id, readable, { customMetadata: { meta: JSON.stringify(meta) } });
        await pumping;
      },
      async get(id) {
        const o = await b.get(id);
        return o && { body: o.body, meta: JSON.parse(o.customMetadata.meta) };
      },
      async remove(id) { await b.delete(id); },
      async list() {
        const files = [];
        let cursor;
        do {
          const r = await b.list({ cursor, include: ["customMetadata"] });
          r.objects.forEach((o) => files.push({ id: o.key, ...JSON.parse(o.customMetadata.meta) }));
          cursor = r.truncated ? r.cursor : undefined;
        } while (cursor);
        return files.sort((a, z) => z.uploaded - a.uploaded);
      }
    };
  }
  const kv = env.VAULT;
  return {
    async put(id, body, size, meta) {
      const data = await new Response(body).arrayBuffer();
      if (data.byteLength !== size) throw new Error("Upload size mismatch");
      await kv.put(`file:${id}`, data, { metadata: meta });
    },
    async get(id) {
      const r = await kv.getWithMetadata(`file:${id}`, { type: "stream" });
      return r.value && { body: r.value, meta: r.metadata };
    },
    async remove(id) { await kv.delete(`file:${id}`); },
    async list() {
      const files = [];
      let cursor;
      do {
        const r = await kv.list({ prefix: "file:", cursor });
        r.keys.forEach((k) => files.push({ id: k.name.slice(5), ...k.metadata }));
        cursor = r.list_complete ? undefined : r.cursor;
      } while (cursor);
      return files.sort((a, z) => z.uploaded - a.uploaded);
    }
  };
}

/* ---------- helpers ---------- */

async function getClips(env) {
  return JSON.parse((await env.VAULT.get("clips")) || "[]");
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra }
  });
}
