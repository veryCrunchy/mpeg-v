import {
  Command,
  type CommandContext,
  createBooleanOption,
  createStringOption,
  Declare,
  IgnoreCommand,
  Options,
} from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";
import {
  isVoiceTranslationRunning,
  startVoiceTranslation,
  stopVoiceTranslation,
} from "utils/voiceTranslation.ts";

const options = {
  action: createStringOption({
    description: "Start or stop live voice translation",
    required: true,
    choices: [
      { name: "start", value: "start" },
      { name: "stop", value: "stop" },
    ] as const,
  }),
  target: createStringOption({
    description: "Target language codes, comma-separated",
    required: false,
  }),
  source: createStringOption({
    description: "Source language code, or auto",
    required: false,
  }),
  post_to_discord: createBooleanOption({
    description: "Also post final translations in this Discord channel",
    required: false,
  }),
};

@Declare({
  name: "voice-translate",
  description: "Translate each speaker in your voice channel",
  integrationTypes: ["GuildInstall"],
  ignore: IgnoreCommand.Message,
})
@Options(options)
export default class VoiceTranslateCommand extends Command {
  override async run(ctx: CommandContext<typeof options>) {
    if (!ctx.guildId || !ctx.member) {
      return ctx.write({
        content: "Use this in a server voice channel.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (ctx.options.action === "stop") {
      const stopped = await stopVoiceTranslation(ctx.guildId);
      return ctx.write({
        content: stopped ? "Voice translation stopped." : "Voice translation is not running.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (isVoiceTranslationRunning(ctx.guildId)) {
      return ctx.write({
        content: "Voice translation is already running in this server.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voice = await ctx.member.voice();
    if (!voice?.channelId) {
      return ctx.write({
        content: "Join a voice channel first, then run this again.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const targets = parseLanguageList(ctx.options.target ?? "en");
    if (!targets.length) {
      return ctx.write({
        content: "Give me at least one target language code.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await ctx.deferReply(true);

    try {
      const sessionId = createSessionId(ctx.guildId, voice.channelId);
      const liveUrl = `${translatePublicUrl()}/discord/${encodeURIComponent(sessionId)}`;
      await startVoiceTranslation({
        client: ctx.client,
        guildId: ctx.guildId,
        voiceChannelId: voice.channelId,
        textChannelId: ctx.channelId,
        sourceLanguage: ctx.options.source ?? "auto",
        targetLanguages: targets,
        roomId: sessionId,
        publishToDiscord: Boolean(ctx.options.post_to_discord),
      });

      return ctx.editOrReply({
        content: `Voice translation started for <#${voice.channelId}> -> ${targets.join(", ")}.\nLive captions: ${liveUrl}`,
      });
    } catch (error) {
      await stopVoiceTranslation(ctx.guildId);
      const detail = error instanceof Error ? error.message : String(error);
      ctx.client.logger.error(error);
      return ctx.editOrReply({
        content: `Could not start voice translation: ${detail}`,
      });
    }
  }
}

function createSessionId(guildId: string, channelId: string) {
  const suffix = crypto.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${guildId}-${channelId}-${suffix}`;
}

function translatePublicUrl() {
  return (Deno.env.get("TRANSLATE_PUBLIC_URL") ?? "https://translate.obiente.org")
    .replace(/\/+$/, "");
}

function parseLanguageList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}
