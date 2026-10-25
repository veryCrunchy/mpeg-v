import verify from "./verify.ts";

Deno.serve({ port: 3000 }, async (req) => {
  const url = new URL(req.url);

  // POST /
  if (url.pathname === "/" && req.method === "POST") {
    const verified = await verify(req);
    if (verified instanceof Response) return verified;
    let body;
    try {
      body = JSON.parse(verified);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (body?.type === 1) return Response.json({ type: 1 }); // Interaction PING.
    if (body?.type === 0) return new Response(null, { status: 204 }); // Webhook PING.
    return new Response(null, { status: 400 });
  }

  return new Response(null, { status: 418, statusText: "I'm a teapot" });
});
