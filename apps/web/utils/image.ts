export type ImageFormat = "image/png" | "image/jpeg" | "image/webp";
export function fitDimensions(width: number, height: number, maxEdge: number) {
  if (
    ![width, height, maxEdge].every(Number.isFinite) ||
    width < 1 ||
    height < 1 ||
    maxEdge < 0
  )
    throw new Error("Invalid image dimensions.");
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export { outputName } from "./core/filenames.ts";
export async function convertImage(
  file: File,
  format: ImageFormat,
  maxEdge: number,
  quality: number,
  rotation = 0,
  flip: "none" | "horizontal" | "vertical" = "none",
) {
  if (!/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name))
    throw new Error("Choose a PNG, JPEG, WebP, GIF, AVIF or BMP image.");
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(format) ||
    !Number.isFinite(quality) ||
    quality < 10 ||
    quality > 100 ||
    ![0, 90, 180, 270].includes(rotation) ||
    !["none", "horizontal", "vertical"].includes(flip)
  )
    throw new Error("Choose valid image settings.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose an image smaller than 25 MiB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This browser cannot read that image. Try PNG, JPEG or WebP.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > 24_000_000)
      throw new Error("Choose an image with fewer than 24 million pixels.");
    const size = fitDimensions(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = rotation % 180 ? size.height : size.width;
    canvas.height = rotation % 180 ? size.width : size.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image tools are unavailable in this browser.");
    if (format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(flip === "horizontal" ? -1 : 1, flip === "vertical" ? -1 : 1);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(
      bitmap,
      -size.width / 2,
      -size.height / 2,
      size.width,
      size.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("The image could not be saved.")),
        format,
        quality / 100,
      ),
    );
    if (blob.type !== format)
      throw new Error(
        "This browser cannot save that format. Choose PNG or JPEG.",
      );
    const result = { blob, width: canvas.width, height: canvas.height };
    canvas.width = canvas.height = 0;
    return result;
  } finally {
    bitmap.close();
  }
}
