import { isAuthorized } from "@mpeg-v/utils";
import { errorResponse, HttpError, readJson } from "./http.ts";
import { type PreferencesStore, preferencesStore } from "./preferencesStore.ts";
import {
  type PreferenceScope,
  validateAudioVideoPatch,
} from "../web/utils/core/audioVideo.ts";

export async function handlePreferences(
  req: Request,
  getStore: () => PreferencesStore = preferencesStore,
  authorized = isAuthorized,
): Promise<Response> {
  // Only trusted bot/web backends may use this internal route. They enforce user ownership and guild permissions.
  if (!authorized(req)) {
    return new Response(null, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const match = new URL(req.url).pathname.match(
      /^\/preferences\/(user|guild)\/([1-9]\d{0,19})$/,
    );
    if (!match) throw new HttpError(404, "Settings not found.");
    const scope = match[1] as PreferenceScope, id = match[2];
    if (!["GET", "PATCH", "DELETE"].includes(req.method)) {
      throw new HttpError(405, "Unsupported settings method.");
    }
    let body;
    if (req.method !== "GET") {
      body = await readJson(req);
      if (
        !body || typeof body !== "object" ||
        !(body.revision === null ||
          typeof body.revision === "string" &&
            /^[a-f\d-]{36}$/i.test(body.revision))
      ) throw new HttpError(400, "Reload settings before saving.");
      if (req.method === "PATCH") {
        try {
          body.changes = validateAudioVideoPatch(body.changes);
        } catch (error) {
          throw new HttpError(400, (error as Error).message);
        }
      }
    }
    const database = getStore();
    const result = req.method === "GET"
      ? database.get(scope, id)
      : req.method === "DELETE"
      ? database.reset(scope, id, body.revision)
      : database.patch(scope, id, body.changes, body.revision);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(
      error instanceof HttpError ? error : new HttpError(
        503,
        "Saved settings are unavailable. Please try again later.",
      ),
    );
  }
}
