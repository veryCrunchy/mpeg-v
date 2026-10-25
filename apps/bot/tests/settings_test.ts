import { strict as assert } from "node:assert";
import type { CommandContext } from "seyfert";
import { PermissionsBitField } from "seyfert/lib/structures/extra/Permissions.js";
import { PreferencesStore } from "../../serve/preferencesStore.ts";
const previousToken = Deno.env.get("API_TOKEN");
Deno.env.set("API_TOKEN", "synthetic-settings-token");
const { handlePreferences } = await import("../../serve/preferences.ts");
const { default: Settings, runSettings } = await import(
  "../commands/slash/settings.ts"
);
if (previousToken === undefined) Deno.env.delete("API_TOKEN");
else Deno.env.set("API_TOKEN", previousToken);

function context(
  options: Record<string, unknown>,
  permissions = 0n,
  guildId: string | undefined = "200",
) {
  const deferred: boolean[] = [],
    replies: { content: string; allowed_mentions: { parse: string[] } }[] = [];
  const ctx = {
    options,
    guildId,
    author: { id: "100" },
    member: { permissions: new PermissionsBitField(permissions) },
    deferReply: (privateReply: boolean) => deferred.push(privateReply),
    editOrReply: (body: typeof replies[number]) => replies.push(body),
  } as unknown as CommandContext;
  return { ctx, deferred, replies };
}
Deno.test("settings command registers personal and server defaults with bounded options", () => {
  const command = new Settings().toJSON();
  assert.deepEqual(command.integration_types, [0, 1]);
  assert.deepEqual(command.contexts, [0, 1, 2]);
  assert.deepEqual(command.options.map((option) => option.name), [
    "show",
    "audio-video",
    "reset",
  ]);
  for (const group of command.options) {
    assert.ok(group.description.length <= 100);
    const children = "options" in group ? group.options ?? [] : [];
    assert.ok(children.length <= 25);
    for (const option of children) assert.ok(option.description.length <= 100);
  }
});
Deno.test("bot settings stay private, enforce server permission and inherit after reset", async () => {
  const previous = Deno.env.get("STREAM"), originalFetch = globalThis.fetch;
  const database = new PreferencesStore(":memory:");
  let calls = 0;
  Deno.env.set("STREAM", "http://worker.example");
  globalThis.fetch = (url, init) => {
    calls++;
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer synthetic-settings-token",
    );
    return handlePreferences(
      new Request(url, init),
      () => database,
      () => true,
    );
  };
  try {
    const denied = context({ scope: "guild", color: "#ffffff" });
    await runSettings(denied.ctx, "save");
    assert.equal(calls, 0);
    assert.match(denied.replies[0].content, /Manage Server/);
    assert.deepEqual(denied.deferred, [true]);
    assert.deepEqual(denied.replies[0].allowed_mentions.parse, []);
    const server = context({
      scope: "guild",
      color: "#abcdef",
      visualization: "bars",
    }, 32n);
    await runSettings(server.ctx, "save");
    assert.equal(database.get("guild", "200").values.color, "#abcdef");
    const personal = context({ color: "#123456" });
    await runSettings(personal.ctx, "save");
    assert.equal(database.resolve("100", "200").color, "#123456");
    assert.equal(database.resolve("101", "200").color, "#abcdef");
    await runSettings(context({ setting: "color" }).ctx, "reset");
    assert.equal(database.resolve("100", "200").color, "#abcdef");
    const view = context({ scope: "guild" });
    await runSettings(view.ctx, "show");
    assert.match(view.replies[0].content, /abcdef/);
    await runSettings(context({ scope: "guild", fps: 30 }, 8n).ctx, "save");
    assert.equal(database.get("guild", "200").values.fps, 30);
    const dm = context({ scope: "guild" });
    Object.assign(dm.ctx, { guildId: undefined });
    const before = calls;
    await runSettings(dm.ctx, "save");
    assert.equal(calls, before);
    assert.match(dm.replies[0].content, /inside a server/);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
    if (previous === undefined) Deno.env.delete("STREAM");
    else Deno.env.set("STREAM", previous);
  }
});
Deno.test("bot settings report concurrent changes without overwriting the other edit", async () => {
  const previous = Deno.env.get("STREAM"), originalFetch = globalThis.fetch;
  const database = new PreferencesStore(":memory:");
  Deno.env.set("STREAM", "http://worker.example");
  globalThis.fetch = (url, init) => {
    if (init?.method === "PATCH") {
      database.patch("user", "100", { color: "#123456" }, null);
    }
    return handlePreferences(
      new Request(url, init),
      () => database,
      () => true,
    );
  };
  try {
    const value = context({ color: "#ffffff" });
    await runSettings(value.ctx, "save");
    assert.match(value.replies[0].content, /changed elsewhere/);
    assert.equal(database.get("user", "100").values.color, "#123456");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
    if (previous === undefined) Deno.env.delete("STREAM");
    else Deno.env.set("STREAM", previous);
  }
});
