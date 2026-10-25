import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { zipSync, strToU8, unzipSync } from "fflate";
import { PDFDocument, degrees } from "pdf-lib";
import { extractZip, gzipFile } from "../utils/archives";
import { processFileJob, type DocumentFile } from "../utils/documents";
import { parseDelimited, processText, toDelimited } from "../utils/textTools";
import { allowsMultiple, validateFiles } from "../utils/tools";
import { mediaPlan, type MediaOptions } from "../utils/mediaPlan";
const file = (name: string, text: string): DocumentFile => ({
  name,
  type: "text/plain",
  bytes: strToU8(text),
});
const decode = (input: DocumentFile) => new TextDecoder().decode(input.bytes);

test("ZIP extraction preserves file bytes, flattens unsafe paths and handles empty entries", () => {
  const data = zipSync({
    "nested/a.txt": strToU8("αβ"),
    "../a.txt": strToU8("second"),
    "empty.txt": new Uint8Array(),
    "CON.txt": strToU8("reserved"),
    "folder/": new Uint8Array(),
  });
  const files = extractZip(data);
  assert.deepEqual(files.map(decode), ["αβ", "second", "", "reserved"]);
  assert.ok(
    files.every(
      (file) =>
        !/[\\/]/.test(file.name) && file.type === "application/octet-stream",
    ),
  );
  assert.equal(files[3]!.name, "file-CON.txt");
  assert.throws(() => extractZip(new Uint8Array([1, 2, 3])), /damaged/);
  assert.throws(() => extractZip(zipSync({})), /no files/);
});

test("ZIP extraction rejects corruption, encryption, oversized expansion and entry floods", () => {
  const original = zipSync({ "test.txt": strToU8("x".repeat(30000)) });
  const directory = original.findIndex(
    (_, index) =>
      index < original.length - 4 &&
      new DataView(original.buffer).getUint32(index, true) === 0x02014b50,
  );
  for (const [offset, value] of [
    [16, 1],
    [24, 200 * 1024 * 1024],
    [24, 1],
  ] as const) {
    const data = original.slice();
    new DataView(data.buffer).setUint32(directory + offset, value, true);
    assert.throws(() => extractZip(data), /damaged|100 MiB|declared/);
  }
  const encrypted = original.slice();
  encrypted[directory + 8]! |= 1;
  assert.throws(() => extractZip(encrypted), /unencrypted/);
  assert.throws(() => extractZip(original.slice(0, -1)), /damaged/);
  const entries = Object.fromEntries(
    Array.from({ length: 201 }, (_, index) => [
      `${index}.txt`,
      new Uint8Array(),
    ]),
  );
  assert.throws(() => extractZip(zipSync(entries)), /200/);
});

test("GZIP round-trips binary and empty inputs and rejects damaged streams", async () => {
  for (const bytes of [
    new Uint8Array(),
    Uint8Array.from({ length: 10000 }, (_, index) => index % 256),
  ]) {
    const packed = await gzipFile(
      { name: "input.bin", type: "application/octet-stream", bytes },
      false,
    );
    const restored = await gzipFile(packed, true);
    assert.deepEqual(restored.bytes, bytes);
    assert.equal(restored.name, "input.bin");
    packed.bytes[packed.bytes.length - 8]! ^= 1;
    await assert.rejects(() => gzipFile(packed, true), /undamaged/);
  }
});

test("PDF splitting respects selection order and rotation changes only chosen pages", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]).setRotation(degrees(90));
  source.addPage([400, 300]);
  const input = {
    name: "source.pdf",
    type: "application/pdf",
    bytes: await source.save(),
  };
  const split = await processFileJob({
    kind: "pdf",
    mode: "split",
    pages: "2,1",
    files: [input],
  });
  assert.equal(split.length, 2);
  assert.deepEqual(
    await Promise.all(
      split.map(async (file) =>
        (await PDFDocument.load(file.bytes)).getPage(0).getWidth(),
      ),
    ),
    [400, 200],
  );
  const [rotated] = await processFileJob({
    kind: "pdf",
    mode: "rotate",
    pages: "1",
    rotation: 180,
    files: [input],
  });
  const doc = await PDFDocument.load(rotated!.bytes);
  assert.deepEqual(
    doc.getPages().map((page) => page.getRotation().angle),
    [270, 0],
  );
  assert.deepEqual(
    (await PDFDocument.load(input.bytes))
      .getPages()
      .map((page) => page.getRotation().angle),
    [90, 0],
  );
});

test("all 200 split-page results can be packed into a downloadable ZIP", async () => {
  const files = Array.from({ length: 200 }, (_, index) =>
    file(`${index}.txt`, `${index}`),
  );
  const [result] = await processFileJob({
    kind: "zip",
    mode: "merge",
    pages: "",
    files,
  });
  assert.equal(Object.keys(unzipSync(result!.bytes)).length, 200);
});

