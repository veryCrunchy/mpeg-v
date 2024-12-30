export interface ScienceInstalls {
  is_install: boolean;
  is_user: boolean;
  guild_id: string;
  user_id?: string;
  date_installed?: boolean;
}

export interface ConversionLogs {
  date_created: string;
  file_name: string;
  type: string;
  conversion_time: number;
  input_size: number;
  output_size: number;
  file_duration: number;
  input_bitrate: number;
  output_bitrate: number;
  audio_format: string;
  user_id: string;
  guild_id: string;
  cached: boolean;
}

export const BotItem = {
  ScienceInstalls: "science_installs",
} as const;

export const ServeItem = {
  ConversionLogs: "conversion_logs",
} as const;

export const Item = { ...BotItem, ...ServeItem } as const;

export interface TableSchemas {
  [Item.ConversionLogs]: ConversionLogs;
  [Item.ScienceInstalls]: ScienceInstalls;
}

export type TableNames = keyof TableSchemas;
