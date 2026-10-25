const encoder = new TextEncoder();
const hex = (value: string) =>
  new Uint8Array(value.match(/../g)!.map((byte) => parseInt(byte, 16)));

export default async function verify(
  req: Request,
  publicKey = Deno.env.get("PUBLIC_KEY"),
): Promise<Response | string> {
  const signature = req.headers.get("X-Signature-Ed25519") ?? "";
  const timestamp = req.headers.get("X-Signature-Timestamp") ?? "";
  const invalid = () =>
    new Response("Invalid request signature", { status: 401 });
  if (
    !publicKey || !/^[a-f0-9]{64}$/i.test(publicKey) ||
    !/^[a-f0-9]{128}$/i.test(signature) ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !req.body
  ) return invalid();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const prefix = encoder.encode(timestamp);
  const signed = new Uint8Array(prefix.length + bytes.length);
  signed.set(prefix);
  signed.set(bytes, prefix.length);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hex(publicKey),
      "Ed25519",
      false,
      ["verify"],
    );
    if (!await crypto.subtle.verify("Ed25519", key, hex(signature), signed)) {
      return invalid();
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return invalid();
  }
}
