import type { ConversionLogs } from "./database.ts";
import type { AudioVideoSettings } from "../../web/utils/core/audioVideo.ts";

export enum BoostTierFileLimit {
  Default = 10 * 1024 * 1024, // 10MB
  Tier2 = 50 * 1024 * 1024, // 50MB
  Tier3 = 100 * 1024 * 1024, // 100MB
}
export interface GenerateVideoRequest {
  url: string;
  tier_limit: number;
  /** Discord's interaction-specific upload limit, capped by the worker. */
  max_output_bytes?: number;
  actor?: { userId: string; guildId?: string };
  audioVideo?: Partial<AudioVideoSettings>;
  logs: Omit<
    ConversionLogs,
    | "cached"
    | "conversion_time"
    | "file_duration"
    | "input_bitrate"
    | "input_size"
    | "output_bitrate"
    | "output_size"
  >;
}
