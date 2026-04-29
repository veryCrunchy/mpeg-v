import "opusscript";

import {
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  type DiscordGatewayAdapterCreator,
  type DiscordGatewayAdapterLibraryMethods,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { Buffer } from "node:buffer";
import { GatewayDispatchEvents } from "seyfert/lib/types/index.js";
import type {
  GatewayDispatchPayload,
  GatewaySendPayload,
  GatewayVoiceServerUpdateDispatchData,
  GatewayVoiceStateUpdateDispatchData,
} from "seyfert/lib/types/index.js";
import type { UsingClient } from "seyfert";
import prism from "prism-media";
import { updateTranslationSession } from "utils/translationSessions.ts";

type TranslationPayload = {
  text?: string;
  translations?: Record<string, string>;
  isFinal?: boolean;
};

type VoiceAdapterState = {
  guildId: string;
  methods: DiscordGatewayAdapterLibraryMethods;
  destroyed: boolean;
  gotServerUpdate: boolean;
  gotOwnStateUpdate: boolean;
  botUserId?: string;
  logger: UsingClient["logger"];
};

type ShardRuntime = {
  send(withPresence: boolean, payload: GatewaySendPayload): void | Promise<void>;
};

type VoiceRuntimeClient = UsingClient & {
  me?: { id?: string };
  calculateShardId(guildId: string): number;
  shards: Map<number, ShardRuntime>;
};

type SpeakerState = {
  userId: string;
  websocket: WebSocket;
  decoder?: prism.opus.Decoder;
  sequence: number;
  pcmQueue: Buffer[];
  flushTimer?: number;
  closed: boolean;
};

type Session = {
  guildId: string;
  channelId: string;
  textChannelId: string;
  connection: VoiceConnection;
  speakers: Map<string, SpeakerState>;
  sourceLanguage: string;
  targetLanguages: string[];
  roomId: string;
  publishToDiscord: boolean;
  heartbeatTimer?: number;
};

const adapters = new Map<string, VoiceAdapterState>();
const sessions = new Map<string, Session>();

const defaultWhisperUrl = "ws://127.0.0.1:8080/ws/transcribe";

export function createSeyfertVoiceAdapter(
  client: UsingClient,
  guildId: string,
): DiscordGatewayAdapterCreator {
  const voiceClient = client as VoiceRuntimeClient;
  return (methods) => {
    adapters.set(guildId, {
      guildId,
      methods,
      destroyed: false,
      gotServerUpdate: false,
      gotOwnStateUpdate: false,
      botUserId: voiceClient.me?.id,
      logger: client.logger,
    });
    client.logger.info(`[voice-translate] adapter created guild=${guildId}`);

    return {
      destroy() {
        const adapter = adapters.get(guildId);
        if (adapter) adapter.destroyed = true;
        adapters.delete(guildId);
        client.logger.info(`[voice-translate] adapter destroyed guild=${guildId}`);
      },
      sendPayload(payload: GatewaySendPayload) {
        const shardId = voiceClient.calculateShardId(guildId);
        const shard = voiceClient.shards.get(shardId);
        if (!shard) {
          client.logger.warn(`[voice-translate] missing shard guild=${guildId} shard=${shardId}`);
          return false;
        }

        void shard.send(false, payload);
        client.logger.info(`[voice-translate] gateway payload sent guild=${guildId} shard=${shardId} op=${payload.op}`);
        return true;
      },
    };
  };
}

export function handleVoiceServerUpdate(
  data: GatewayVoiceServerUpdateDispatchData,
) {
  const adapter = adapters.get(data.guild_id);
  if (!adapter) return;
  adapter.gotServerUpdate = true;
  adapter.logger.info(`[voice-translate] VOICE_SERVER_UPDATE guild=${data.guild_id} endpoint=${data.endpoint}`);
  adapter.methods.onVoiceServerUpdate(data);
}

export function handleVoiceStateUpdate(
  data: GatewayVoiceStateUpdateDispatchData,
) {
  if (!data.guild_id) return;
  const adapter = adapters.get(data.guild_id);
  if (!adapter) return;
  const isBotState = !adapter.botUserId || data.user_id === adapter.botUserId;
  if (isBotState) {
    adapter.gotOwnStateUpdate = true;
    adapter.logger.info(`[voice-translate] BOT VOICE_STATE_UPDATE guild=${data.guild_id} user=${data.user_id} channel=${data.channel_id ?? "none"} session=${data.session_id ? "yes" : "no"}`);
  }
  adapter.methods.onVoiceStateUpdate(data);
}

export function handleVoiceGatewayPayload(packet: GatewayDispatchPayload) {
  if (packet.t === GatewayDispatchEvents.VoiceServerUpdate) {
    handleVoiceServerUpdate(packet.d as GatewayVoiceServerUpdateDispatchData);
  }

  if (packet.t === GatewayDispatchEvents.VoiceStateUpdate) {
    handleVoiceStateUpdate(packet.d as GatewayVoiceStateUpdateDispatchData);
  }
}

export async function startVoiceTranslation(options: {
  client: UsingClient;
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  sourceLanguage?: string;
  targetLanguages: string[];
  roomId: string;
  sessionId: string;
  publishToDiscord?: boolean;
}) {
  await stopVoiceTranslation(options.guildId);
  options.client.logger.info(
    `[voice-translate] starting guild=${options.guildId} voice=${options.voiceChannelId} room=${options.roomId} targets=${options.targetLanguages.join(",")}`,
  );

  const connection = joinVoiceChannel({
    guildId: options.guildId,
    channelId: options.voiceChannelId,
    selfDeaf: false,
    selfMute: true,
    daveEncryption: true,
    debug: true,
    adapterCreator: createSeyfertVoiceAdapter(options.client, options.guildId),
  });

  const session: Session = {
    guildId: options.guildId,
    channelId: options.voiceChannelId,
    textChannelId: options.textChannelId,
    connection,
    speakers: new Map(),
    sourceLanguage: normalizeLanguage(options.sourceLanguage ?? "auto"),
    targetLanguages: options.targetLanguages.map(normalizeLanguage).filter(Boolean),
    roomId: options.roomId,
    publishToDiscord: options.publishToDiscord ?? false,
  };
  sessions.set(options.guildId, session);
  void updateTranslationSession(options.sessionId, {
    status: "connected",
    status_message: "Bot joined the Discord voice channel; waiting for voice receiver readiness.",
  });
  session.heartbeatTimer = setInterval(() => {
    void updateTranslationSession(options.sessionId, {
      status: connection.state.status === VoiceConnectionStatus.Ready ? "ready" : "connected",
      status_message: `Voice connection state: ${connection.state.status}`,
    });
  }, 15_000) as unknown as number;

  connection.on("stateChange", (oldState, newState) => {
    options.client.logger.info(
      `[voice-translate] connection state guild=${options.guildId} ${oldState.status} -> ${newState.status}`,
    );
    options.client.logger.debug(
      `[voice-translate] state detail guild=${options.guildId} ${safeStringifyVoiceState(newState)}`,
    );
  });

  connection.on("error", (error) => {
    options.client.logger.error(error);
  });

  (connection as unknown as { on(event: "debug", listener: (message: string) => void): void })
    .on("debug", (message) => {
      options.client.logger.debug(`[voice-translate] ${message}`);
    });

  void entersState(connection, VoiceConnectionStatus.Ready, 30_000)
    .then(() => {
      options.client.logger.info(`[voice-translate] ready guild=${options.guildId} room=${options.roomId}`);
      void updateTranslationSession(options.sessionId, {
        status: "ready",
        status_message: "Discord voice receiver is ready.",
      });
    })
    .catch((error) => {
      const adapter = adapters.get(options.guildId);
      options.client.logger.error(error);
      options.client.logger.warn(
        `[voice-translate] voice connection did not become ready guild=${options.guildId} gotServer=${adapter?.gotServerUpdate ?? false} gotOwnState=${adapter?.gotOwnStateUpdate ?? false}. If gotServer/gotOwnState are true, check outbound UDP/network access from the bot host.`,
      );
      void updateTranslationSession(options.sessionId, {
        status: "degraded",
        status_message:
          `Discord voice receiver did not become ready. gotServer=${adapter?.gotServerUpdate ?? false}, gotOwnState=${adapter?.gotOwnStateUpdate ?? false}.`,
      });
    });

  connection.receiver.speaking.on("start", (userId) => {
    void subscribeSpeaker(options.client, session, userId);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    options.client.logger.warn(`[voice-translate] disconnected guild=${options.guildId}`);
    void stopVoiceTranslation(options.guildId);
  });

  return session;
}

export async function stopVoiceTranslation(guildId: string) {
  const session = sessions.get(guildId);
  if (!session) return false;

  sessions.delete(guildId);
  console.log(`[voice-translate] stopping guild=${guildId}`);
  if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
  void updateTranslationSession(session.roomId, {
    status: "stopped",
    status_message: "Voice translation stopped.",
  });
  for (const speaker of session.speakers.values()) {
    closeSpeaker(speaker);
  }
  session.connection.destroy();
  adapters.delete(guildId);
  return true;
}

export function isVoiceTranslationRunning(guildId: string) {
  return sessions.has(guildId);
}

async function subscribeSpeaker(
  client: UsingClient,
  session: Session,
  userId: string,
) {
  if (session.speakers.has(userId)) return;

  const websocket = new WebSocket(translationWebSocketUrl());
  client.logger.info(`[voice-translate] speaker start guild=${session.guildId} user=${userId}`);
  const speaker: SpeakerState = {
    userId,
    websocket,
    sequence: 0,
    pcmQueue: [],
    closed: false,
  };
  session.speakers.set(userId, speaker);

  websocket.addEventListener("open", () => {
    client.logger.info(`[voice-translate] whisper socket open user=${userId} room=${session.roomId}`);
    websocket.send(JSON.stringify({
      type: "start",
      channel_id: `${session.guildId}:${userId}`,
      language: session.sourceLanguage === "auto" ? undefined : session.sourceLanguage,
      target_languages: session.targetLanguages,
      room_id: session.roomId,
      peer_id: userId,
      peer_label: `<@${userId}>`,
    }));
    websocket.send(JSON.stringify({
      type: "join_room",
      room_id: session.roomId,
      peer_id: userId,
      peer_label: `<@${userId}>`,
    }));
    flushPcm(speaker);
  });

  websocket.addEventListener("message", (event) => {
    const payload = safeJson<TranslationPayload>(event.data);
    if (!payload?.isFinal) return;
    client.logger.info(`[voice-translate] final transcript user=${userId}`);
    void publishTranslation(client, session, userId, payload);
  });

  websocket.addEventListener("error", (event) => {
    client.logger.error(`[voice-translate] whisper socket error user=${userId} ${JSON.stringify(event)}`);
  });

  websocket.addEventListener("close", () => {
    client.logger.info(`[voice-translate] whisper socket closed user=${userId}`);
    session.speakers.delete(userId);
  });

  const opus = session.connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterInactivity,
      duration: 1_000,
    },
  });

  const decoder = new prism.opus.Decoder({
    rate: 48_000,
    channels: 2,
    frameSize: 960,
  });
  speaker.decoder = decoder;

  decoder.on("data", (chunk: Buffer) => {
    enqueuePcm(speaker, downmixStereoPcm16(chunk));
  });

  decoder.on("close", () => closeSpeaker(speaker));
  decoder.on("error", (error) => {
    client.logger.error(error);
    closeSpeaker(speaker);
  });
  opus.on("close", () => closeSpeaker(speaker));
  opus.on("error", (error) => {
    client.logger.error(error);
    closeSpeaker(speaker);
  });

  opus.pipe(decoder);
}

