export const visualizationStyles = ["wave", "filled", "dots", "bars"] as const;
export const videoSizes = {
  compact: [250, 100],
  standard: [500, 200],
  wide: [960, 360],
} as const;
export interface AudioVideoSettings {
  visualization: typeof visualizationStyles[number];
  color: string;
  background: string;
  size: keyof typeof videoSizes;
  fps: 15 | 24 | 30;
  bitrate: 64 | 128 | 192 | 256;
}
export type AudioVideoPatch = {
  [K in keyof AudioVideoSettings]?: AudioVideoSettings[K] | null;
};
export type PreferenceScope = "user" | "guild";
export interface PreferenceRecord {
  values: Partial<AudioVideoSettings>;
  revision: string | null;
}
export const defaultAudioVideo: Readonly<AudioVideoSettings> = Object.freeze({
  visualization: "wave",
  color: "#ff893a",
  background: "#101313",
  size: "compact",
  fps: 15,
  bitrate: 128,
});
export function validateAudioVideoPatch(
  value: unknown,
  allowNull = true,
): AudioVideoPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid audio-to-video settings.");
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(defaultAudioVideo, key)) {
      throw new Error("Unknown audio-to-video setting.");
    }
    if (item === null && allowNull) {
      result[key] = null;
      continue;
    }
    if (key === "color" || key === "background") {
      if (typeof item !== "string" || !/^#?[a-f\d]{6}$/i.test(item)) {
        throw new Error("Use a six-digit hex color, such as #ff893a.");
      }
      result[key] = `#${item.replace(/^#/, "").toLowerCase()}`;
    } else {
      const choices: Record<string, readonly unknown[]> = {
        visualization: visualizationStyles,
        size: Object.keys(videoSizes),
        fps: [15, 24, 30],
        bitrate: [64, 128, 192, 256],
      };
      if (!choices[key]?.includes(item)) {
        throw new Error(`Choose a supported ${key} setting.`);
      }
      result[key] = item;
    }
  }
  return result as AudioVideoPatch;
}
export function mergeAudioVideoPatch(
  current: Partial<AudioVideoSettings>,
  patch: AudioVideoPatch,
): Partial<AudioVideoSettings> {
  const next = { ...current };
  for (const [key, value] of Object.entries(validateAudioVideoPatch(patch))) {
    if (value === null) delete next[key as keyof AudioVideoSettings];
    else Object.assign(next, { [key]: value });
  }
  return next;
}
export function resolveAudioVideo(
  ...layers: (Partial<AudioVideoSettings> | undefined)[]
): AudioVideoSettings {
  return Object.assign(
    {},
    defaultAudioVideo,
    ...layers.map((layer) => validateAudioVideoPatch(layer ?? {}, false)),
  );
}
export function validDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}
/** Every interpolated value is validated; no caller can supply raw FFmpeg expressions. */
export function visualizationFilter(
  value: Partial<AudioVideoSettings> = {},
): string {
  const settings = resolveAudioVideo(value);
  const [width, height] = videoSizes[settings.size];
  const color = `0x${settings.color.slice(1)}`,
    background = `0x${settings.background.slice(1)}`;
  const visual = settings.visualization === "bars"
    ? `showfreqs=s=${width}x${height}:mode=bar:ascale=sqrt:fscale=log:win_size=1024:rate=${settings.fps}:colors=${color}`
    : `showwaves=s=${width}x${height}:mode=${
      { wave: "p2p", filled: "cline", dots: "point" }[settings.visualization]
    }:draw=full:rate=${settings.fps}:colors=${color}`;
  return `color=c=${background}:s=${width}x${height}:r=${settings.fps}[base];[0:a:0]aformat=channel_layouts=mono,${visual},format=rgba[fg];[base][fg]overlay=shortest=1:format=auto,format=yuv420p[v]`;
}
