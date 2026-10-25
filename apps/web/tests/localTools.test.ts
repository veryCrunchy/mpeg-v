import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { processDocuments } from "../utils/documents";
import { pageSelection } from "../utils/pdfPages";
import { mediaPlan, type MediaOptions } from "../utils/mediaPlan";
import { uniqueNames, validateFiles } from "../utils/tools";

const options: MediaOptions = {
  kind: "audio-format",
  audioFormat: "mp3",
  videoFormat: "mp4",
  bitrate: 128,
  maxEdge: 720,
  quality: 28,
  start: 0,
  duration: 0,
};
const audio = { duration: 30, hasAudio: true, hasVideo: false };
test("media clips enforce finite values, track requirements and time budgets", () => {
  for (const start of [NaN, Infinity, -1, 30])
    assert.throws(() => mediaPlan({ ...options, start }, audio));
  assert.throws(() => mediaPlan(options, { ...audio, duration: Infinity }));
  assert.throws(() => mediaPlan(options, { ...audio, hasAudio: false }));
  assert.throws(() => mediaPlan({ ...options, kind: "video" }, audio));
  assert.throws(() => mediaPlan(options, { ...audio, duration: 901 }));
  assert.throws(() =>
    mediaPlan(
      { ...options, kind: "video" },
      { ...audio, duration: 181, hasVideo: true },
    ),
  );
  assert.throws(() =>
    mediaPlan(
      { ...options, kind: "video", videoFormat: "gif" },
      { ...audio, duration: 21, hasVideo: true },
    ),
  );
  assert.equal(
    mediaPlan({ ...options, start: 10, duration: 5 }, audio).length,
    5,
  );
  assert.equal(
    mediaPlan({ ...options, start: 10, duration: 40 }, audio).length,
    20,
  );
  assert.throws(() =>
    mediaPlan(options, { ...audio, hasVideo: true, width: 8000, height: 8000 }),
  );
});

test("page selection is bounded and preserves requested order and duplicates", () => {
  assert.deepEqual(pageSelection("3, 1-2, 3", 3), [2, 0, 1, 2]);
  assert.deepEqual(pageSelection("", 3), [0, 1, 2]);
  for (const value of ["0", "4", "3-1", "-1", "1,", "1e2", "1-999999999"])
    assert.throws(() => pageSelection(value, 3));
  assert.throws(() => pageSelection("1,".repeat(201) + "1", 3));
  assert.throws(() => pageSelection("", 201));
});

async function pdf(name: string, widths: number[]) {
  const document = await PDFDocument.create();
  widths.forEach((width) => document.addPage([width, 200]));
  return { name, type: "application/pdf", bytes: await document.save() };
}
test("PDF merge and extraction produce readable documents with the correct page order", async () => {
  const first = await pdf("first.pdf", [200, 300]);
  const second = await pdf("second.pdf", [400]);
  const merged = await processDocuments({
    kind: "pdf",
    mode: "merge",
    pages: "",
    files: [second, first],
  });
  assert.equal(merged.type, "application/pdf");
  assert.deepEqual(
    (await PDFDocument.load(merged.bytes))
      .getPages()
      .map((page) => page.getWidth()),
    [400, 200, 300],
  );
  const selected = await processDocuments({
    kind: "pdf",
    mode: "extract",
    pages: "3,1,1",
    files: [{ ...first, bytes: merged.bytes }],
  });
  assert.deepEqual(
    (await PDFDocument.load(selected.bytes))
      .getPages()
      .map((page) => page.getWidth()),
    [300, 400, 400],
  );
  assert.deepEqual(
    (await PDFDocument.load(first.bytes))
      .getPages()
      .map((page) => page.getWidth()),
    [200, 300],
  );
});
test("PDF processing rejects invalid files, excess pages and ambiguous extraction", async () => {
  await assert.rejects(
    () =>
      processDocuments({
        kind: "pdf",
        mode: "merge",
        pages: "",
        files: [
          {
            name: "bad.pdf",
            type: "application/pdf",
            bytes: new Uint8Array([1, 2, 3]),
          },
        ],
      }),
    /could not be opened/,
  );
  const tooMany = await pdf("many.pdf", Array(201).fill(200));
  await assert.rejects(
    () =>
      processDocuments({
        kind: "pdf",
        mode: "merge",
        pages: "",
        files: [tooMany],
      }),
    /200/,
  );
  const first = await pdf("first.pdf", [200]);
  await assert.rejects(
    () =>
      processDocuments({
        kind: "pdf",
        mode: "extract",
        pages: "",
        files: [first, first],
      }),
    /one PDF/,
  );
});
test("ZIP downloads round-trip contents with safe and unique filenames", async () => {
  const names = [
    "../sample.txt",
    "..\\sample.txt",
    "__proto__",
    "SAMPLE.txt",
    "sample.txt",
  ];
  const files = names.map((name, index) => ({
    name,
    type: "text/plain",
    bytes: new TextEncoder().encode(`Synthetic ${index}`),
  }));
  const result = await processDocuments({
    kind: "zip",
    mode: "merge",
    pages: "",
    files,
  });
  const entries = unzipSync(result.bytes);
  assert.equal(Object.keys(entries).length, 5);
  assert.ok(
    Object.keys(entries).every(
      (name) => !/[\/\\]/.test(name) && !name.startsWith("."),
    ),
  );
  assert.deepEqual(
    Object.values(entries)
      .map((bytes) => strFromU8(bytes))
      .sort(),
    files.map((file) => strFromU8(file.bytes)).sort(),
  );
  assert.equal(
    new Set(
      uniqueNames(["name.txt", "NAME.txt", "name (2).txt"]).map((name) =>
        name.toLowerCase(),
      ),
    ).size,
    3,
  );
});
test("file admission rejects empty, unsupported and excessive inputs before parsing", () => {
  const image = new File(["synthetic"], "image.avif", { type: "image/avif" });
  assert.doesNotThrow(() => validateFiles([image], "image"));
  assert.throws(() => validateFiles([new File([], "image.png")], "image"));
  assert.throws(() =>
    validateFiles([new File(["text"], "script.svg")], "image"),
  );
  assert.throws(() => validateFiles(Array(21).fill(image), "image"));
  assert.throws(() => validateFiles([image, image], "audio"));
  assert.throws(() =>
    validateFiles(
      [{ name: "video.mp4", size: 101 * 1024 * 1024 } as File],
      "video",
    ),
  );
  assert.throws(() =>
    validateFiles(
      [{ name: "document.pdf", size: 26 * 1024 * 1024 } as File],
      "pdf",
    ),
  );
});
