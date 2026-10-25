import { readBoundedBody, rateLimit } from "../../utils/files";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  rateLimit(`token:${event.node.req.socket.remoteAddress ?? "unknown"}`, 30);
  const config = useRuntimeConfig(event);
  if (!config.public.discordClientId || !config.discordClientSecret)
    throw createError({
      statusCode: 503,
      statusMessage: "Discord connection is unavailable.",
    });
  let body: unknown;
  try {
    body = JSON.parse((await readBoundedBody(event, 2048)).toString("utf8"));
  } catch (error) {
    if (isError(error)) throw error;
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid sign-in request.",
    });
  }
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !/^[A-Za-z0-9._~\-]{1,1024}$/.test(code))
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid sign-in request.",
    });
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.public.discordClientId,
      client_secret: config.discordClientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!response.ok)
    throw createError({
      statusCode: 401,
      statusMessage: "Discord sign-in expired. Please connect again.",
    });
  const token = await response.json();
  if (typeof token.access_token !== "string")
    throw createError({
      statusCode: 502,
      statusMessage: "Discord sign-in could not be completed.",
    });
  // Never return the client secret or refresh token, or persist the access token.
  return { access_token: token.access_token };
});
