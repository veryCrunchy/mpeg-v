import { pageSelection } from "./pdfPages";
import { outputName } from "./image";
import { MAX_TOTAL_BYTES, uniqueNames, type LocalResult } from "./tools";
import { pdfAssetPath } from "./pdfAssets";

export async function readPdf(
  file: File,
  options: {
    mode: "render" | "text";
    pages: string;
    format: "image/png" | "image/jpeg";
    dpi: number;
  },
  signal: AbortSignal,
  status: (message: string) => void,
): Promise<LocalResult[]> {
  status("Opening PDF on your device…");
  const pdfjs = await import("pdfjs-dist");
  signal.throwIfAborted();
  if (
    ![72, 144, 216].includes(options.dpi) ||
    !["image/png", "image/jpeg"].includes(options.format)
  )
    throw new Error("Choose valid PDF image settings.");
  pdfjs.GlobalWorkerOptions.workerSrc = `${pdfAssetPath}pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({
    data,
    cMapUrl: `${pdfAssetPath}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfAssetPath}standard_fonts/`,
    wasmUrl: `${pdfAssetPath}wasm/`,
    iccUrl: `${pdfAssetPath}iccs/`,
    // PDF.js omits images above maxImageSize without failing the render.
    // Keep their content and bound the rendered canvas/total pixels below.
    maxImageSize: -1,
    canvasMaxAreaInBytes: 48_000_000,
    stopAtErrors: true,
  });
  let timedOut = false;
  const abort = () => {
    void task.destroy().catch(() => {});
  };
  task.onPassword = () => {
    abort();
  };
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 120_000);
  const results: LocalResult[] = [];
  let totalBytes = 0,
    totalPixels = 0;
  const text: string[] = [];
  try {
    const document = await task.promise;
    const indices = pageSelection(options.pages, document.numPages);
    if (options.mode === "render" && indices.length > 50)
      throw new Error(
        "Render up to 50 pages at once. Use the page selection field.",
      );
    for (const [position, index] of indices.entries()) {
      signal.throwIfAborted();
      if (timedOut) throw new Error("PDF processing timed out.");
      status(
        `${options.mode === "render" ? "Rendering" : "Reading"} page ${position + 1} of ${indices.length}…`,
      );
      const page = await document.getPage(index + 1);
      if (options.mode === "text") {
        const content = await page.getTextContent();
        const body = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim();
        const section = `Page ${index + 1}\n${body}`;
        totalBytes += new TextEncoder().encode(section).length;
        if (totalBytes > 10 * 1024 * 1024)
          throw new Error("The text exceeds 10 MiB. Select fewer pages.");
        text.push(section);
      } else {
        const viewport = page.getViewport({ scale: options.dpi / 72 });
        const width = Math.ceil(viewport.width),
          height = Math.ceil(viewport.height);
        totalPixels += width * height;
        if (
          !Number.isFinite(totalPixels) ||
          width < 1 ||
          height < 1 ||
          width > 8192 ||
          height > 8192 ||
          width * height > 12_000_000 ||
          totalPixels > 100_000_000
        )
          throw new Error(
            "These pages are too large to render. Lower the resolution or select fewer pages.",
          );
        const canvas = window.document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        try {
          const render = page.render({
            canvas,
            viewport,
            background: "rgb(255,255,255)",
          });
          const cancelRender = () => render.cancel();
          signal.addEventListener("abort", cancelRender, { once: true });
          try {
            await render.promise;
          } finally {
            signal.removeEventListener("abort", cancelRender);
          }
          signal.throwIfAborted();
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error("Could not save this page.")),
              options.format,
              0.9,
            ),
          );
          totalBytes += blob.size;
          if (totalBytes > MAX_TOTAL_BYTES)
            throw new Error(
              "The images exceed 100 MiB. Lower the resolution or select fewer pages.",
            );
          results.push({
            name: outputName(
              file.name,
              `page-${index + 1}.${options.format === "image/png" ? "png" : "jpg"}`,
            ),
            blob,
            detail: `${width} × ${height} · Page ${index + 1}`,
          });
        } finally {
          canvas.width = canvas.height = 0;
        }
      }
      page.cleanup();
    }
    if (options.mode === "text")
      results.push({
        name: outputName(file.name, "txt"),
        blob: new Blob([text.join("\n\n") + "\n"], { type: "text/plain" }),
        detail: `${indices.length} pages · Embedded text only`,
      });
    const names = uniqueNames(results.map((result) => result.name));
    return results.map((result, index) => ({ ...result, name: names[index]! }));
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (timedOut)
      throw new Error(
        "This PDF took too long. Select fewer pages or a lower resolution.",
      );
    if (
      error instanceof Error &&
      /Render up to|too large|exceed|Page numbers|page numbers|200 pages|Select no more|Use page/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      "This PDF could not be read. Use an unencrypted, undamaged PDF.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    await task.destroy().catch(() => {});
  }
}
