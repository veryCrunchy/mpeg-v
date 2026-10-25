import { preferencesStore } from "./preferencesStore.ts";

// Opens and migrates the configured local database without connecting to Discord.
if (import.meta.main) {
  try {
    const database = preferencesStore();
    database.close();
    console.log(
      "Local settings database is ready (schema 1). No account records were created.",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Settings database could not be opened.",
    );
    Deno.exitCode = 1;
  }
}
