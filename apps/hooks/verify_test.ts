import { strict as assert } from "node:assert";
import verify from "./verify.ts";
const toHex = (bytes: ArrayBuffer) =>
  Array.from(
    new Uint8Array(bytes),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");

Deno.test("malformed webhook signatures fail closed", async () => {
  const response = await verify(
    new Request("http://localhost/", { method: "POST", body: "{}" }),
    "bad-key",
  );
  assert.ok(response instanceof Response);
  assert.equal(response.status, 401);
});
Deno.test("native Ed25519 verifies exact signed bytes and rejects tampering and replay", async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]) as CryptoKeyPair;
  const publicKey = toHex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const body = '{"type":1}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = toHex(
    await crypto.subtle.sign(
      "Ed25519",
      pair.privateKey,
      new TextEncoder().encode(timestamp + body),
    ),
  );
  const request = (payload: string, time = timestamp) =>
    new Request("http://localhost/", {
      method: "POST",
      body: payload,
      headers: {
        "X-Signature-Ed25519": signature,
        "X-Signature-Timestamp": time,
      },
    });
  assert.equal(await verify(request(body), publicKey), body);
  assert.equal(
    (await verify(request('{"type":2}'), publicKey) as Response).status,
    401,
  );
  assert.equal(
    (await verify(request(body, "1"), publicKey) as Response).status,
    401,
  );
});
