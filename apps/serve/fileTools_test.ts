import { strict as assert } from "node:assert";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import {
  type FileOperation,
  type FileToolOptions,
  type FileToolRequest,
  validateFileRequest,
} from "../mpeg-v/types/fileTools.ts";
import { documentJob, handleFileTools, processBotFiles } from "./fileTools.ts";
import { handleRequest } from "./main.ts";
import type { DocumentFile } from "../web/utils/core/documents.ts";

const encode = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const signal = () => new AbortController().signal;
const file = (name: string, bytes = encode("hello")): DocumentFile => ({
  name,
  bytes,
  type: "application/octet-stream",
});
function request(
  operation: FileOperation,
  options: FileToolOptions = {},
  files = [file("notes.txt")],
): FileToolRequest {
  return {
    operation,
    options,
    files: files.map((f) => ({
      name: f.name,
      url: `https://cdn.discordapp.com/attachments/1/2/${
        encodeURIComponent(f.name)
      }`,
    })),
    maxOutputBytes: 10 * 1024 * 1024,
  };
}
async function run(
  operation: FileOperation,
  options: FileToolOptions,
  files: DocumentFile[],
) {
  return await processBotFiles(
    validateFileRequest(request(operation, options, files)),
    files,
    signal(),
  );
}

Deno.test("file contract rejects invalid settings, multiplicity and unbounded outputs", () => {
  const valid = request("image", { format: "png" }, [file("image.png")]);
  for (
    const patch of [
      { maxOutputBytes: 0 },
      { maxOutputBytes: Infinity },
      { maxOutputBytes: 101 * 1024 * 1024 },
      { options: { format: "exe" } },
      { options: { start: NaN } },
      { options: { mute: "false" } },
      { options: [] },
      { files: [] },
      { files: Array(6).fill(valid.files[0]) },
    ]
  ) assert.throws(() => validateFileRequest({ ...valid, ...patch }));
  assert.throws(() =>
    validateFileRequest(request("text", {}, [file("one.txt"), file("two.txt")]))
  );
  assert.equal(
    validateFileRequest(
      request("archive", {}, [file("one.txt"), file("two.txt")]),
    ).files.length,
    2,
  );
});

