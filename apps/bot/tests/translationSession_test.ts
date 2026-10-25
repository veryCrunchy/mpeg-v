import { strict as assert } from "node:assert";
import {
  createTranslationSession,
  createTranslationSessionId,
} from "../utils/translationSessions.ts";

Deno.test("new caption links use complete random UUIDs without Discord identifiers", () => {
  const ids = Array.from({ length: 100 }, () => createTranslationSessionId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(
      id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  }
});

Deno.test("bot startup reports a tracking failure instead of continuing without a saved session", async () => {
  const previousStream = Deno.env.get("STREAM");
  const previousFetch = globalThis.fetch;
  const previousLog = console.error;
  let logged = false;
  let cancelled = false;
  try {
    Deno.env.set("STREAM", "http://worker.example.test");
    console.error = () => {
      logged = true;
    };
    globalThis.fetch = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 503 },
        ),
      );
    await assert.rejects(() =>
      createTranslationSession({
        id: "synthetic-session",
        guild_id: "synthetic-guild",
        voice_channel_id: "synthetic-voice-channel",
        text_channel_id: "synthetic-text-channel",
        room_id: "synthetic-session",
        live_url: "https://captions.example.test/discord/synthetic-session",
        source_language: "auto",
        target_languages: ["en"],
        status: "starting",
      }), /could not be saved/);
    assert.equal(cancelled, true);
    assert.equal(logged, true);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousLog;
    if (previousStream === undefined) Deno.env.delete("STREAM");
    else Deno.env.set("STREAM", previousStream);
  }
});
