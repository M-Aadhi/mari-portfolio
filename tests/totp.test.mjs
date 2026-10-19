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