Deno.test("generic file route requires authorization and rejects unsafe URLs without fetching", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    calls++;
    throw new Error("Unexpected network request");
  };
  try {
    const unauthenticated = await handleRequest(
      new Request("http://localhost/tools/file", {
        method: "POST",
        body: JSON.stringify(request("info")),
      }),
    );
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get("Cache-Control"), "no-store");
    const invalid = request("info");
    invalid.files[0].url = "https://127.0.0.1/private";
    const response = await handleFileTools(
      new Request("http://localhost/tools/file", {
        method: "POST",
        body: JSON.stringify(invalid),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("file HTTP response streams a bounded attachment and respects Discord's size limit", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) => {
    assert.equal(init?.redirect, "error");
    return Promise.resolve(new Response("hello"));
  };
  try {
    const job = request("info");
    const response = await handleFileTools(
      new Request("http://localhost/tools/file", {
        method: "POST",
        body: JSON.stringify(job),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-File-Name"), "file-info.json");
    assert.equal(
      (await response.json()).sha256,
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    job.maxOutputBytes = 1;
    assert.equal(
      (await handleFileTools(
        new Request("http://localhost/tools/file", {
          method: "POST",
          body: JSON.stringify(job),
        }),
      )).status,
      413,
    );
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("isolated document jobs merge, rotate and split PDFs into a ZIP", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 200]);
  pdf.addPage([200, 300]);
  const bytes = await pdf.save();
  const merged = await run("pdf", { mode: "merge" }, [
    file("one.pdf", bytes.slice()),
    file("two.pdf", bytes.slice()),
  ]);
  assert.equal((await PDFDocument.load(merged.bytes)).getPageCount(), 4);
  const rotated = await run(
    "pdf",
    { mode: "rotate", pages: "2", rotation: 90 },
    [file("source.pdf", bytes.slice())],
  );
  assert.deepEqual(
    (await PDFDocument.load(rotated.bytes)).getPages().map((p) =>
      p.getRotation().angle
    ),
    [0, 90],
  );
  const split = await run("pdf", { mode: "split", pages: "2,1" }, [
    file("source.pdf", bytes.slice()),
  ]);
  const entries = Object.values(unzipSync(split.bytes));
  assert.equal(entries.length, 2);
  assert.equal(
    (await PDFDocument.load(entries[0])).getPage(0).getHeight(),
    300,
  );
  assert.equal(
    (await PDFDocument.load(entries[1])).getPage(0).getHeight(),
    200,
  );
});

Deno.test("archive commands list safe names and extract exact original bytes", async () => {
  const archive = await run("archive", { mode: "create" }, [
    file("../hello.txt"),
    file("hello.txt", encode("second")),
  ]);
  const listing = await run("archive", { mode: "list" }, [
    file("bundle.zip", archive.bytes.slice()),
  ]);
  assert.match(decode(listing.bytes), /hello\.txt\t5 bytes/);
  assert.doesNotMatch(decode(listing.bytes), /\.\.\//);
  await assert.rejects(
    () =>
      run("archive", { mode: "extract" }, [
        file("bundle.zip", archive.bytes.slice()),
      ]),
    /action:list/,
  );
  const extracted = await run("archive", {
    mode: "extract",
    entry: "hello.txt",
  }, [file("bundle.zip", archive.bytes.slice())]);
  assert.equal(decode(extracted.bytes), "second");
  const compressed = await run("archive", { mode: "gzip" }, [
    file("notes.txt"),
  ]);
  const restored = await run("archive", { mode: "gunzip" }, [compressed]);
  assert.equal(decode(restored.bytes), "hello");
});

Deno.test("text and checksum commands return transformed data and verified digests", async () => {
  const text = await run("text", { mode: "csv-json" }, [
    file("data.csv", encode('name,value\nexample,"two,parts"')),
  ]);
  assert.deepEqual(JSON.parse(decode(text.bytes)), [["name", "value"], [
    "example",
    "two,parts",
  ]]);
  const hash = await run("checksum", {
    format: "SHA-256",
    expected:
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  }, [file("notes.txt")]);
  assert.match(decode(hash.bytes), /MATCH/);
  const cancelled = new AbortController();
  cancelled.abort();
  assert.throws(() =>
    documentJob({
      kind: "zip",
      mode: "merge",
      pages: "",
      files: [file("notes.txt")],
    }, cancelled.signal)
  );
});

async function ffmpeg(args: string[]) {
  const result = await new Deno.Command("ffmpeg", {
    args: ["-hide_banner", "-loglevel", "error", ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.success, true, decode(result.stderr));
  return result.stdout;
}
Deno.test("native file tools produce decodable images, audio, video, frames and image PDFs", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-file-test-" });
  try {
    const source = `${directory}/source.mp4`;
    await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x90:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ]);
    const bytes = await Deno.readFile(source);
    const image = await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=black@0:s=100x50,format=rgba",
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ]);
    const outputs: DocumentFile[] = [];
    for (const format of ["png", "jpg", "webp"]) {
      outputs.push(
        await run("image", { format, rotation: 90 }, [
          file("transparent.png", image.slice()),
        ]),
      );
    }
    for (const format of ["mp3", "wav", "flac", "ogg", "m4a", "waveform"]) {
      outputs.push(
        await run("audio", { format, duration: 0.5 }, [
          file("source.mp4", bytes.slice()),
        ]),
      );
    }
    for (const format of ["mp4", "webm", "gif", "png", "jpg"]) {
      outputs.push(
        await run("video", { format, duration: 0.5, mute: true }, [
          file("source.mp4", bytes.slice()),
        ]),
      );
    }
    for (const [i, output] of outputs.entries()) {
      assert.ok(output.bytes.length > 0);
      const path = `${directory}/${i}-${output.name}`;
      await Deno.writeFile(path, output.bytes);
      await ffmpeg(["-i", path, "-f", "null", "-"]);
    }
    const jpegPath = `${directory}/1-${outputs[1].name}`;
    const rgb = await ffmpeg([
      "-i",
      jpegPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    assert.equal(rgb.length, 50 * 100 * 3);
    assert.ok(
      rgb.every((value) => value >= 250),
      "Transparent JPEG pixels should become white",
    );
    const opaque = await ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=100x50",
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ]);
    const opaqueJpeg = await run("image", { format: "jpg" }, [
      file("red.png", opaque),
    ]);
    const opaquePath = `${directory}/opaque.jpg`;
    await Deno.writeFile(opaquePath, opaqueJpeg.bytes);
    const opaqueRgb = await ffmpeg([
      "-i",
      opaquePath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ]);
    assert.ok(
      opaqueRgb[0] > 240 && opaqueRgb[1] < 15 && opaqueRgb[2] < 15,
      "JPEG flattening must preserve opaque foreground pixels",
    );
    const pdf = await run("pdf", { mode: "images" }, [
      file("image.png", image.slice()),
    ]);
    assert.equal((await PDFDocument.load(pdf.bytes)).getPageCount(), 1);
    const tiny = request("image", { format: "png" });
    tiny.maxOutputBytes = 1;
    await assert.rejects(
      () => processBotFiles(tiny, [file("image.png", image.slice())], signal()),
      { status: 413 },
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
