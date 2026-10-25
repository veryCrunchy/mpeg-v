import {
  audioExtensions,
  imageExtensions,
  type ToolId,
  tools,
  videoExtensions,
} from "./tools";
export function nextTools(filename: string) {
  const ids: ToolId[] = ["zip", "hash"];
  if (imageExtensions.test(filename)) ids.unshift("image", "pdf");
  else if (/\.pdf$/i.test(filename)) ids.unshift("pdf");
  else if (videoExtensions.test(filename)) ids.unshift("video", "audio-format");
  else if (audioExtensions.test(filename)) ids.unshift("audio-format", "audio");
  else if (/\.(txt|json|csv|tsv)$/i.test(filename)) ids.unshift("text");
  return ids.map((id) => tools.find((tool) => tool.id === id)!);
}
export function workflowMode(filename: string, tool: ToolId) {
  return {
    pdf: tool === "pdf" && imageExtensions.test(filename)
      ? "images" as const
      : "merge" as const,
    archive: /\.zip$/i.test(filename)
      ? "extract" as const
      : /\.(gz|gzip)$/i.test(filename)
      ? "gunzip" as const
      : "create" as const,
  };
}
