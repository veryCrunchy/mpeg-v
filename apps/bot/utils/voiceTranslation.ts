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

type TranslationPayload = {
  text?: string;
  translations?: Record<string, string>;
  isFinal?: boolean;
};

type VoiceAdapterState = {
  guildId: string;
  methods: DiscordGatewayAdapterLibraryMethods;
  destroyed: boolean;
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
};

const adapters = new Map<string, VoiceAdapterState>();
const sessions = new Map<string, Session>();

const defaultWhisperUrl = "ws://127.0.0.1:8080/ws/transcribe";

export function createSeyfertVoiceAdapter(
  client: UsingClient,
  guildId: string,
): DiscordGatewayAdapterCreator {
  return (methods) => {
    adapters.set(guildId, { guildId, methods, destroyed: false });

    return {
      destroy() {
        const adapter = adapters.get(guildId);
        if (adapter) adapter.destroyed = true;
        adapters.delete(guildId);
      },
      sendPayload(payload: GatewaySendPayload) {
        const shardId = client.calculateShardId(guildId);
        const shard = client.shards.get(shardId);
        if (!shard) return false;

        void shard.send(false, payload);
        return true;
      },
    };
  };
}

export function handleVoiceServerUpdate(
  data: GatewayVoiceServerUpdateDispatchData,
) {
  adapters.get(data.guild_id)?.methods.onVoiceServerUpdate(data);
}

export function handleVoiceStateUpdate(
  data: GatewayVoiceStateUpdateDispatchData,
) {
  if (!data.guild_id) return;
  const adapter = adapters.get(data.guild_id);
  if (!adapter) return;
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
  publishToDiscord?: boolean;
}) {
  await stopVoiceTranslation(options.guildId);

  const connection = joinVoiceChannel({
    guildId: options.guildId,
    channelId: options.voiceChannelId,
    selfDeaf: false,
    selfMute: true,
    daveEncryption: false,
    adapterCreator: createSeyfertVoiceAdapter(options.client, options.guildId),
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

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

  connection.receiver.speaking.on("start", (userId) => {
    void subscribeSpeaker(options.client, session, userId);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    void stopVoiceTranslation(options.guildId);
  });

  return session;
}

export async function stopVoiceTranslation(guildId: string) {
  const session = sessions.get(guildId);
  if (!session) return false;

  sessions.delete(guildId);
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
  const speaker: SpeakerState = {
    userId,
    websocket,
    sequence: 0,
    pcmQueue: [],
    closed: false,
  };
  session.speakers.set(userId, speaker);

  websocket.addEventListener("open", () => {
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
    void publishTranslation(client, session, userId, payload);
  });

  websocket.addEventListener("close", () => {
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
  decoder.on("error", () => closeSpeaker(speaker));
  opus.on("close", () => closeSpeaker(speaker));
  opus.on("error", () => closeSpeaker(speaker));

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
