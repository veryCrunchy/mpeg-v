import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  coreVersion,
  wrapperVersion,
  mediaAssetPath,
} from "../utils/mediaAssets.ts";
import { pdfVersion, pdfAssetPath } from "../utils/pdfAssets.ts";
for (const [name, version] of [
  ["core", coreVersion],
  ["ffmpeg", wrapperVersion],
]) {
  const installed = JSON.parse(
    await readFile(
      new URL(`../node_modules/@ffmpeg/${name}/package.json`, import.meta.url),
      "utf8",
    ),
  );
  if (installed.version !== version)
    throw new Error(
      "Update mediaAssets.ts when updating the media engine packages.",
    );
}
const target = new URL(`../public${mediaAssetPath}`, import.meta.url);
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const generatedRoot = fileURLToPath(
  new URL("../public/vendor/ffmpeg/", import.meta.url),
);
if (relative(publicRoot, generatedRoot) !== join("vendor", "ffmpeg"))
  throw new Error("Unexpected generated asset directory.");
// This ignored directory contains only copies of the pinned package assets.
await rm(generatedRoot, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(
    new URL(`../node_modules/@ffmpeg/core/dist/esm/${name}`, import.meta.url),
    new URL(name, target),
  );
}
for (const name of ["worker.js", "const.js", "errors.js"]) {
  await copyFile(
    new URL(`../node_modules/@ffmpeg/ffmpeg/dist/esm/${name}`, import.meta.url),
    new URL(name, target),
  );
}
await writeFile(
  new URL("NOTICE.txt", target),
  "FFmpeg WebAssembly core 0.12.10\nGPL-2.0-or-later and included codec licenses.\nSource and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/core-v0.12.10\nhttps://ffmpegwasm.netlify.app/docs/faq/#what-is-the-license-of-ffmpegwasm\n",
);
console.log(`Prepared local media engine: ${fileURLToPath(target)}`);
const pdfPackage = new URL("../node_modules/pdfjs-dist/", import.meta.url);
if (
  JSON.parse(await readFile(new URL("package.json", pdfPackage), "utf8"))
    .version !== pdfVersion
)
  throw new Error("Update pdfAssets.ts when updating PDF.js.");
const pdfTarget = new URL(`../public${pdfAssetPath}`, import.meta.url);
await mkdir(pdfTarget, { recursive: true });
await copyFile(
  new URL("build/pdf.worker.min.mjs", pdfPackage),
  new URL("pdf.worker.min.mjs", pdfTarget),
);
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"])
  await cp(new URL(folder, pdfPackage), new URL(folder, pdfTarget), {
    recursive: true,
  });
await copyFile(new URL("LICENSE", pdfPackage), new URL("LICENSE", pdfTarget));
