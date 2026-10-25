import { strict as assert } from "node:assert";
import { filterAudioFiles, isValidAudioFile } from "../utils/generateVideo.ts";

Deno.test("audio detection handles uppercase names and voice-note Opus files", () => {
  assert.equal(isValidAudioFile("AUDIO.MP3"), true);
  assert.equal(isValidAudioFile("voice.opus"), true);
  assert.equal(isValidAudioFile("mp3"), false);
  assert.equal(isValidAudioFile("not-audio.mp3.exe"), false);
});
Deno.test("attachment filtering preserves all audio files in order", () => {
  const audio = [{ filename: "one.wav" }, { filename: "two.FLAC" }];
  assert.deepEqual(
    filterAudioFiles([audio[0], { filename: "photo.png" }, audio[1]]),
    audio,
  );
  assert.throws(() => filterAudioFiles([{ filename: "document.pdf" }]));
});
