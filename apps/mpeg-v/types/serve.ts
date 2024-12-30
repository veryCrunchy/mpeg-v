import type { ConversionLogs } from "./database.ts";

export interface GenerateVideoRequest {
  url: string;
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
