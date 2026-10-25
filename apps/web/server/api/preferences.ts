import { discordIdentity } from "../utils/discord";
import {
  preferenceOwner,
  servicePreferences,
  verifySettingsGuild,
} from "../utils/preferences";
import { rateLimit, readBoundedBody } from "../utils/files";
import {
  type PreferenceScope,
  resolveAudioVideo,
  validateAudioVideoPatch,
  validDiscordId,
} from "../../utils/core/audioVideo";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "no-store");
  if (!["GET", "PATCH", "DELETE"].includes(event.method)) {
    throw createError({
      statusCode: 405,
      statusMessage: "Unsupported settings method.",
    });
  }
  const identity = await discordIdentity(event);
  rateLimit(`preferences:${identity.id}`, 30);
  const config = useRuntimeConfig(event), query = getQuery(event);
  const guildId = typeof query.guildId === "string" ? query.guildId : undefined;
  if (query.guildId !== undefined && !validDiscordId(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid server." });
  }
  const service = (
    scope: PreferenceScope,
    id: string,
    method = "GET",
    body?: unknown,
  ) =>
    servicePreferences(
      config.preferencesUrl,
      config.preferencesToken,
      scope,
      id,
      method,
      body,
    );
  let scope: PreferenceScope = "user", body;
  if (event.method !== "GET") {
    try {
      body = JSON.parse((await readBoundedBody(event, 4096)).toString("utf8"));
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid settings request.",
      });
    }
    preferenceOwner(body?.scope, identity.id, guildId);
    scope = body.scope;
    if (
      !(body.revision === null ||
        typeof body.revision === "string" &&
          /^[a-f\d-]{36}$/i.test(body.revision))
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Reload settings before saving.",
      });
    }
    if (event.method === "PATCH") {
      try {
        body.changes = validateAudioVideoPatch(body.changes);
      } catch (error) {
        throw createError({
          statusCode: 400,
          statusMessage: (error as Error).message,
        });
      }
    }
  }
  // Verify membership for reads and current management permissions before every guild mutation.
  const canManageServer = guildId
    ? await verifySettingsGuild(
      identity.authorization,
      guildId,
      event.method !== "GET" && scope === "guild",
    )
    : false;
  if (event.method !== "GET") {
    await service(
      scope,
      preferenceOwner(scope, identity.id, guildId),
      event.method,
      { changes: body.changes, revision: body.revision },
    );
  }
  const [personal, server] = await Promise.all([
    service("user", identity.id),
    guildId ? service("guild", guildId) : Promise.resolve(null),
  ]);
  return {
    personal,
    server,
    canManageServer,
    effective: resolveAudioVideo(server?.values, personal.values),
  };
});
