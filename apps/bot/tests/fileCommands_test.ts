import { strict as assert } from "node:assert";
import type { CommandContext } from "seyfert";
// A synthetic service token is captured before importing helpers. No gateway starts.
const previousToken = Deno.env.get("API_TOKEN");
Deno.env.set("API_TOKEN", "synthetic-test-token");
const { default: FileCommands } = await import("../commands/slash/files.ts");
const { default: FileActivityEntry } = await import("../activityEntry.ts");
const { FileJobRegistry, runFileCommand, fileJobs } = await import(
  "../utils/fileJobs.ts"
);
const { launchWorkspace, workspaceUrl } = await import("../utils/activity.ts");
if (previousToken === undefined) Deno.env.delete("API_TOKEN");
else Deno.env.set("API_TOKEN", previousToken);

Deno.test("file commands serialize to a valid slash group for guild and user installs", () => {
  const command = new FileCommands().toJSON();
  assert.equal(command.name, "file");
  assert.deepEqual(command.integration_types, [0, 1]);
  assert.deepEqual(command.contexts, [0, 1, 2]);
  assert.deepEqual(command.options.map((option) => option.name), [
    "image",
    "audio",
    "video",
    "pdf",
    "archive",
    "text",
    "checksum",
    "info",
    "cancel",
  ]);
  for (const option of command.options) {
    assert.ok(option.description.length <= 100);
    const children = "options" in option ? option.options ?? [] : [];
    assert.ok(children.length <= 25);
    let optional = false;
    for (const child of children) {
      if (!child.required) optional = true;
      else {assert.equal(
          optional,
          false,
          `${option.name}: required options must precede optional options`,
        );}
      assert.ok(child.description.length <= 100);
    }
  }
});

Deno.test("file replies are private by default and public only after an explicit choice", async () => {
  const previous = Deno.env.get("STREAM");
  Deno.env.delete("STREAM");
  try {
    for (const [index, publicOption] of [undefined, false, true].entries()) {
      const replies: boolean[] = [];
      const messages: {
        content: string;
        allowed_mentions: { parse: unknown[] };
      }[] = [];
      const ctx = {
        options: {
          file: {
            filename: "notes.txt",
            size: 5,
            url: "https://cdn.discordapp.com/attachments/1/2/notes.txt",
          },
          public: publicOption,
        },
        author: { id: `synthetic-user-${index}` },
        deferReply: (privateReply: boolean) => {
          replies.push(privateReply);
        },
        editOrReply: (message: typeof messages[number]) => {
          messages.push(message);
        },
      } as unknown as CommandContext;
      await runFileCommand(ctx, "info", {});
      assert.deepEqual(replies, [publicOption !== true]);
      assert.match(messages[0].content, /unavailable/);
      assert.deepEqual(messages[0].allowed_mentions.parse, []);
    }
  } finally {
    if (previous !== undefined) Deno.env.set("STREAM", previous);
  }
});

Deno.test("file admission scopes cancellation to the owner and retains the slot until cleanup", () => {
  const jobs = new FileJobRegistry();
  const first = jobs.start("one", 0), second = jobs.start("two", 0);
  assert.throws(() => jobs.start("one", 1), /already/);
  assert.equal(jobs.cancel("missing"), false);
  assert.equal(jobs.cancel("one"), true);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.throws(() => jobs.start("one", 2), /already/);
  jobs.finish("one", first);
  const next = jobs.start("one", 3);
  jobs.finish("one", first);
  assert.throws(() => jobs.start("one", 4), /already/);
  jobs.finish("one", next);
  for (let i = 0; i < 4; i++) {
    const job = jobs.start("one", 5 + i);
    jobs.finish("one", job);
  }
  assert.throws(() => jobs.start("one", 10), /wait a minute/);
  assert.ok(jobs.start("one", 60_010));
});

Deno.test("bot requests forward the interaction limit, return bytes and propagate cancellation", async () => {
  const previous = Deno.env.get("STREAM"), originalFetch = globalThis.fetch;
  Deno.env.set("STREAM", "https://worker.example/");
  const messages: Record<string, unknown>[] = [];
  const ctx = {
    options: {
      file: {
        filename: "notes.txt",
        size: 5,
        url: "https://cdn.discordapp.com/attachments/1/2/notes.txt",
      },
    },
    author: { id: "synthetic-result-user" },
    interaction: { attachmentSizeLimit: 1234 },
    deferReply: () => {},
    editOrReply: (body: Record<string, unknown>) => {
      messages.push(body);
    },
  } as unknown as CommandContext;
  try {
    globalThis.fetch = (url, init) => {
      assert.equal(String(url), "https://worker.example/tools/file");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer synthetic-test-token",
      );
      assert.equal(JSON.parse(init?.body as string).maxOutputBytes, 1234);
      return Promise.resolve(
        new Response("converted", { headers: { "X-File-Name": "result.txt" } }),
      );
    };
    await runFileCommand(ctx, "info", {});
    assert.equal((messages[0].files as unknown[]).length, 1);
    assert.match(messages[0].content as string, /ready/);
    globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason), { once: true });
        fileJobs.cancel("synthetic-result-user");
      });
    await runFileCommand(ctx, "info", {});
    assert.match(messages[1].content as string, /Cancelled/);
    globalThis.fetch = () =>
      Promise.resolve(new Response(new Uint8Array(1235)));
    await runFileCommand(ctx, "info", {});
    assert.match(messages[2].content as string, /too large/);
    assert.equal(messages[2].files, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) Deno.env.delete("STREAM");
    else Deno.env.set("STREAM", previous);
  }
});

Deno.test("Activity launch stays gated and uses the initial type 12 response when enabled", async () => {
  const previous = Deno.env.get("DISCORD_ACTIVITY_ENABLED");
  const replies: unknown[] = [], messages: { flags: number }[] = [];
  const ctx = {
    write: (body: { flags: number }) => {
      messages.push(body);
    },
    interaction: {
      reply: (body: unknown) => {
        replies.push(body);
      },
    },
  } as unknown as CommandContext;
  try {
    Deno.env.set("DISCORD_ACTIVITY_ENABLED", "false");
    await launchWorkspace(ctx);
    assert.equal(messages[0].flags, 64);
    assert.equal(replies.length, 0);
    Deno.env.set("DISCORD_ACTIVITY_ENABLED", "true");
    await launchWorkspace(ctx);
    assert.deepEqual(replies, [{ type: 12 }]);
    const entry = new FileActivityEntry().toJSON();
    assert.equal(entry.type, 4);
    assert.equal(entry.handler, 1);
  } finally {
    if (previous === undefined) Deno.env.delete("DISCORD_ACTIVITY_ENABLED");
    else Deno.env.set("DISCORD_ACTIVITY_ENABLED", previous);
  }
  assert.equal(
    workspaceUrl("https://example.com/old?q=1"),
    "https://example.com/workspace",
  );
  for (
    const url of [
      "http://localhost:3100",
      "https://user:pass@example.com",
      "javascript:alert(1)",
    ]
  ) assert.equal(workspaceUrl(url), undefined);
});
