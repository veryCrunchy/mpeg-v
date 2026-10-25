export default defineEventHandler((event) => {
  setHeaders(event, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  // Discord Activities require framing. Do not set X-Frame-Options: DENY.
  if (event.path.startsWith("/api/"))
    setHeader(event, "Cache-Control", "no-store");
});
