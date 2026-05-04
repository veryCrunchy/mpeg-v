import { Authorization } from "@mpeg-v/utils";
import type { TranslationSession } from "@mpeg-v/types";

const INSTANCE_ID = crypto.randomUUID?.() ??
  Math.random().toString(36).slice(2);

export function botInstanceId() {
  return INSTANCE_ID;
}

export async function createTranslationSession(
  session: Omit<
    TranslationSession,
    "bot_instance_id" | "date_created" | "date_updated"
  >,
) {
  await sessionRequest("/translation-sessions", {
    method: "POST",
    body: {
      ...session,
      bot_instance_id: INSTANCE_ID,
      date_created: new Date().toISOString(),
      date_updated: new Date().toISOString(),
    },
  });
}

export async function updateTranslationSession(
  id: string,
  fields: Partial<TranslationSession>,
) {
  await sessionRequest(`/translation-sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: {
      ...fields,
      date_updated: new Date().toISOString(),
    },
  });
}

export async function listTranslationSessions(): Promise<TranslationSession[]> {
  const response = await sessionRequest("/translation-sessions", {
    method: "GET",
  });
  if (!response) return [];
  const payload = await response.json() as { data?: TranslationSession[] } | TranslationSession[];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.data) ? payload.data : [];
}

async function sessionRequest(
  path: string,
  init: { method: "GET"; body?: never } | { method: "POST" | "PATCH"; body: unknown },
) {
  const base = Deno.env.get("STREAM");
  if (!base) return undefined;

  try {
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        Authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init.method === "GET" ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      throw new Error(
        `Session request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  } catch (error) {
    console.error("Translation session tracking error:", error);
    return undefined;
  }
}
