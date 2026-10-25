import { strict as assert } from "node:assert";
import { convertAudio, withConversionSlot } from "./converter.ts";
import generate, { validateAttachmentUrl } from "./generate.ts";
import { HttpError, readLimited } from "./http.ts";
import { handleRequest } from "./main.ts";
import { determineSizeLimit } from "@mpeg-v/utils";

Deno.test("rejects URLs outside Discord attachments before downloading", () => {
  for (
    const url of [
      "http://127.0.0.1/private",
      "https://cdn.discordapp.com.evil.test/attachments/1/2/a",
      "file:///etc/passwd",
      "https://cdn.discordapp.com@evil.test/attachments/1/2/a",
      "https://cdn.discordapp.com:444/attachments/1/2/a",
      "https://cdn.discordapp.com/not-an-attachment",
    ]
  ) {
    assert.throws(() => validateAttachmentUrl(url), HttpError);
  }
  assert.equal(
    validateAttachmentUrl(
      "https://cdn.discordapp.com/attachments/123/456/audio.mp3?ex=123&hm=abc",
    ).hostname,
    "cdn.discordapp.com",
  );
});
Deno.test("bounded reader counts chunked input and cancels on overflow", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3));
      controller.enqueue(new Uint8Array(3));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => readLimited(stream, 5), { status: 413 });
  assert.equal(cancelled, true);
});
Deno.test("invalid JSON returns a client error", async () => {
  const response = await generate(
    new Request("http://localhost/generate", { method: "POST", body: "{" }),
  );
  assert.equal(response.status, 400);
});
Deno.test("invalid upload tiers cannot disable size limits", async () => {
  assert.equal(determineSizeLimit(999), 10 * 1024 * 1024);
  const response = await generate(
    new Request("http://localhost/generate", {
      method: "POST",
      body: JSON.stringify({
        url: "https://cdn.discordapp.com/attachments/1/2/a.mp3",
        tier_limit: 999,
      }),
    }),
  );
  assert.equal(response.status, 400);
});
Deno.test("missing configuration never authorizes Bearer undefined", async () => {
  const response = await handleRequest(
    new Request("http://localhost/generate", {
      method: "POST",
      headers: { Authorization: "Bearer undefined" },
    }),
  );
  assert.equal(response.status, 401);
  for (
    const path of ["/translation-sessions", "/translation-sessions/known-id"]
  ) {
    const sessionResponse = await handleRequest(
      new Request(`http://localhost${path}`, {
        headers: { Authorization: "Bearer undefined" },
      }),
    );
    assert.equal(sessionResponse.status, 401);
    assert.equal(sessionResponse.headers.get("Cache-Control"), "no-store");
  }
});

Deno.test("output overrides remain bounded and cannot disable the worker ceiling", async () => {
  for (const limit of [-1, 0, 0.5, "100", 101 * 1024 * 1024]) {
    const response = await generate(
      new Request("http://localhost/generate", {
        method: "POST",
        body: JSON.stringify({
          url: "https://cdn.discordapp.com/attachments/1/2/a.mp3",
          tier_limit: 0,
          max_output_bytes: limit,
        }),
      }),
    );
    assert.equal(response.status, 400);
  }
});
Deno.test("conversion admission is bounded and released after errors", async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withConversionSlot(() => held);
  const second = withConversionSlot(() => held);
  await assert.rejects(() => withConversionSlot(async () => {}), {
    status: 429,
  });
  release();
  await Promise.all([first, second]);
  await assert.rejects(() =>
    withConversionSlot(async () => {
      throw new Error("failure");
    })
  );
  assert.equal(await withConversionSlot(async () => "available"), "available");
});

// Generate fixtures at runtime outside the repository. Never use personal audio.
for (const extension of ["wav", "mp3", "flac", "aac", "m4a", "ogg", "opus"]) {
  Deno.test(`real FFmpeg converts ${extension} to playable H.264/AAC MP4`, async () => {
    const directory = await Deno.makeTempDir({ prefix: "mpeg-v-test-" });
    try {
      const source = `${directory}/tone.${extension}`;
      const fixture = await new Deno.Command("ffmpeg", {
        args: [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=2",
          source,
        ],
        stdout: "null",
        stderr: "piped",
      }).output();
      assert.equal(
        fixture.success,
        true,
        new TextDecoder().decode(fixture.stderr),
      );
      const file = await Deno.open(source);
      const result = await convertAudio(
        file.readable,
        10 * 1024 * 1024,
        new AbortController().signal,
      );
      assert.ok(result.inputSize > 0);
      assert.ok(result.bytes.length > 1000 && result.bytes.length < 100_000);
      await Deno.writeFile(`${directory}/result.mp4`, result.bytes);
      const probe = await new Deno.Command("ffprobe", {
        args: [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_name,codec_type,width,height",
          "-of",
          "json",
          `${directory}/result.mp4`,
        ],
        stdout: "piped",
      }).output();
      const streams =
        JSON.parse(new TextDecoder().decode(probe.stdout)).streams;
      assert.ok(
        streams.some((stream: { codec_name: string }) =>
          stream.codec_name === "h264"
        ),
      );
      assert.ok(
        streams.some((stream: { codec_name: string }) =>
          stream.codec_name === "aac"
        ),
      );
      const decode = await new Deno.Command("ffmpeg", {
        args: [
          "-v",
          "error",
          "-i",
          `${directory}/result.mp4`,
          "-f",
          "null",
          "-",
        ],
        stdout: "null",
        stderr: "piped",
      }).output();
      assert.equal(decode.success, true);
      if (extension === "wav") {
        const another = await Deno.open(source);
        await assert.rejects(
          () =>
            convertAudio(another.readable, 20, new AbortController().signal),
          { status: 413 },
        );
      }
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  });
}
Deno.test("rejects non-audio input and cleans up after cancellation", async () => {
  await assert.rejects(
    () =>
      convertAudio(
        new Blob(["not audio"]).stream(),
        1024,
        new AbortController().signal,
      ),
    { status: 422 },
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => convertAudio(new Blob(["test"]).stream(), 1024, controller.signal),
    { status: 499 },
  );
});
