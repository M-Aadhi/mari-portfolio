// Unit tests for the vault's authenticator (TOTP) code. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, hotp, verifyTotp } from "../src/worker.js";

// RFC 6238 test secret: ASCII "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("base32 decodes the RFC test secret", () => {
  assert.equal(new TextDecoder().decode(base32Decode(SECRET)), "12345678901234567890");
  assert.equal(new TextDecoder().decode(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")), "12345678901234567890");
  assert.throws(() => base32Decode("NOT*BASE32"));
});

test("hotp matches RFC 6238 vectors (last 6 digits, SHA-1)", async () => {
  const key = base32Decode(SECRET);
  const vectors = { 59: "287082", 1111111109: "081804", 1111111111: "050471", 1234567890: "005924", 2000000000: "279037", 20000000000: "353130" };
  for (const [t, code] of Object.entries(vectors)) assert.equal(await hotp(key, Math.floor(Number(t) / 30)), code, `t=${t}`);
});

test("verifyTotp accepts the current and adjacent steps only", async () => {
  const now = 1111111111 * 1000;
  const key = base32Decode(SECRET);
  const step = Math.floor(now / 30000);
  assert.equal(await verifyTotp(SECRET, await hotp(key, step), now), step);
  assert.equal(await verifyTotp(SECRET, await hotp(key, step - 1), now), step - 1);
  assert.equal(await verifyTotp(SECRET, await hotp(key, step + 1), now), step + 1);
  assert.equal(await verifyTotp(SECRET, await hotp(key, step - 3), now), null);
  assert.equal(await verifyTotp(SECRET, "000000", now) === null || (await hotp(key, step)) === "000000", true);
});

test("setup page base32 encoder round-trips with the Worker decoder", async () => {
  const html = await (await import("node:fs/promises")).readFile(new URL("../tools/totp-setup.html", import.meta.url), "utf8");
  const src = html.match(/function base32\(bytes\) \{[\s\S]*?\n\}/)[0];
  const base32 = new Function(`${src}; return base32;`)();
  for (let n = 0; n < 50; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    assert.deepEqual(base32Decode(base32(bytes)), bytes);
  }
});

test("normalizeSecret tolerates common paste mistakes", async () => {
  const { normalizeSecret } = await import("../src/worker.js");
  assert.equal(normalizeSecret(`"${SECRET}"`), SECRET);
  assert.equal(normalizeSecret(`  '${SECRET.toLowerCase()}'\n`), SECRET);
  assert.equal(normalizeSecret("GEZD GNBV-GY3T QOJQ GEZD GNBV GY3T QOJQ=="), SECRET);
  assert.equal(normalizeSecret(`otpauth://totp/Mari%20Vault:Mari?secret=${SECRET}&issuer=Mari%20Vault`), SECRET);
});

// Minimal in-memory KV so the login route can run without Cloudflare.
function memoryKV() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); }
  };
}
const post = (code) => new Request("https://vault.test/api/auth", { method: "POST", headers: { "X-Vault": "1", "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" }, body: JSON.stringify({ code }) });

test("login works when the secret was pasted with quotes", async () => {
  const worker = (await import("../src/worker.js")).default;
  const env = { TOTP_SECRET: `"${SECRET}"`, VAULT: memoryKV() };
  const code = await hotp(base32Decode(SECRET), Math.floor(Date.now() / 30000));
  const r = await worker.fetch(post(code), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Set-Cookie"), /__Host-mv=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict/);
});

test("misconfiguration gives a clear 503 instead of a server error", async () => {
  const worker = (await import("../src/worker.js")).default;
  let r = await worker.fetch(post("123456"), { TOTP_SECRET: "not a secret!!", VAULT: memoryKV() });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /not a valid authenticator secret/);
  r = await worker.fetch(post("123456"), { TOTP_SECRET: SECRET });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /VAULT KV binding/);
  const h = await (await worker.fetch(new Request("https://vault.test/api/health"), { TOTP_SECRET: "bad!", VAULT: memoryKV() })).json();
  assert.deepEqual([h.vault, h.secretValid, h.storageReady], [true, false, true]);
});
