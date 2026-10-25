import { Authorization } from "@mpeg-v/utils";
import {
  type CommandContext,
  createNumberOption,
  createStringOption,
} from "seyfert";
import { readLimited } from "../../web/utils/core/streams.ts";
import {
  type AudioVideoSettings,
  type PreferenceRecord,
  type PreferenceScope,
  validateAudioVideoPatch,
  validDiscordId,
} from "../../web/utils/core/audioVideo.ts";

export const audioVideoOptions = {
  visualization: createStringOption({
    description: "Audio visualization style",
    choices: ["wave", "filled", "dots", "bars"].map((value) => ({
      name: value,
      value,
    })),
  }),
  color: createStringOption({
    description: "Visualization color, such as #ff893a",
    min_length: 6,
    max_length: 7,
  }),
  background: createStringOption({
    description: "Background color, such as #101313",
    min_length: 6,
    max_length: 7,
  }),
  size: createStringOption({
    description: "Video size: compact 250x100, standard 500x200, wide 960x360",
    choices: ["compact", "standard", "wide"].map((value) => ({
      name: value,
      value,
    })),
  }),
  fps: createNumberOption({
    description: "Frames per second",
    choices: [15, 24, 30].map((value) => ({ name: String(value), value })),
  }),
  bitrate: createNumberOption({
    description: "Audio bitrate in kbps",
    choices: [64, 128, 192, 256].map((value) => ({
      name: String(value),
      value,
    })),
  }),
};
export function audioVideoOverrides(
  options: Record<string, unknown>,
): Partial<AudioVideoSettings> {
  return validateAudioVideoPatch(
    Object.fromEntries(
      Object.keys(audioVideoOptions).filter((key) => options[key] !== undefined)
        .map((key) => [key, options[key]]),
    ),
    false,
  ) as Partial<AudioVideoSettings>;
}
export function settingsOwner(
  ctx: CommandContext,
  scope: PreferenceScope,
  writing: boolean,
) {
  if (scope === "user") return ctx.author.id;
  if (!ctx.guildId) throw new Error("Use server settings inside a server.");
  const permissions = ctx.member?.permissions;
  if (
    writing &&
    (!permissions || typeof permissions === "function" ||
      !permissions.has(["ManageGuild"]))
  ) {
    throw new Error(
      "You need Manage Server permission to change server defaults.",
    );
  }
  return ctx.guildId;
}
export async function preferenceRequest(
  scope: PreferenceScope,
  id: string,
  method = "GET",
  body?: unknown,
): Promise<PreferenceRecord> {
  if (!validDiscordId(id) || !["user", "guild"].includes(scope)) {
    throw new Error("Invalid settings owner.");
  }
  const base = Deno.env.get("STREAM");
  if (!base || !Authorization) {
    throw new Error("Saved settings are unavailable. Try again later.");
  }
  const response = await fetch(
    `${base.replace(/\/+$/, "")}/preferences/${scope}/${id}`,
    {
      method,
      headers: { Authorization, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      response.status === 409
        ? "Settings changed elsewhere. Run the command again."
        : "Saved settings are unavailable. Try again later.",
    );
  }
  if (!response.body) throw new Error("Saved settings are unavailable.");
  return JSON.parse(
    new TextDecoder().decode(await readLimited(response.body, 4096)),
  );
}