function enqueuePcm(speaker: SpeakerState, chunk: Buffer) {
  if (speaker.closed) return;
  if (!chunk.length) return;

  speaker.pcmQueue.push(chunk);
  if (speaker.websocket.readyState !== WebSocket.OPEN) return;
  if (speaker.flushTimer) return;

  speaker.flushTimer = setTimeout(() => {
    speaker.flushTimer = undefined;
    flushPcm(speaker);
  }, 250);
}

function flushPcm(speaker: SpeakerState) {
  if (speaker.closed) return;
  if (speaker.websocket.readyState !== WebSocket.OPEN) return;
  if (!speaker.pcmQueue.length) return;

  const pcm = Buffer.concat(speaker.pcmQueue);
  speaker.pcmQueue = [];
  speaker.websocket.send(JSON.stringify({
    type: "chunk",
    sequence: speaker.sequence++,
    mime_type: "audio/pcm",
    sample_rate: 48_000,
    data: pcm.toString("base64"),
  }));
}

function closeSpeaker(speaker: SpeakerState) {
  if (speaker.closed) return;
  speaker.closed = true;
  if (speaker.flushTimer) clearTimeout(speaker.flushTimer);
  speaker.decoder?.destroy();
  if (speaker.websocket.readyState === WebSocket.OPEN) {
    speaker.websocket.send(JSON.stringify({ type: "stop" }));
  }
  speaker.websocket.close();
}

