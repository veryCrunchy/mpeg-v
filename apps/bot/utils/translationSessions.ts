import { createItem, updateItem } from "@mpeg-v/utils";
import { BotItem, type TranslationSession } from "@mpeg-v/types";

const INSTANCE_ID = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

export function botInstanceId() {
  return INSTANCE_ID;
}

export async function createTranslationSession(
  session: Omit<TranslationSession, "bot_instance_id" | "date_created" | "date_updated">,
) {
  await createItem(BotItem.TranslationSessions, {
    ...session,
    bot_instance_id: INSTANCE_ID,
    date_created: new Date().toISOString(),
    date_updated: new Date().toISOString(),
  });
}

export async function updateTranslationSession(
  id: string,
  fields: Partial<TranslationSession>,
) {
  await updateItem(BotItem.TranslationSessions, id, {
    ...fields,
    date_updated: new Date().toISOString(),
  });
}