test("CSV and TSV preserve quoted delimiters, newlines, escaped quotes and header text", () => {
  const input =
    '\uFEFFname,note,empty\r\n"A,B","said ""hello""\nagain",\r\nC,plain,';
  const rows = parseDelimited(input, ",");
  assert.deepEqual(rows, [
    ["name", "note", "empty"],
    ["A,B", 'said "hello"\nagain', ""],
    ["C", "plain", ""],
  ]);
  assert.deepEqual(parseDelimited(toDelimited(rows, "\t", false), "\t"), rows);
  for (const invalid of ['"missing', 'a"b,c', '"closed"oops,b'])
    assert.throws(() => parseDelimited(invalid, ","));
  const json = JSON.parse(
    decode(processText(file("data.csv", input), "csv-json")),
  );
  assert.deepEqual(json, rows);
  assert.equal(
    toDelimited([{ a: "=2+2", b: "safe" }], ",", true),
    "a,b\r\n'=2+2,safe",
  );
  assert.throws(() => toDelimited([{ a: {} }], ",", true), /Nested/);
});

test("JSON transforms preserve structure and reject unsafe numbers or malformed UTF-8", () => {
  assert.equal(
    decode(processText(file("test.json", '{ "a": 1 }'), "json-minify")),
    '{"a":1}',
  );
  assert.throws(
    () =>
      processText(file("test.json", '{"id":9007199254740993}'), "json-format"),
    /safe numeric/,
  );
  assert.throws(
    () =>
      processText(
        { ...file("text.txt", ""), bytes: new Uint8Array([255]) },
        "lines-sort",
      ),
    /UTF-8/,
  );
  assert.equal(
    decode(processText(file("text.txt", "b\r\na\ra\n"), "lines-unique")),
    "b\na\n",
  );
  assert.equal(
    decode(processText(file("text.txt", "b\na\n"), "lines-sort")),
    "a\nb\n",
  );
  assert.equal(
    decode(processText(file("text.txt", "b\ra\n"), "lines-crlf")),
    "b\r\na\r\n",
  );
});

test("Base64 round-trips arbitrary bytes without Unicode loss", () => {
  const original = {
    ...file("input.bin", ""),
    bytes: Uint8Array.from({ length: 65537 }, (_, index) => index % 256),
  };
  const encoded = processText(original, "base64-encode");
  assert.deepEqual(processText(encoded, "base64-decode").bytes, original.bytes);
  assert.throws(
    () => processText(file("base64.txt", "not-base64!"), "base64-decode"),
    /Base64/,
  );
});

test("checksums match independent digests and report comparisons truthfully", async () => {
  for (const hashAlgorithm of ["SHA-256", "SHA-384", "SHA-512"] as const) {
    const input = file("input.txt", "synthetic content");
    const expectedHash = createHash(
      hashAlgorithm.replace("-", "").toLowerCase(),
    )
      .update(input.bytes)
      .digest("hex");
    const [result] = await processFileJob({
      kind: "hash",
      mode: "merge",
      pages: "",
      files: [input],
      hashAlgorithm,
      expectedHash,
    });
    assert.ok(result!.preview!.includes(expectedHash));
    assert.match(result!.preview!, /MATCH:/);
    const [mismatch] = await processFileJob({
      kind: "hash",
      mode: "merge",
      pages: "",
      files: [input],
      hashAlgorithm,
      expectedHash: "0".repeat(expectedHash.length),
    });
    assert.match(mismatch!.preview!, /MISMATCH:/);
  }
});

test("new operations have correct file admission and media output requirements", () => {
  assert.equal(allowsMultiple("pdf", "render"), false);
  assert.equal(allowsMultiple("zip", "merge", "extract"), false);
  assert.doesNotThrow(() => validateFiles([new File([], "empty.txt")], "hash"));
  assert.throws(() =>
    validateFiles([new File(["x"], "test.rar")], "zip", "merge", "extract"),
  );
  const options: MediaOptions = {
    kind: "video",
    videoFormat: "png",
    audioFormat: "wav",
    start: 1000,
    duration: 0,
    bitrate: 128,
    maxEdge: 720,
    quality: 28,
  };
  const info = {
    duration: 2000,
    hasAudio: true,
    hasVideo: true,
    width: 1920,
    height: 1080,
  };
  assert.ok(mediaPlan(options, info).args.includes("-frames:v"));
  assert.ok(
    mediaPlan(
      { ...options, videoFormat: "mp4", duration: 2, mute: true },
      info,
    ).args.includes("-an"),
  );
  assert.ok(
    mediaPlan(
      { ...options, kind: "audio-format", duration: 2, normalize: true },
      info,
    ).args.includes("loudnorm=I=-16:TP=-1.5:LRA=11"),
  );
});
