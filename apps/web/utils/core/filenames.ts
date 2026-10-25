export function outputName(name: string, extension: string) {
  const stem = name
    .replace(/\.[^.]+$/, "")
    .replace(/[\x00-\x1f\x7f/\\]/g, "_")
    .slice(0, 100);
  return `${stem || "converted"}.${extension}`;
}
