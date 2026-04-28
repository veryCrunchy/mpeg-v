import type { TranslationSession } from "@mpeg-v/types";

type SessionPatch = Partial<TranslationSession> & { id?: string };

const sessions = new Map<string, TranslationSession>();
let loaded = false;

export async function handleTranslationSessions(req: Request, url: URL) {
  await loadSessions();

  const id = url.pathname.match(/^\/translation-sessions\/([^/]+)$/)?.[1];

  if (url.pathname === "/translation-sessions" && req.method === "POST") {
    const body = await req.json() as TranslationSession;
    if (!body.id) return json({ error: "id is required" }, 400);

    const now = new Date().toISOString();
    const session: TranslationSession = {
      ...body,
      date_created: body.date_created ?? now,
      date_updated: now,
    };
    sessions.set(session.id, session);
    await saveSessions();
    return json(session, 201);
  }

  if (id && req.method === "PATCH") {
    const existing = sessions.get(id);
    if (!existing) return json({ error: "session not found" }, 404);

    const patch = await req.json() as SessionPatch;
    const updated: TranslationSession = {
      ...existing,
      ...patch,
      id: existing.id,
      date_updated: new Date().toISOString(),
    };
    sessions.set(id, updated);
    await saveSessions();
    return json(updated);
  }

  if (id && req.method === "GET") {
    const existing = sessions.get(id);
    if (!existing) return json({ error: "session not found" }, 404);
    return json(withComputedStatus(existing));
  }

  if (url.pathname === "/translation-sessions" && req.method === "GET") {
    const items = [...sessions.values()].map(withComputedStatus);
    return json({ data: items });
  }

  return undefined;
}

async function loadSessions() {
  if (loaded) return;
  loaded = true;

  const path = Deno.env.get("TRANSLATION_SESSIONS_FILE");
  if (!path) return;

  try {
    const items = JSON.parse(
      await Deno.readTextFile(path),
    ) as TranslationSession[];
    for (const item of items) {
      if (item.id) sessions.set(item.id, item);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error("Failed to load translation sessions:", error);
    }
  }
}

async function saveSessions() {
  const path = Deno.env.get("TRANSLATION_SESSIONS_FILE");
  if (!path) return;

  try {
    const parent = path.split("/").slice(0, -1).join("/");
    if (parent) await Deno.mkdir(parent, { recursive: true });
    await Deno.writeTextFile(
      path,
      JSON.stringify([...sessions.values()], null, 2),
    );
  } catch (error) {
    console.error("Failed to save translation sessions:", error);
  }
}

function withComputedStatus(session: TranslationSession): TranslationSession {
  const updatedAt = new Date(session.date_updated ?? session.date_created ?? 0)
    .getTime();
  if (
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt > 45_000 &&
    !["stopped", "failed", "stale"].includes(session.status)
  ) {
    return {
      ...session,
      status: "stale",
      status_message: "No heartbeat from the bot recently.",
    };
  }
  return session;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}
