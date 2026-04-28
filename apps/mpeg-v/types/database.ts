export interface ScienceInstalls {
  is_install: boolean;
  is_user: boolean;
  guild_id: string;
  user_id?: string;
  date_installed?: boolean;
}

export interface ConversionLogs {
  date_created: string | Date;
  file_name: string;
  type: "auto" | "slash" | "menu" | "button";
  conversion_time: number;
  input_size: number;
  output_size: number;
  file_duration: number;
  input_bitrate: number;
  output_bitrate: number;
  audio_format: string;
  user_id: string;
  guild_id: string | "DM";
  cached: boolean;
}

export interface TranslationSession {
  id: string;
  guild_id: string;
  voice_channel_id: string;
  text_channel_id: string;
  room_id: string;
  live_url: string;
  source_language: string;
  target_languages: string[];
  status: "starting" | "connected" | "ready" | "degraded" | "stopped" | "failed" | "stale";
  status_message?: string;
  bot_instance_id: string;
  date_created?: string | Date;
  date_updated?: string | Date;
}

export const BotItem = {
  ScienceInstalls: "science_installs",
  TranslationSessions: "translation_sessions",
} as const;

export const ServeItem = {
  ConversionLogs: "conversion_logs",
} as const;

export const Item = { ...BotItem, ...ServeItem } as const;

export interface TableSchemas {
  [Item.ConversionLogs]: ConversionLogs;
  [Item.ScienceInstalls]: ScienceInstalls;
  [Item.TranslationSessions]: TranslationSession;
}

export type TableNames = keyof TableSchemas;
