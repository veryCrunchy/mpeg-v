import { createError } from "h3";
import {
  type PreferenceRecord,
  type PreferenceScope,
  validDiscordId,
} from "../../utils/core/audioVideo";
import { readLimited } from "../../utils/core/streams";

export async function verifySettingsGuild(
  authorization: string,
  guildId: string,
  writing: boolean,
  fetcher: typeof fetch = fetch,
) {
  if (!validDiscordId(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid server." });
  }
  let after = "";
  for (let page = 0; page < 5; page++) {
    const response = await fetcher(
      `https://discord.com/api/v10/users/@me/guilds?limit=200${
        after ? `&after=${after}` : ""
      }`,
      {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw createError({
        statusCode: 403,
        statusMessage: "Reconnect to Discord to access server settings.",
      });
    }
    const guilds = await response.json();
    if (!Array.isArray(guilds)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Server access could not be checked.",
      });
    }
    const guild = guilds.find((item) => item.id === guildId);
    if (guild) {
      const bits = typeof guild.permissions === "string" &&
          /^\d{1,30}$/.test(guild.permissions)
        ? BigInt(guild.permissions)
        : BigInt(0);
      const canManage = guild.owner === true || (bits & BigInt(40)) !== BigInt(0);
      if (writing && !canManage) {
        throw createError({
          statusCode: 403,
          statusMessage:
            "You need Manage Server permission to change server defaults.",
        });
      }
      return canManage;
    }
    if (guilds.length < 200) break;
    const last = guilds.at(-1)?.id;
    if (!validDiscordId(last) || last === after) break;
    after = last;
  }
  throw createError({
    statusCode: 403,
    statusMessage: "You do not have access to this server's settings.",
  });
}
export function preferenceOwner(
  scope: unknown,
  userId: string,
  guildId?: string,
) {
  if (scope === "user") return userId;
  if (scope === "guild" && validDiscordId(guildId)) return guildId;
  throw createError({
    statusCode: 400,
    statusMessage: "Choose personal settings or a server.",
  });
}
export async function servicePreferences(
  base: string,
  token: string,
  scope: PreferenceScope,
  id: string,
  method = "GET",
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<PreferenceRecord> {
  if (!base || !token) {
    throw createError({
      statusCode: 503,
      statusMessage:
        "Saved settings are unavailable. Your current options still work.",
    });
  }
  const signal = AbortSignal.timeout(10_000);
  const response = await fetcher(
    `${base.replace(/\/+$/, "")}/preferences/${scope}/${id}`,
    {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw createError({
      statusCode: response.status === 409 ? 409 : 503,
      statusMessage: response.status === 409
        ? "Settings changed elsewhere. Reload them before saving."
        : "Settings could not be loaded or saved. Please try again.",
    });
  }
  return JSON.parse(
    new TextDecoder().decode(await readLimited(response.body, 4096, signal)),
  );
}
