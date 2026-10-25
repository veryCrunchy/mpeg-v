import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nextTools, workflowMode } from "../utils/workflow";
test("output workflows offer compatible tools and select the correct input operation", () => {
  assert.deepEqual(nextTools("picture.PNG").map((t) => t.id), [
    "image",
    "pdf",
    "zip",
    "hash",
  ]);
  assert.deepEqual(nextTools("video.mp4").map((t) => t.id), [
    "video",
    "audio-format",
    "zip",
    "hash",
  ]);
  assert.deepEqual(nextTools("unknown.bin").map((t) => t.id), ["zip", "hash"]);
  assert.equal(workflowMode("picture.jpg", "pdf").pdf, "images");
  assert.equal(workflowMode("pages.pdf", "pdf").pdf, "merge");
  assert.equal(workflowMode("results.zip", "zip").archive, "extract");
  assert.equal(workflowMode("notes.txt.gz", "zip").archive, "gunzip");
});
