import { crypto } from "@std/crypto";
const PUBLIC_KEY = Deno.env.get("PUBLIC_KEY");
export default async (req: Request): Promise<Response | true> => {
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const body = await req.text();

  const keyData = new Uint8Array(
    (PUBLIC_KEY?.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
    true,
    ["verify"]
  );

  const isVerified = await crypto.subtle.verify(
    "NODE-ED25519",
    publicKey,
    new Uint8Array(
      signature?.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    ),
    new TextEncoder().encode(timestamp + body)
  );

  if (!isVerified) {
    return new Response(null, {
      status: 401,
      statusText: "invalid request signature",
    });
  }
  return true;
};
