import type { TranslationSession } from "@mpeg-v/types";
import { isAuthorized } from "@mpeg-v/utils";
import { errorResponse, HttpError, readJson } from "./http.ts";
import {
  sessionFile,
  TranslationSessionStore,
} from "./translationSessionStore.ts";

export function createTranslationSessionsHandler(
  store: TranslationSessionStore,
) {
  return async (req: Request, url: URL): Promise<Response> => {
    // Metadata and live caption URLs are private service data, including reads.
    // Check before loading storage or parsing the body to avoid existence leaks.
    if (!isAuthorized(req)) return json({ error: "Unauthorized." }, 401);
    try {
      const collection = url.pathname === "/translation-sessions";
      const match = url.pathname.match(/^\/translation-sessions\/([^/]+)$/);
      if (!collection && !match) throw new HttpError(404, "Not found.");
      const id = match?.[1];

      if (collection && req.method === "POST") {
        return json(await store.create(await readJson(req)), 201);
      }
      if (id && req.method === "PATCH") {
        return json(await store.update(id, await readJson(req)));
      }
      if (id && req.method === "GET") {
        const session = await store.get(id);
        if (!session) throw new HttpError(404, "Session not found.");
        return json(withComputedStatus(session));
      }
      if (collection && req.method === "GET") {
        return json({ data: (await store.list()).map(withComputedStatus) });
      }
      return new Response(null, {
        status: 405,
        headers: {
          "Cache-Control": "no-store",
          Allow: collection ? "GET, POST" : "GET, PATCH",
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

const path = Deno.env.get("TRANSLATION_SESSIONS_FILE")?.trim();
export const handleTranslationSessions = createTranslationSessionsHandler(
  new TranslationSessionStore(path ? sessionFile(path) : undefined),
);

function withComputedStatus(session: TranslationSession): TranslationSession {
  const updatedAt = new Date(session.date_updated ?? session.date_created ?? 0)
    .getTime();
  if (
    Number.isFinite(updatedAt) && Date.now() - updatedAt > 45_000 &&
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
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
