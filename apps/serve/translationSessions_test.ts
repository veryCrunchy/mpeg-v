import { strict as assert } from "node:assert";
import { join } from "node:path";
import type { TranslationSession } from "@mpeg-v/types";
import {
  sessionFile,
  TranslationSessionStore,
} from "./translationSessionStore.ts";

// Only synthetic credentials/state. Never load the operator's session file.
const previousToken = Deno.env.get("API_TOKEN");
const previousFile = Deno.env.get("TRANSLATION_SESSIONS_FILE");
const token = "synthetic-session-test-token";
Deno.env.set("API_TOKEN", token);
Deno.env.delete("TRANSLATION_SESSIONS_FILE");
const { handleRequest } = await import("./main.ts");
const { createTranslationSessionsHandler } = await import(
  "./translationSessions.ts"
);
if (previousToken === undefined) Deno.env.delete("API_TOKEN");
else Deno.env.set("API_TOKEN", previousToken);
if (previousFile !== undefined) {
  Deno.env.set("TRANSLATION_SESSIONS_FILE", previousFile);
}

function fixture(id = "synthetic-session"): TranslationSession {
  return {
    id,
    guild_id: "synthetic-guild",
    voice_channel_id: "synthetic-voice-channel",
    text_channel_id: "synthetic-text-channel",
    room_id: id,
    live_url: `https://captions.example.test/discord/${id}`,
    source_language: "auto",
    target_languages: ["en"],
    post_to_discord: false,
    status: "starting",
    bot_instance_id: "synthetic-bot",
  };
}