async function publishTranslation(
  client: UsingClient,
  session: Session,
  userId: string,
  payload: TranslationPayload,
) {
  const text = firstTranslation(payload) ?? payload.text?.trim();
  if (!text) return;
  if (!session.publishToDiscord) return;

  await client.messages.write(session.textChannelId, {
    content: `<@${userId}>: ${text}`,
  });
}

function firstTranslation(payload: TranslationPayload) {
  const translations = payload.translations ?? {};
  for (const lang of Object.keys(translations).sort()) {
    const text = translations[lang]?.trim();
    if (text) return text;
  }
  return undefined;
}

function downmixStereoPcm16(input: Buffer) {
  const frameCount = Math.floor(input.length / 4);
  const output = Buffer.allocUnsafe(frameCount * 2);

  for (let frame = 0; frame < frameCount; frame++) {
    const offset = frame * 4;
    const left = input.readInt16LE(offset);
    const right = input.readInt16LE(offset + 2);
    output.writeInt16LE((left + right) >> 1, frame * 2);
  }

  return output;
}

function translationWebSocketUrl() {
  return Deno.env.get("WHISPER_WS") ?? Deno.env.get("TRANSLATION_WS") ??
    defaultWhisperUrl;
}

function normalizeLanguage(value: string) {
  return value.trim().toLowerCase();
}

function safeJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function safeStringifyVoiceState(value: unknown) {
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "function") return undefined;
      if (nested instanceof Map) return Object.fromEntries(nested.entries());
      if (nested instanceof Set) return [...nested.values()];
      return nested;
    });
  } catch {
    return String(value);
  }
}
