import "opusscript";
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
import {
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  type DiscordGatewayAdapterCreator,
  type DiscordGatewayAdapterLibraryMethods,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";

type TranslationPayload = {
  type?: string;
  channel_id?: string;
  text?: string;
  fullText?: string;
  spokenAt?: string;
  language?: string;
  sequence?: number;
  translations?: Record<string, string | {
    primary?: string;
    detectedLanguage?: string;
    alternatives?: string[];
  }>;
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
  logger: UsingClient["logger"];
  decoder?: prism.opus.Decoder;
  opus?: NodeJS.ReadableStream;
  sequence: number;
  pcmQueue: Buffer[];
  flushTimer?: number;
  keepaliveTimer?: number;
  finalizeTimer?: number;
  audioActive: boolean;
  opusPackets: number;
  decodedChunks: number;
  sentChunks: number;
  sentBytes: number;
  queuedBytes: number;
  closed: boolean;
  lastFinalizeAt?: number;
  debugPcmChunks: Buffer[];
  dumpCount: number;
  liveMessageId?: string;
  liveMessageStartedAt?: number;
  liveMessageLastEditAt?: number;
  liveMessageContext?: string;
  liveMessagePendingContent?: string;
  liveMessageEditTimer?: number;
  liveMessageClearTimer?: number;
  liveMessagePublishQueue?: Promise<void>;
  pendingFinalMessages?: Map<string, string>;
};

type SpeakerProfile = {
  label: string;
  avatarUrl?: string;
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
  speakerProfiles: Map<string, SpeakerProfile>;
};

const adapters = new Map<string, VoiceAdapterState>();
const sessions = new Map<string, Session>();

const defaultWhisperUrl = "ws://127.0.0.1:8080/ws/transcribe";
const liveMessageEditIntervalMs = 1_400;
const liveMessageMaxAgeMs = 15_000;
const pendingFinalTranslationMs = 20_000;
const discordContentLimit = 1_900;

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
    speakerProfiles: new Map(),
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
  connection.receiver.speaking.on("end", (userId) => {
    const speaker = session.speakers.get(userId);
    if (!speaker || speaker.closed) return;
    scheduleSpeakerFinalize(speaker, 1_200);
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
  const profile = await resolveSpeakerProfile(client, session.guildId, userId);
  session.speakerProfiles.set(userId, profile);
  const existing = session.speakers.get(userId);
  if (existing && !existing.closed) {
    client.logger.info(`[voice-translate] speaker resume guild=${session.guildId} user=${userId}`);
    subscribeSpeakerAudio(client, session, existing);
    return;
  }

  const websocket = new WebSocket(translationWebSocketUrl());
  client.logger.info(`[voice-translate] speaker start guild=${session.guildId} user=${userId}`);
  const speaker: SpeakerState = {
    userId,
    websocket,
    logger: client.logger,
    sequence: 0,
    pcmQueue: [],
    audioActive: false,
    opusPackets: 0,
    decodedChunks: 0,
    sentChunks: 0,
    sentBytes: 0,
    queuedBytes: 0,
    closed: false,
    debugPcmChunks: [],
    dumpCount: 0,
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
      peer_label: profile.label,
      peer_avatar_url: profile.avatarUrl,
    }));
    websocket.send(JSON.stringify({
      type: "join_room",
      room_id: session.roomId,
      peer_id: userId,
      peer_label: profile.label,
      peer_avatar_url: profile.avatarUrl,
    }));
    startSpeakerKeepalive(speaker);
    flushPcm(speaker);
  });

  websocket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      client.logger.info(
        `[voice-translate] whisper message user=${userId} non-text=${typeof event.data}`,
      );
      return;
    }

    const payload = safeJson<TranslationPayload>(event.data);
    if (!payload) {
      client.logger.info(
        `[voice-translate] whisper message user=${userId} unparsable=${event.data.slice(0, 160)}`,
      );
      return;
    }
    const type = typeof payload.type === "string" ? payload.type : undefined;
    if (type && type !== "pong") {
      client.logger.info(
        `[voice-translate] whisper message user=${userId} type=${type} body=${event.data.slice(0, 160)}`,
      );
    }
    if (type !== "transcript") return;
    const channelId = typeof payload.channel_id === "string" ? payload.channel_id : undefined;
    if (channelId && channelId !== `${session.guildId}:${userId}`) return;
    if (payload.isFinal) {
      client.logger.info(`[voice-translate] final transcript user=${userId} text=${(payload.text || payload.fullText)?.slice(0, 80) ?? ""}`);
    }
    queueDiscordTranscript(client, session, speaker, payload);
  });

  websocket.addEventListener("error", (event) => {
    client.logger.error(`[voice-translate] whisper socket error user=${userId} ${JSON.stringify(event)}`);
  });

  websocket.addEventListener("close", () => {
    client.logger.info(
      `[voice-translate] whisper socket closed user=${userId} opus=${speaker.opusPackets} decoded=${speaker.decodedChunks} sent=${speaker.sentChunks} bytes=${speaker.sentBytes}`,
    );
    if (speaker.keepaliveTimer) clearInterval(speaker.keepaliveTimer);
    speaker.closed = true;
    session.speakers.delete(userId);
  });

  subscribeSpeakerAudio(client, session, speaker);
}