function request(
  path = "",
  method = "GET",
  body?: unknown,
  authorization = `Bearer ${token}`,
) {
  return new Request(`http://localhost/translation-sessions${path}`, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Origin: "https://example.test",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function handler(store: TranslationSessionStore) {
  const handle = createTranslationSessionsHandler(store);
  return (req: Request) => handle(req, new URL(req.url));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

Deno.test("session routes require service authorization without leaking existence or enabling CORS", async () => {
  const created = await handleRequest(request("", "POST", fixture()));
  assert.equal(created.status, 201);
  for (const authorization of ["", "Bearer undefined", "Bearer wrong-token"]) {
    for (
      const path of [
        "",
        "/synthetic-session",
        "/missing",
        "/synthetic-session/extra",
      ]
    ) {
      for (const method of ["GET", "POST", "PATCH", "OPTIONS"]) {
        const response = await handleRequest(
          request(path, method, undefined, authorization),
        );
        assert.equal(response.status, 401);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
        assert.deepEqual(await response.json(), { error: "Unauthorized." });
      }
    }
  }
  const authorized = await handleRequest(request("/synthetic-session"));
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).live_url, fixture().live_url);
  assert.equal(authorized.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(authorized.headers.get("Cache-Control"), "no-store");
});

Deno.test("unauthorized session requests never load storage", async () => {
  let loads = 0;
  const handle = handler(
    new TranslationSessionStore({
      load() {
        loads++;
        return Promise.reject(new Error("Storage must not be touched."));
      },
      save() {
        return Promise.reject(new Error("Storage must not be touched."));
      },
    }),
  );
  assert.equal((await handle(request("", "GET", undefined, ""))).status, 401);
  assert.equal(loads, 0);
});

Deno.test("authenticated session CRUD validates payloads and rejects accidental overwrites", async () => {
  const handle = handler(new TranslationSessionStore());
  const created = await handle(request("", "POST", fixture()));
  const initial = await created.json();
  assert.equal(created.status, 201);
  assert.ok(initial.date_created);
  assert.equal((await handle(request("", "POST", fixture()))).status, 409);
  assert.equal(
    (await handle(request("/missing", "PATCH", { status: "ready" }))).status,
    404,
  );
  assert.equal((await handle(request("/missing"))).status, 404);
  assert.equal(
    (await handle(request("/synthetic-session", "DELETE"))).status,
    405,
  );
  for (
    const patch of [
      { id: "other" },
      { date_created: "2020-01-01T00:00:00.000Z" },
      { status: "nonsense" },
      { target_languages: [] },
      { guild_id: null },
      { extra: true },
    ]
  ) {
    assert.equal(
      (await handle(request("/synthetic-session", "PATCH", patch))).status,
      400,
    );
  }
  for (
    const body of [null, [], {}, { ...fixture(), id: "../private" }, {
      ...fixture(),
      post_to_discord: "false",
    }]
  ) {
    assert.equal((await handle(request("", "POST", body))).status, 400);
  }
  const invalidJson = request("", "POST");
  const invalid = await handle(new Request(invalidJson, { body: "{" }));
  assert.equal(invalid.status, 400);
  const oversized = await handle(
    request("", "POST", {
      ...fixture(),
      status_message: "x".repeat(17 * 1024),
    }),
  );
  assert.equal(oversized.status, 413);
  const updated = await handle(
    request("/synthetic-session", "PATCH", {
      status: "ready",
      date_updated: "2020-01-01T00:00:00.000Z",
    }),
  );
  const saved = await updated.json();
  assert.equal(saved.status, "ready");
  assert.equal(saved.date_created, initial.date_created);
  assert.notEqual(saved.date_updated, "2020-01-01T00:00:00.000Z");
  const list = await handle(request());
  assert.deepEqual((await list.json()).data, [saved]);
});

Deno.test("concurrent startup reads and writes wait for the entire initial load", async () => {
  const started = deferred<void>();
  const loaded = deferred<unknown>();
  let loads = 0;
  let saves = 0;
  const store = new TranslationSessionStore({
    load() {
      loads++;
      started.resolve();
      return loaded.promise;
    },
    save() {
      saves++;
      return Promise.resolve();
    },
  });
  const first = store.list();
  await started.promise;
  let settled = false;
  const read = store.get("existing").then((value) => {
    settled = true;
    return value;
  });
  const write = store.create(fixture("new"));
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(saves, 0);
  loaded.resolve([fixture("existing")]);
  assert.equal((await first).length, 1);
  assert.equal((await read)?.id, "existing");
  await write;
  assert.equal(loads, 1);
  assert.equal((await store.list()).length, 2);
});

Deno.test("overlapping writes serialize, merge patches, and publish only after saving", async () => {
  const entered = deferred<void>();
  const release = deferred<void>();
  let active = 0;
  let maximum = 0;
  let writes = 0;
  let disk = [fixture()];
  const store = new TranslationSessionStore({
    load: () => Promise.resolve(disk),
    async save(items) {
      active++;
      maximum = Math.max(maximum, active);
      if (++writes === 1) {
        entered.resolve();
        await release.promise;
      }
      disk = structuredClone(items);
      active--;
    },
  });
  const first = store.update("synthetic-session", { status: "ready" });
  await entered.promise;
  const second = store.update("synthetic-session", { post_to_discord: true });
  const third = store.create(fixture("second"));
  let settled = false;
  const read = store.list().then((items) => {
    settled = true;
    return items;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(disk[0].status, "starting");
  release.resolve();
  await Promise.all([first, second, third]);
  assert.equal(maximum, 1);
  assert.equal(writes, 3);
  assert.equal(disk[0].status, "ready");
  assert.equal(disk[0].post_to_discord, true);
  assert.deepEqual(await read, disk);
});

Deno.test("failed saves return 503, keep the prior state, and do not poison later writes", async () => {
  let fail = true;
  let disk = [fixture()];
  const store = new TranslationSessionStore({
    load: () => Promise.resolve(disk),
    save(items) {
      if (fail) {
        return Promise.reject(
          new Error("Synthetic private filesystem detail."),
        );
      }
      disk = structuredClone(items);
      return Promise.resolve();
    },
  });
  const handle = handler(store);
  const response = await handle(
    request("/synthetic-session", "PATCH", { status: "ready" }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Translation session changes could not be saved.",
  });
  assert.equal((await store.get("synthetic-session"))?.status, "starting");
  assert.equal(disk[0].status, "starting");
  assert.equal(
    (await handle(request("", "POST", fixture("failed-new")))).status,
    503,
  );
  assert.equal(await store.get("failed-new"), undefined);
  fail = false;
  assert.equal(
    (await handle(request("/synthetic-session", "PATCH", { status: "ready" })))
      .status,
    200,
  );
  assert.equal(disk[0].status, "ready");
});

Deno.test("real file storage preserves concurrent updates and reloads legacy IDs after restart", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-sessions-" });
  try {
    const path = join(directory, "nested", "sessions.json");
    const store = new TranslationSessionStore(sessionFile(path));
    const legacy = "100000000000000001-100000000000000002-deadbeef";
    await store.create(fixture(legacy));
    await Promise.all([
      ...Array.from(
        { length: 20 },
        (_, index) => store.create(fixture(`session-${index}`)),
      ),
      store.update(legacy, { status: "ready" }),
      store.update(legacy, { target_languages: ["nl", "en"] }),
    ]);
    const expected = await store.list();
    assert.equal(expected.length, 21);
    assert.deepEqual(JSON.parse(await Deno.readTextFile(path)), expected);
    const restarted = new TranslationSessionStore(sessionFile(path));
    assert.deepEqual(await restarted.list(), expected);
    assert.equal((await restarted.get(legacy))?.status, "ready");
    assert.deepEqual((await restarted.get(legacy))?.target_languages, [
      "nl",
      "en",
    ]);
    const names = [];
    for await (const entry of Deno.readDir(join(directory, "nested"))) {
      names.push(entry.name);
    }
    assert.deepEqual(names, ["sessions.json"]);
    if (Deno.build.os !== "windows") {
      assert.equal((await Deno.stat(path)).mode! & 0o777, 0o600);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("corrupt or invalid snapshots fail closed without overwrite and can be repaired", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-sessions-" });
  try {
    const path = join(directory, "sessions.json");
    for (
      const corrupt of [
        "{",
        "{}",
        JSON.stringify([fixture(), { id: "incomplete" }]),
        JSON.stringify([fixture(), fixture()]),
      ]
    ) {
      await Deno.writeTextFile(path, corrupt);
      const store = new TranslationSessionStore(sessionFile(path));
      const handle = handler(store);
      const results = await Promise.all([
        handle(request()),
        handle(request("", "POST", fixture("new"))),
        handle(request("/synthetic-session", "PATCH", { status: "ready" })),
      ]);
      for (const response of results) {
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
          error: "Translation session storage could not be loaded.",
        });
      }
      assert.equal(await Deno.readTextFile(path), corrupt);
      await Deno.writeTextFile(path, JSON.stringify([fixture("repaired")]));
      assert.deepEqual(await store.list(), [fixture("repaired")]);
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("an unreadable store is not treated as empty and retries after repair", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-sessions-" });
  try {
    const path = join(directory, "sessions.json");
    await Deno.mkdir(path);
    const store = new TranslationSessionStore(sessionFile(path));
    await assert.rejects(() => store.list(), { status: 503 });
    await Deno.remove(path);
    await Deno.writeTextFile(path, JSON.stringify([fixture()]));
    assert.deepEqual(await store.list(), [fixture()]);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("failed file replacement preserves the destination and cleans incomplete snapshots", async () => {
  const directory = await Deno.makeTempDir({ prefix: "mpeg-v-sessions-" });
  try {
    const path = join(directory, "sessions.json");
    await Deno.mkdir(path);
    await Deno.writeTextFile(join(path, "sentinel"), "preserve");
    await assert.rejects(() => sessionFile(path).save([fixture()]));
    assert.equal(await Deno.readTextFile(join(path, "sentinel")), "preserve");
    const names = [];
    for await (const entry of Deno.readDir(directory)) names.push(entry.name);
    assert.deepEqual(names, ["sessions.json"]);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("stale status is computed for reads without changing persisted resume state", async () => {
  const old = {
    ...fixture(),
    status: "ready" as const,
    date_updated: "2020-01-01T00:00:00.000Z",
  };
  let writes = 0;
  const store = new TranslationSessionStore({
    load: () => Promise.resolve([old]),
    save: () => {
      writes++;
      return Promise.resolve();
    },
  });
  const handle = handler(store);
  const response = await handle(request("/synthetic-session"));
  assert.equal((await response.json()).status, "stale");
  assert.equal((await store.get("synthetic-session"))?.status, "ready");
  assert.equal(writes, 0);
});
