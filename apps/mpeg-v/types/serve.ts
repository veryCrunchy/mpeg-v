import type { ConversionLogs } from "./database.ts";

export enum BoostTierFileLimit {
  Default = 10 * 1024 * 1024, // 10MB
  Tier2 = 50 * 1024 * 1024, // 50MB
  Tier3 = 100 * 1024 * 1024, // 100MB
}
export interface GenerateVideoRequest {
  url: string;
  tier_limit: number;
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