async function resolveSpeakerProfile(
  client: UsingClient,
  guildId: string,
  userId: string,
): Promise<SpeakerProfile> {
  const fallback: SpeakerProfile = { label: `Discord ${userId.slice(-4)}` };
  const token = client.rest.options.token;
  if (!token) return fallback;

  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return fallback;

    const member = await response.json() as {
      nick?: string | null;
      avatar?: string | null;
      user?: {
        id?: string;
        username?: string;
        global_name?: string | null;
        avatar?: string | null;
        discriminator?: string;
      };
    };

    const label =
      member.nick?.trim() ||
      member.user?.global_name?.trim() ||
      member.user?.username?.trim() ||
      fallback.label;

    const avatarUrl = member.avatar
      ? guildMemberAvatarUrl(guildId, userId, member.avatar)
      : member.user?.avatar
      ? userAvatarUrl(userId, member.user.avatar)
      : defaultAvatarUrl(member.user?.discriminator, userId);

    return { label, avatarUrl };
  } catch {
    return fallback;
  }
}

function guildMemberAvatarUrl(guildId: string, userId: string, avatar: string): string {
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatar}.${ext}?size=128`;
}

function userAvatarUrl(userId: string, avatar: string): string {
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=128`;
}

function defaultAvatarUrl(discriminator: string | undefined, userId: string): string {
  const legacy = Number(discriminator);
  const index = Number.isFinite(legacy) && legacy > 0
    ? legacy % 5
    : (Number(BigInt(userId) >> 22n) % 6);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function subscribeSpeakerAudio(
  client: UsingClient,
  session: Session,
  speaker: SpeakerState,
) {
  if (speaker.closed || speaker.audioActive) return;
  speaker.audioActive = true;

  const opus = session.connection.receiver.subscribe(speaker.userId, {
    end: {
      behavior: EndBehaviorType.Manual,
    },
  });
  speaker.opus = opus;

  const decoder = new prism.opus.Decoder({
    rate: 16_000,
    channels: 1,
    frameSize: 320,
  });
  speaker.decoder = decoder;

  opus.on("data", (chunk: Buffer) => {
    speaker.opusPackets++;
    if (speaker.opusPackets === 1 || speaker.opusPackets % 100 === 0) {
      client.logger.info(
        `[voice-translate] opus packets user=${speaker.userId} count=${speaker.opusPackets} last_bytes=${chunk.length}`,
      );
    }
  });

  decoder.on("data", (chunk: Buffer) => {
    speaker.decodedChunks++;
    const mono16k = chunk;
    if (speaker.decodedChunks === 1 || speaker.decodedChunks % 100 === 0) {
      const { rms, peak } = pcm16Stats(mono16k);
      client.logger.info(
        `[voice-translate] decoded pcm user=${speaker.userId} chunks=${speaker.decodedChunks} mono16k_bytes=${mono16k.length} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)}`,
      );
    }
    enqueuePcm(speaker, mono16k);
  });

  decoder.on("close", () => {
    speaker.audioActive = false;
    speaker.decoder = undefined;
    client.logger.info(`[voice-translate] decoder closed user=${speaker.userId}`);
  });
  decoder.on("error", (error) => {
    client.logger.error(error);
    speaker.audioActive = false;
    speaker.decoder = undefined;
  });
  opus.on("close", () => {
    speaker.audioActive = false;
    client.logger.info(`[voice-translate] opus stream closed user=${speaker.userId}`);
    flushPcm(speaker);
  });
  opus.on("error", (error) => {
    client.logger.error(error);
    speaker.audioActive = false;
  });

  opus.pipe(decoder);
}

function enqueuePcm(speaker: SpeakerState, chunk: Buffer) {
  if (speaker.closed) return;
  if (!chunk.length) return;

  speaker.pcmQueue.push(chunk);
  speaker.queuedBytes += chunk.length;
  if (speaker.websocket.readyState !== WebSocket.OPEN) {
    if (speaker.pcmQueue.length === 1 || speaker.pcmQueue.length % 25 === 0) {
      speaker.logger.debug(
        `[voice-translate] queue waiting user=${speaker.userId} readyState=${speaker.websocket.readyState} chunks=${speaker.pcmQueue.length} bytes=${speaker.queuedBytes}`,
      );
    }
    return;
  }

  if (speaker.pcmQueue.length >= 5 || speaker.queuedBytes >= 10_000) {
    flushPcm(speaker);
    return;
  }

  if (speaker.flushTimer) return;

  speaker.flushTimer = setTimeout(() => {
    speaker.flushTimer = undefined;
    if (speaker.pcmQueue.length > 0) {
      speaker.logger.debug(
        `[voice-translate] flush timer fired user=${speaker.userId} queued_chunks=${speaker.pcmQueue.length} queued_bytes=${speaker.queuedBytes}`,
      );
    }
    flushPcm(speaker);
  }, 100);
}

function flushPcm(speaker: SpeakerState) {
  if (speaker.closed) return;
  if (speaker.websocket.readyState !== WebSocket.OPEN) {
    speaker.logger.debug(
      `[voice-translate] flush skipped user=${speaker.userId} readyState=${speaker.websocket.readyState} queued_chunks=${speaker.pcmQueue.length} queued_bytes=${speaker.queuedBytes}`,
    );
    return;
  }
  if (!speaker.pcmQueue.length) return;

  const pcm = Buffer.concat(speaker.pcmQueue);
  speaker.pcmQueue = [];
  speaker.queuedBytes = 0;
  if (debugDumpDir()) {
    speaker.debugPcmChunks.push(pcm);
  }
  speaker.sentChunks++;
  speaker.sentBytes += pcm.length;
  speaker.websocket.send(JSON.stringify({
    type: "chunk",
    sequence: speaker.sequence++,
    mime_type: "audio/pcm",
    sample_rate: 16_000,
    data: pcm.toString("base64"),
  }));
  if (speaker.sentChunks === 1 || speaker.sentChunks % 20 === 0) {
    const { rms, peak } = pcm16Stats(pcm);
    speaker.logger.info(
      `[voice-translate] sent pcm user=${speaker.userId} chunks=${speaker.sentChunks} bytes=${speaker.sentBytes} last_bytes=${pcm.length} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)}`,
    );
  }
}

function closeSpeaker(speaker: SpeakerState) {
  if (speaker.closed) return;
  speaker.closed = true;
  if (speaker.flushTimer) clearTimeout(speaker.flushTimer);
  if (speaker.keepaliveTimer) clearInterval(speaker.keepaliveTimer);
  if (speaker.finalizeTimer) clearTimeout(speaker.finalizeTimer);
  if (speaker.liveMessageEditTimer) clearTimeout(speaker.liveMessageEditTimer);
  if (speaker.liveMessageClearTimer) clearTimeout(speaker.liveMessageClearTimer);
  speaker.decoder?.destroy();
  if (speaker.opus && "destroy" in speaker.opus && typeof speaker.opus.destroy === "function") {
    speaker.opus.destroy();
  }
  if (speaker.websocket.readyState === WebSocket.OPEN) {
    speaker.websocket.send(JSON.stringify({ type: "stop" }));
  }
  speaker.websocket.close();
}

function requestSpeakerFinalize(speaker: SpeakerState) {
  if (speaker.closed) return;
  if (speaker.websocket.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (speaker.lastFinalizeAt && now - speaker.lastFinalizeAt < 1000) return;
  speaker.lastFinalizeAt = now;
  void dumpSpeakerAudio(speaker, "finalize");
  speaker.websocket.send(JSON.stringify({ type: "finalize", ts: now }));
}

function scheduleSpeakerFinalize(speaker: SpeakerState, delayMs: number) {
  if (speaker.closed) return;
  if (speaker.finalizeTimer) clearTimeout(speaker.finalizeTimer);
  speaker.finalizeTimer = setTimeout(() => {
    speaker.finalizeTimer = undefined;
    flushPcm(speaker);
    requestSpeakerFinalize(speaker);
  }, delayMs);
}

function startSpeakerKeepalive(speaker: SpeakerState) {
  if (speaker.keepaliveTimer) clearInterval(speaker.keepaliveTimer);
  speaker.keepaliveTimer = setInterval(() => {
    if (speaker.closed || speaker.websocket.readyState !== WebSocket.OPEN) return;
    speaker.websocket.send(JSON.stringify({ type: "ping", ts: Date.now() }));
  }, 15_000) as unknown as number;
}

function queueDiscordTranscript(
  client: UsingClient,
  session: Session,
  speaker: SpeakerState,
  payload: TranslationPayload,
) {
  speaker.liveMessagePublishQueue = (speaker.liveMessagePublishQueue ?? Promise.resolve())
    .then(() => publishDiscordTranscript(client, session, speaker, payload))
    .catch((error) => {
      client.logger.error(error);
    });
}

async function publishDiscordTranscript(
  client: UsingClient,
  session: Session,
  speaker: SpeakerState,
  payload: TranslationPayload,
) {
  if (!session.publishToDiscord) return;
  const message = discordTranscriptMessage(session, speaker.userId, payload);
  if (!message) return;
  const finalKey = payload.isFinal ? transcriptFinalKey(payload) : "";

  if (payload.isFinal && message.hasTranslations && finalKey) {
    const pendingMessageId = speaker.pendingFinalMessages?.get(finalKey);
    if (pendingMessageId) {
      await editDiscordMessage(client, session, pendingMessageId, message.content);
      speaker.pendingFinalMessages?.delete(finalKey);
      return;
    }
    if (speaker.liveMessageId) {
      await client.messages.write(session.textChannelId, {
        content: message.content,
      });
      return;
    }
  }

  if (speaker.liveMessageClearTimer) {
    clearTimeout(speaker.liveMessageClearTimer);
    speaker.liveMessageClearTimer = undefined;
  }

  if (!payload.isFinal && liveMessageExpired(speaker)) {
    clearActiveLiveMessage(speaker);
  }

  if (!payload.isFinal && speaker.liveMessageId && speaker.liveMessageContext) {
    const contextChange = liveContextChange(speaker.liveMessageContext, message.contextText);
    if (contextChange === "same") return;
    if (contextChange === "new") {
      clearActiveLiveMessage(speaker);
    }
  }

  if (!speaker.liveMessageId) {
    const sent = await client.messages.write(session.textChannelId, {
      content: message.content,
    });
    speaker.liveMessageId = sent.id;
    speaker.liveMessageStartedAt = Date.now();
    speaker.liveMessageLastEditAt = Date.now();
    speaker.liveMessageContext = message.contextText;
    finishLiveMessage(speaker, payload, message, sent.id, finalKey);
    return;
  }

  const editNow = payload.isFinal ||
    !speaker.liveMessageLastEditAt ||
    Date.now() - speaker.liveMessageLastEditAt >= liveMessageEditIntervalMs;

  if (editNow) {
    clearPendingLiveEdit(speaker);
    await editLiveDiscordMessage(client, session, speaker, message.content);
    speaker.liveMessageContext = message.contextText;
    finishLiveMessage(speaker, payload, message, speaker.liveMessageId, finalKey);
    return;
  }

  speaker.liveMessagePendingContent = message.content;
  speaker.liveMessageContext = message.contextText;
  if (!speaker.liveMessageEditTimer) {
    const delay = Math.max(0, liveMessageEditIntervalMs - (Date.now() - (speaker.liveMessageLastEditAt ?? 0)));
    speaker.liveMessageEditTimer = setTimeout(() => {
      speaker.liveMessageEditTimer = undefined;
      const pending = speaker.liveMessagePendingContent;
      speaker.liveMessagePendingContent = undefined;
      if (!pending || !speaker.liveMessageId || speaker.closed) return;
      void editLiveDiscordMessage(client, session, speaker, pending);
    }, delay) as unknown as number;
  }
}

function clearPendingLiveEdit(speaker: SpeakerState) {
  if (speaker.liveMessageEditTimer) {
    clearTimeout(speaker.liveMessageEditTimer);
    speaker.liveMessageEditTimer = undefined;
  }
  speaker.liveMessagePendingContent = undefined;
}

async function editLiveDiscordMessage(
  client: UsingClient,
  session: Session,
  speaker: SpeakerState,
  content: string,
) {
  if (!speaker.liveMessageId) return;
  try {
    await editDiscordMessage(client, session, speaker.liveMessageId, content);
    speaker.liveMessageLastEditAt = Date.now();
  } catch (error) {
    clearActiveLiveMessage(speaker);
    client.logger.error(error);
  }
}

async function editDiscordMessage(
  client: UsingClient,
  session: Session,
  messageId: string,
  content: string,
) {
  await client.messages.edit(messageId, session.textChannelId, {
    content,
  });
}

function finishLiveMessage(
  speaker: SpeakerState,
  payload: TranslationPayload,
  message: DiscordTranscriptMessage,
  messageId: string | undefined,
  finalKey: string,
) {
  if (!payload.isFinal) return;

  if (message.waitingForTranslation && messageId && finalKey) {
    speaker.pendingFinalMessages ??= new Map();
    speaker.pendingFinalMessages.set(finalKey, messageId);
    setTimeout(() => {
      speaker.pendingFinalMessages?.delete(finalKey);
    }, pendingFinalTranslationMs);
  }

  clearActiveLiveMessage(speaker);
}

function liveMessageExpired(speaker: SpeakerState): boolean {
  return !!speaker.liveMessageId &&
    !!speaker.liveMessageStartedAt &&
    Date.now() - speaker.liveMessageStartedAt >= liveMessageMaxAgeMs;
}

function clearActiveLiveMessage(speaker: SpeakerState) {
  speaker.liveMessageId = undefined;
  speaker.liveMessageStartedAt = undefined;
  speaker.liveMessageLastEditAt = undefined;
  speaker.liveMessageContext = undefined;
  clearPendingLiveEdit(speaker);
}

type DiscordTranscriptMessage = {
  content: string;
  contextText: string;
  hasTranslations: boolean;
  waitingForTranslation: boolean;
};

function discordTranscriptMessage(
  session: Session,
  userId: string,
  payload: TranslationPayload,
) {
  const original = payload.fullText?.trim() || payload.text?.trim() || "";
  if (isJunkTranscript(original)) return undefined;

  const translations = allTranslations(payload);
  const lines = translations.length
    ? translations.map((item) => `${item.lang.toUpperCase()}: ${item.text}`)
    : [original];
  const text = lines.join("\n");
  if (isJunkTranscript(text)) return undefined;

  const hasDifferentTranslation = translations.some((item) => normalizeComparableText(item.text) !== normalizeComparableText(original));
  const sourceLine = hasDifferentTranslation
    ? `\n-# ${original}${spokenAtSuffix(payload.spokenAt)}`
    : "";
  const content = clampDiscordContent(`<@${userId}>: ${text}${sourceLine}`);
  return {
    content,
    contextText: original,
    hasTranslations: translations.length > 0,
    waitingForTranslation: payload.isFinal === true && session.targetLanguages.length > 0 && translations.length === 0,
  };
}

function liveContextChange(previous: string, next: string): "same" | "extended" | "new" {
  const prev = normalizeComparableText(previous);
  const current = normalizeComparableText(next);
  if (!prev || !current) return "new";
  if (prev === current) return "same";
  if (current.length <= prev.length) return "new";
  if (current.startsWith(prev)) return "extended";

  const prevWords = prev.split(/\s+/).filter(Boolean);
  const currentWords = current.split(/\s+/).filter(Boolean);
  if (prevWords.length === 0 || currentWords.length <= prevWords.length) return "new";

  const overlapLimit = Math.min(prevWords.length, currentWords.length);
  for (let overlap = overlapLimit; overlap >= Math.min(3, overlapLimit); overlap--) {
    const prevTail = prevWords.slice(-overlap).join(" ");
    const currentHead = currentWords.slice(0, overlap).join(" ");
    if (prevTail === currentHead) return "extended";
  }

  return "new";
}

function transcriptFinalKey(payload: TranslationPayload): string {
  if (typeof payload.sequence === "number") return `seq:${payload.sequence}`;
  if (payload.spokenAt) return `spoken:${payload.spokenAt}`;
  const text = payload.fullText?.trim() || payload.text?.trim() || "";
  return text ? `text:${normalizeComparableText(text).slice(0, 120)}` : "";
}

function clampDiscordContent(content: string): string {
  if (content.length <= discordContentLimit) return content;
  return `${content.slice(0, discordContentLimit - 3)}...`;
}

function spokenAtSuffix(spokenAt: string | undefined): string {
  if (!spokenAt) return "";
  const ms = Date.parse(spokenAt);
  if (!Number.isFinite(ms)) return "";
  return ` · said <t:${Math.floor(ms / 1000)}:R>`;
}

function allTranslations(payload: TranslationPayload): Array<{ lang: string; text: string }> {
  const translations = payload.translations ?? {};
  const items: Array<{ lang: string; text: string }> = [];
  const seen = new Set<string>();
  const original = payload.fullText?.trim() || payload.text?.trim() || "";
  const originalLanguage = normalizeLanguageCode(payload.language);

  for (const lang of Object.keys(translations).sort()) {
    const normalizedLang = normalizeLanguageCode(lang);
    if (!normalizedLang || seen.has(normalizedLang)) continue;

    const value = translations[lang];
    if (typeof value === "string") {
      const text = value.trim();
      if (shouldUseTranslation(text, normalizedLang, originalLanguage, original)) {
        seen.add(normalizedLang);
        items.push({ lang: normalizedLang, text });
      }
      continue;
    }

    if (value && typeof value === "object") {
      const primary = typeof value.primary === "string" ? value.primary.trim() : "";
      const alternative = Array.isArray(value.alternatives)
        ? value.alternatives.find((item) => typeof item === "string" && item.trim() && !isJunkTranscript(item))
        : undefined;
      const text = primary || alternative?.trim() || "";
      if (shouldUseTranslation(text, normalizedLang, originalLanguage, original)) {
        seen.add(normalizedLang);
        items.push({ lang: normalizedLang, text });
      }
    }
  }

  return items;
}

function shouldUseTranslation(
  text: string,
  targetLanguage: string,
  originalLanguage: string,
  original: string,
): boolean {
  if (!text || isJunkTranscript(text)) return false;
  if (targetLanguage && originalLanguage && targetLanguage === originalLanguage) {
    return normalizeComparableText(text) !== normalizeComparableText(original);
  }
  return true;
}

function normalizeLanguageCode(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function normalizeComparableText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isBlankAudioText(text: string): boolean {
  const normalized = text.trim().toUpperCase();
  return normalized === "[BLANK_AUDIO]" || normalized === "BLANK_AUDIO";
}

function isJunkTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (isBlankAudioText(trimmed)) return true;

  const meaningful = Array.from(trimmed.replace(/[\s\p{P}\p{S}]/gu, ""));
  if (meaningful.length === 0) return true;

  const unique = new Set(meaningful);
  if (meaningful.length >= 3 && unique.size === 1) return true;

  const compact = meaningful.join("");
  if (compact.length >= 4 && repeatedUnit(compact)) return true;

  const words = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 3 && new Set(words).size === 1) return true;

  return false;
}

function repeatedUnit(value: string): boolean {
  for (let size = 1; size <= Math.floor(value.length / 2); size++) {
    if (value.length % size !== 0) continue;
    const unit = value.slice(0, size);
    if (unit.repeat(value.length / size) === value) return true;
  }
  return false;
}

function pcm16Stats(input: Buffer) {
  if (input.length < 2) return { rms: 0, peak: 0 };
  let sumSquares = 0;
  let peak = 0;
  const samples = Math.floor(input.length / 2);
  for (let i = 0; i < samples; i++) {
    const value = input.readInt16LE(i * 2) / 32768;
    const abs = Math.abs(value);
    sumSquares += value * value;
    if (abs > peak) peak = abs;
  }
  return {
    rms: Math.sqrt(sumSquares / samples),
    peak,
  };
}

async function dumpSpeakerAudio(speaker: SpeakerState, tag: string) {
  const dir = debugDumpDir();
  if (!dir || !speaker.debugPcmChunks.length) return;
  const pcm = Buffer.concat(speaker.debugPcmChunks);
  speaker.debugPcmChunks = [];
  if (!pcm.length) return;
  try {
    await Deno.mkdir(dir, { recursive: true });
    speaker.dumpCount += 1;
    const name = `${safeFileComponent(speaker.userId)}_${safeFileComponent(tag)}_${String(speaker.dumpCount).padStart(2, "0")}_${Date.now()}.wav`;
    const path = `${dir}/${name}`;
    await Deno.writeFile(path, pcm16MonoToWav(pcm, 16_000));
    const { rms, peak } = pcm16Stats(pcm);
    speaker.logger.info(
      `[voice-translate] wrote debug audio dump user=${speaker.userId} path=${path} bytes=${pcm.length} rms=${rms.toFixed(4)} peak=${peak.toFixed(4)}`,
    );
  } catch (error) {
    speaker.logger.error(`[voice-translate] failed to write debug audio dump user=${speaker.userId} ${String(error)}`);
  }
}

function debugDumpDir() {
  return Deno.env.get("VOICE_TRANSLATE_DEBUG_DUMP_DIR")?.trim() || "";
}

function pcm16MonoToWav(pcm: Buffer, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function safeFileComponent(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || "unknown";
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
