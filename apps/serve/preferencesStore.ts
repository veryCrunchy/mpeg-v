import { DatabaseSync } from "node:sqlite";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AudioVideoPatch,
  type AudioVideoSettings,
  mergeAudioVideoPatch,
  type PreferenceRecord,
  type PreferenceScope,
  resolveAudioVideo,
  validateAudioVideoPatch,
  validDiscordId,
} from "../web/utils/core/audioVideo.ts";
import { HttpError } from "./http.ts";

export class PreferencesStore {
  private database: DatabaseSync;
  private closed = false;
  constructor(path: string) {
    const [major, minor, patch] = Deno.version.deno.split(".").map(Number);
    if (major < 2 || major === 2 && (minor < 7 || minor === 7 && patch < 7)) {
      throw new Error("Saved settings require Deno 2.7.7 or newer.");
    }
    if (path !== ":memory:") {
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
      if (!existsSync(path)) {
        try {
          closeSync(openSync(path, "wx", 0o600));
        } catch (error) {
          if (!existsSync(path)) throw error;
        }
      }
    }
    this.database = new DatabaseSync(path);
    try {
      const version = (this.database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      }).user_version;
      if (version !== 0 && version !== 1) {
        throw new Error("Unsupported preference database version.");
      }
      this.database.exec(
        "PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
      );
      this.transaction(() => {
        this.database.exec(`CREATE TABLE IF NOT EXISTS preferences (
          scope TEXT NOT NULL CHECK(scope IN ('user','guild')),
          owner_id TEXT NOT NULL,
          settings TEXT NOT NULL CHECK(json_valid(settings)),
          revision TEXT NOT NULL,
          PRIMARY KEY(scope, owner_id)
        ) STRICT; PRAGMA user_version=1;`);
      });
    } catch (error) {
      this.database.close();
      throw error;
    }
  }
  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  private check(scope: PreferenceScope, id: string) {
    if (!["user", "guild"].includes(scope) || !validDiscordId(id)) {
      throw new HttpError(400, "Invalid settings owner.");
    }
  }
  get(scope: PreferenceScope, id: string): PreferenceRecord {
    this.check(scope, id);
    const row = this.database.prepare(
      "SELECT settings, revision FROM preferences WHERE scope=? AND owner_id=?",
    ).get(scope, id) as { settings: string; revision: string } | undefined;
    if (!row) return { values: {}, revision: null };
    return {
      values: validateAudioVideoPatch(
        JSON.parse(row.settings as string),
        false,
      ) as Partial<AudioVideoSettings>,
      revision: row.revision as string,
    };
  }
  patch(
    scope: PreferenceScope,
    id: string,
    patch: AudioVideoPatch,
    revision: string | null,
  ): PreferenceRecord {
    this.check(scope, id);
    const changes = validateAudioVideoPatch(patch);
    return this.transaction(() => {
      const current = this.get(scope, id);
      if (revision !== current.revision) {
        throw new HttpError(
          409,
          "Settings changed elsewhere. Reload them before saving.",
        );
      }
      const values = mergeAudioVideoPatch(current.values, changes);
      if (!Object.keys(values).length) {
        this.database.prepare(
          "DELETE FROM preferences WHERE scope=? AND owner_id=?",
        ).run(scope, id);
        return { values, revision: null };
      }
      const next = crypto.randomUUID();
      this.database.prepare(
        "INSERT INTO preferences(scope,owner_id,settings,revision) VALUES(?,?,?,?) ON CONFLICT(scope,owner_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision",
      ).run(scope, id, JSON.stringify(values), next);
      return { values, revision: next };
    });
  }
  reset(scope: PreferenceScope, id: string, revision: string | null) {
    const clear = Object.fromEntries(
      Object.keys(resolveAudioVideo()).map((key) => [key, null]),
    );
    return this.patch(scope, id, clear, revision);
  }
  resolve(
    userId: string,
    guildId?: string,
    overrides?: Partial<AudioVideoSettings>,
  ) {
    const validOverrides = validateAudioVideoPatch(
      overrides ?? {},
      false,
    ) as Partial<AudioVideoSettings>;
    try {
      return resolveAudioVideo(
        guildId ? this.get("guild", guildId).values : undefined,
        this.get("user", userId).values,
        validOverrides,
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "Saved settings are unavailable. Please try again later.",
      );
    }
  }
  close() {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }
}
let store: PreferencesStore | undefined;
export function preferencesStore() {
  if (!store) {
    const path = Deno.env.get("SETTINGS_DATABASE") ||
      fileURLToPath(new URL(".data/settings.sqlite", import.meta.url));
    try {
      store = new PreferencesStore(path);
    } catch {
      throw new HttpError(
        503,
        "Saved settings are unavailable. Please try again later.",
      );
    }
  }
  return store;
}
