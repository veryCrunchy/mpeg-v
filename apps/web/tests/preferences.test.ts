import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  preferenceOwner,
  servicePreferences,
  verifySettingsGuild,
} from "../server/utils/preferences";
import {
  mergeAudioVideoPatch,
  resolveAudioVideo,
  visualizationFilter,
} from "../utils/core/audioVideo";
test("server preferences require verified membership and Manage Server or administrator access", async () => {
  const response = (permissions: string, owner = false) =>
    (async () =>
      Response.json([{ id: "100", owner, permissions }])) as typeof fetch;
  assert.equal(
    await verifySettingsGuild("Bearer synthetic", "100", false, response("0")),
    false,
  );
  await assert.rejects(
    () => verifySettingsGuild("Bearer synthetic", "100", true, response("0")),
    { statusCode: 403 },
  );
  for (const bits of ["32", "8"]) {
    assert.equal(
      await verifySettingsGuild(
        "Bearer synthetic",
        "100",
        true,
        response(bits),
      ),
      true,
    );
  }
  assert.equal(
    await verifySettingsGuild(
      "Bearer synthetic",
      "100",
      true,
      response("0", true),
    ),
    true,
  );
  await assert.rejects(
    () => verifySettingsGuild("Bearer synthetic", "999", false, response("32")),
    { statusCode: 403 },
  );
  await assert.rejects(
    () =>
      verifySettingsGuild(
        "Bearer synthetic",
        "100",
        true,
        (async () => new Response(null, { status: 401 })) as typeof fetch,
      ),
    { statusCode: 403 },
  );
  assert.equal(preferenceOwner("user", "100", "999"), "100");
  assert.throws(() => preferenceOwner("guild", "100"));
});
test("settings service uses a server credential and reports conflicts instead of silent success", async () => {
  const fetcher = (async (url, init) => {
    assert.equal(url, "http://worker.example/preferences/user/100");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-service-token",
    );
    return new Response(null, { status: 409 });
  }) as typeof fetch;
  await assert.rejects(
    () =>
      servicePreferences(
        "http://worker.example",
        "synthetic-service-token",
        "user",
        "100",
        "PATCH",
        { revision: null, changes: { fps: 30 } },
        fetcher,
      ),
    { statusCode: 409 },
  );
  await assert.rejects(() => servicePreferences("", "", "user", "100"), {
    statusCode: 503,
  });
});
test("shared settings preserve inheritance and never permit filter expression injection", () => {
  const personal = mergeAudioVideoPatch({ fps: 30, color: "#112233" }, {
    color: null,
  });
  assert.deepEqual(personal, { fps: 30 });
  assert.equal(
    resolveAudioVideo({ color: "#abcdef" }, personal).color,
    "#abcdef",
  );
  assert.match(visualizationFilter({ visualization: "bars" }), /showfreqs/);
  assert.throws(() =>
    visualizationFilter({ background: "#ffffff;movie=secret" })
  );
});
