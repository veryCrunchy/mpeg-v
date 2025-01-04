import verify from "./verify.ts";

Deno.serve({ port: 3000 }, async (req) => {
  const url = new URL(req.url);

  // POST /
  if (url.pathname === "/" && req.method === "POST") {
    const verified = await verify(req);
    if (verified !== true) return verified;
  }

  return new Response(null, { status: 418, statusText: "I'm a teapot" });
});
