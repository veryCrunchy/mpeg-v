import { dirname, join, resolve } from "node:path";
import type { TranslationSession } from "@mpeg-v/types";
import { HttpError } from "./http.ts";

export interface SessionPersistence {
  load(): Promise<unknown>;
  save(sessions: TranslationSession[]): Promise<void>;
}

export function sessionFile(path: string): SessionPersistence {
  const destination = resolve(path);
  const directory = dirname(destination);
  return {
    async load() {
      try {
        return JSON.parse(await Deno.readTextFile(destination));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return [];
        throw error;
      }
    },
    async save(sessions) {
      await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
      // Keep the replacement on the same filesystem. Never truncate the live file.
      const temporary = join(
        directory,
        `.translation-sessions-${crypto.randomUUID()}.tmp`,
      );
      const file = await Deno.open(temporary, {
        createNew: true,
        write: true,
        mode: 0o600,
      });
      let replaced = false;
      try {
        try {
          const bytes = new TextEncoder().encode(
            JSON.stringify(sessions, null, 2),
          );
          let offset = 0;
          while (offset < bytes.length) {
            const written = await file.write(bytes.subarray(offset));
            if (!written) {
              throw new Error("Session file write made no progress.");
            }
            offset += written;
          }
          await file.sync();
        } finally {
          file.close();
        }
        await Deno.rename(temporary, destination);
        replaced = true;
      } finally {
        if (!replaced) {
          await Deno.remove(temporary).catch(() => {
            console.error(
              "Failed to remove an incomplete translation session snapshot.",
            );
          });
        }
      }
    },
  };
}

// One store owns one file in one worker process. Use a database for replicas.
export class TranslationSessionStore {
  private sessions?: Map<string, TranslationSession>;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly persistence?: SessionPersistence) {}

  list(): Promise<TranslationSession[]> {
    return this.run((sessions) => structuredClone([...sessions.values()]));
  }

  get(id: string): Promise<TranslationSession | undefined> {
    return this.run((sessions) => structuredClone(sessions.get(id)));
  }

  create(body: unknown): Promise<TranslationSession> {
    const input = parseFields(body, false) as TranslationSession;
    return this.run(async (sessions) => {
      if (sessions.has(input.id)) {
        throw new HttpError(409, "Session already exists.");
      }
      const now = new Date().toISOString();
      const session = {
        ...input,
        date_created: input.date_created ?? now,
        date_updated: now,
      };
      await this.commit(new Map(sessions).set(session.id, session));
      return structuredClone(session);
    });
  }

  update(id: string, body: unknown): Promise<TranslationSession> {
    const patch = parseFields(body, true);
    return this.run(async (sessions) => {
      const existing = sessions.get(id);
      if (!existing) throw new HttpError(404, "Session not found.");
      if (
        (patch.id !== undefined && patch.id !== id) ||
        (patch.date_created !== undefined &&
          patch.date_created !== existing.date_created)
      ) {
        throw new HttpError(
          400,
          "Session identity and creation date cannot change.",
        );
      }
      const session = {
        ...existing,
        ...patch,
        id,
        date_updated: new Date().toISOString(),
      };
      await this.commit(new Map(sessions).set(id, session));
      return structuredClone(session);
    });
  }

  private run<T>(
    operation: (sessions: Map<string, TranslationSession>) => T | Promise<T>,
  ): Promise<T> {
    // Include initial load and reads in the queue: no caller can observe a partial
    // load, uncommitted mutation, or a snapshot from an overlapping write.
    const result = this.queue.then(async () => {
      if (!this.sessions) {
        try {
          const items = this.persistence ? await this.persistence.load() : [];
          if (!Array.isArray(items)) throw new Error("Invalid snapshot.");
          const loaded = new Map<string, TranslationSession>();
          for (const item of items) {
            const session = parseFields(item, false) as TranslationSession;
            if (loaded.has(session.id)) throw new Error("Duplicate session.");
            loaded.set(session.id, session);
          }
          this.sessions = loaded;
        } catch {
          // Leave the store unloaded. Never overwrite unreadable or corrupt data.
          throw new HttpError(
            503,
            "Translation session storage could not be loaded.",
          );
        }
      }
      return await operation(this.sessions);
    });
    this.queue = result.then(() => {}, () => {});
    return result;
  }

  private async commit(next: Map<string, TranslationSession>) {
    try {
      await this.persistence?.save([...next.values()]);
    } catch {
      throw new HttpError(
        503,
        "Translation session changes could not be saved.",
      );
    }
    // Publish the new state only after the replacement succeeded.
    this.sessions = next;
  }
}

const requiredStrings = [
  "id",
  "guild_id",
  "voice_channel_id",
  "text_channel_id",
  "room_id",
  "live_url",
  "source_language",
  "bot_instance_id",
] as const;
const optionalFields = [
  "post_to_discord",
  "status_message",
  "date_created",
  "date_updated",
];
const statuses = [
  "starting",
  "connected",
  "ready",
  "degraded",
  "stopped",
  "failed",
  "stale",
];

function parseFields(
  value: unknown,
  partial: boolean,
): Partial<TranslationSession> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "A session object is required.");
  }
  const fields = value as Record<string, unknown>;
  const allowed = new Set<string>([
    ...requiredStrings,
    ...optionalFields,
    "status",
    "target_languages",
  ]);
  const invalid = () =>
    new HttpError(400, "Invalid translation session fields.");
  if (Object.keys(fields).some((key) => !allowed.has(key))) throw invalid();
  for (const key of requiredStrings) {
    if (partial && !(key in fields)) continue;
    if (
      typeof fields[key] !== "string" || !fields[key].trim() ||
      fields[key].length > 4096
    ) throw invalid();
  }
  if ("id" in fields && !/^[a-zA-Z0-9_-]{1,200}$/.test(fields.id as string)) {
    throw invalid();
  }
  if (
    (!partial || "status" in fields) &&
    !statuses.includes(fields.status as string)
  ) throw invalid();
  if (!partial || "target_languages" in fields) {
    const targets = fields.target_languages;
    if (
      !Array.isArray(targets) || !targets.length || targets.length > 5 ||
      targets.some((target) =>
        typeof target !== "string" || !target.trim() || target.length > 64
      )
    ) throw invalid();
  }
  if (
    "post_to_discord" in fields && typeof fields.post_to_discord !== "boolean"
  ) throw invalid();
  if (
    "status_message" in fields &&
    (typeof fields.status_message !== "string" ||
      fields.status_message.length > 4096)
  ) throw invalid();
  for (const key of ["date_created", "date_updated"]) {
    if (
      key in fields &&
      (typeof fields[key] !== "string" ||
        !Number.isFinite(Date.parse(fields[key])))
    ) throw invalid();
  }
  return structuredClone(fields) as Partial<TranslationSession>;
}
