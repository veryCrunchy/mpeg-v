import { createError, getHeader, setHeader, type H3Event } from "h3";

let pendingChecks = 0;

export async function verifyDiscordToken(
  authorization: string | undefined,
  clientId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!clientId)
    throw createError({
      statusCode: 503,
      statusMessage: "Discord connection is unavailable.",
    });
  if (
    !authorization ||
    !/^Bearer [A-Za-z0-9._~\-]{10,2048}$/.test(authorization)
  )
    throw createError({
      statusCode: 401,
      statusMessage: "Connect to Discord first.",
    });
  const response = await fetcher("https://discord.com/api/v10/oauth2/@me", {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw createError({
      statusCode: 401,
      statusMessage: "Reconnect to Discord and try again.",
    });
  const auth = await response.json();
  if (
    auth.application?.id !== clientId ||
    !auth.scopes?.includes("identify") ||
    typeof auth.user?.id !== "string" ||
    !/^\d+$/.test(auth.user.id) ||
    !Number.isFinite(Date.parse(auth.expires)) ||
    Date.parse(auth.expires) <= Date.now()
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: "Reconnect to this Discord app and try again.",
    });
  }
  return { id: auth.user.id as string, authorization };
}
export async function discordIdentity(event: H3Event) {
  setHeader(event, "Cache-Control", "no-store");
  const config = useRuntimeConfig(event);
  if (pendingChecks >= 16)
    throw createError({
      statusCode: 429,
      statusMessage: "The service is busy. Try again shortly.",
    });
  pendingChecks++;
  try {
    return await verifyDiscordToken(
      getHeader(event, "authorization"),
      config.public.discordClientId,
    );
  } finally {
    pendingChecks--;
  }
}
