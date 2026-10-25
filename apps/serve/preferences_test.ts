import { strict as assert } from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { PreferencesStore } from "./preferencesStore.ts";
import { handlePreferences } from "./preferences.ts";
import { convertAudio } from "./converter.ts";
import {
  defaultAudioVideo,
  resolveAudioVideo,
  validateAudioVideoPatch,
  visualizationFilter,
  visualizationStyles,
} from "../web/utils/core/audioVideo.ts";

Deno.test("preferences validate filter inputs and inherit individual fields in the documented order", () => {
  assert.equal(
    resolveAudioVideo({ color: "#123456", fps: 24 }, { color: "#ABCDEF" }, {
      size: "wide",
    }).color,
    "#abcdef",
  );
  assert.equal(resolveAudioVideo({ fps: 24 }, { color: "#abcdef" }).fps, 24);
  for (
    const value of [
      { color: "red;movie=/private" },
      { background: "#000000:foo" },
      { fps: 1000 },
      { size: "4000x4000" },
      { visualization: "movie" },
      { unknown: true },
      [],
      null,
      JSON.parse('{"__proto__":{}}'),
    ]
  ) assert.throws(() => validateAudioVideoPatch(value));
  assert.throws(() => visualizationFilter({ color: "#123" }));
});
Deno.test("SQLite settings persist across reopen, isolate scopes and protect concurrent edits", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-settings-test-" });
  const path = `${directory}/settings.sqlite`;
  let first: PreferencesStore | undefined, second: PreferencesStore | undefined;
  try {
    first = new PreferencesStore(path);
    const server = first.patch("guild", "100", {
      visualization: "bars",
      fps: 24,
      color: "#abcdef",
    }, null);
    const user = first.patch("user", "100", { color: "#112233" }, null);
    assert.equal(first.resolve("100", "100").color, "#112233");
    assert.equal(first.resolve("101", "100").color, "#abcdef");
    assert.equal(
      first.resolve("100", "100", { color: "#ffffff" }).color,
      "#ffffff",
    );
    first.close();
    first = new PreferencesStore(path);
    second = new PreferencesStore(path);
    assert.equal(second.get("guild", "100").revision, server.revision);
    const changed = second.patch(
      "user",
      "100",
      { size: "wide" },
      user.revision,
    );
    assert.throws(
      () => first!.patch("user", "100", { fps: 30 }, user.revision),
      { status: 409 },
    );
    assert.equal(first.get("user", "100").values.size, "wide");
    const inherited = first.patch(
      "user",
      "100",
      { color: null },
      changed.revision,
    );
    assert.equal(first.resolve("100", "100").color, "#abcdef");
    first.reset("user", "100", inherited.revision);
    assert.deepEqual(first.get("user", "100"), { values: {}, revision: null });
    const recreated = first.patch("user", "100", { color: "#ffffff" }, null);
    assert.notEqual(recreated.revision, user.revision);
    assert.throws(() => second!.reset("user", "100", user.revision), {
      status: 409,
    });
    assert.deepEqual(first.get("user", "999"), { values: {}, revision: null });
  } finally {
    first?.close();
    second?.close();
    await Deno.remove(directory, { recursive: true });
  }
});
Deno.test("private settings route checks auth before opening storage and fails closed on invalid data", async () => {
  let opened = false;
  const denied = await handlePreferences(
    new Request("http://local/preferences/user/100"),
    () => {
      opened = true;
      throw new Error();
    },
    () => false,
  );
  assert.equal(denied.status, 401);
  assert.equal(opened, false);
  const database = new PreferencesStore(":memory:");
  const call = (method: string, body?: unknown, path = "user/100") =>
    handlePreferences(
      new Request(`http://local/preferences/${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      () => database,
      () => true,
    );
  try {
    const initial = await call("GET");
    assert.equal(initial.headers.get("Cache-Control"), "no-store");
    assert.equal(initial.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(
      (await call("PATCH", { changes: { color: "#00ff00" } })).status,
      400,
    );
    assert.equal(
      (await call("PATCH", { revision: null, changes: { bad: 1 } })).status,
      400,
    );
    const saved =
      await (await call("PATCH", { revision: null, changes: { fps: 30 } }))
        .json();
    assert.equal(
      (await call("PATCH", { revision: null, changes: { fps: 15 } })).status,
      409,
    );
    assert.equal(
      (await call("DELETE", { revision: saved.revision })).status,
      200,
    );
    assert.equal((await call("GET", undefined, "guild/100")).status, 200);
    assert.equal((await call("GET", undefined, "user/invalid")).status, 404);
  } finally {
    database.close();
  }
});
Deno.test("corrupt and future SQLite databases are preserved rather than replaced", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "mpeg-v-settings-corrupt-",
  });
  try {
    const bad = `${directory}/bad.sqlite`,
      bytes = new TextEncoder().encode("not a database");
    await Deno.writeFile(bad, bytes);
    assert.throws(() => new PreferencesStore(bad));
    assert.deepEqual(await Deno.readFile(bad), bytes);
    const path = `${directory}/future.sqlite`, db = new DatabaseSync(path);
    db.exec(
      "PRAGMA user_version=99; CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES('kept')",
    );
    db.close();
    assert.throws(() => new PreferencesStore(path), /version/);
    const verify = new DatabaseSync(path);
    assert.equal(
      (verify.prepare("SELECT value FROM preserved").get() as { value: string })
        .value,
      "kept",
    );
    verify.close();
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
async function media(command: string, args: string[]) {
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.success, true, new TextDecoder().decode(result.stderr));
  return result.stdout;
}
Deno.test("all audio visualization styles render chosen dimensions, frame rate and colors with native FFmpeg", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-style-test-" });
  try {
    const input = await media("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-f",
      "wav",
      "pipe:1",
    ]);
    for (const visualization of visualizationStyles) {
      const result = await convertAudio(
        new Blob([input]).stream(),
        1024 * 1024,
        new AbortController().signal,
        {
          visualization,
          color: "#ff0000",
          background: "#203040",
          size: "standard",
          fps: 24,
          bitrate: 64,
        },
      );
      const path = `${directory}/${visualization}.mp4`;
      await Deno.writeFile(path, result.bytes);
      const probe = JSON.parse(
        new TextDecoder().decode(
          await media("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "json",
            path,
          ]),
        ),
      ).streams[0];
      assert.equal(probe.width, 500);
      assert.equal(probe.height, 200);
      assert.equal(probe.r_frame_rate, "24/1");
      const pixels = await media("ffmpeg", [
        "-v",
        "error",
        "-ss",
        "0.2",
        "-i",
        path,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
      let background = 0, foreground = 0;
      for (let i = 0; i < pixels.length; i += 3) {
        if (
          Math.abs(pixels[i] - 32) < 12 && Math.abs(pixels[i + 1] - 48) < 12 &&
          Math.abs(pixels[i + 2] - 64) < 12
        ) background++;
        if (
          pixels[i] > 120 && pixels[i] > pixels[i + 1] * 2 &&
          pixels[i] > pixels[i + 2] * 2
        ) foreground++;
      }
      assert.ok(
        background > 1000,
        `${visualization} must show the requested background`,
      );
      assert.ok(
        foreground > 10,
        `${visualization} must show the requested foreground`,
      );
    }
    assert.equal(defaultAudioVideo.bitrate, 128);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
