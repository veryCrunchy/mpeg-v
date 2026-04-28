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

async function sessionRequest(
  path: string,
  init: { method: "POST" | "PATCH"; body: unknown },
) {
  const base = Deno.env.get("STREAM");
  if (!base) return;

  try {
    const response = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        Authorization,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(init.body),
    });

    if (!response.ok) {
      throw new Error(
        `Session request failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Translation session tracking error:", error);
  }
}
