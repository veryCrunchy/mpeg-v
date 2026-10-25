import generate, { generateUpload } from "./generate.ts";
import { handleTranslationSessions } from "./translationSessions.ts";
import { isAuthorized } from "@mpeg-v/utils";
import { errorResponse } from "./http.ts";
import { handleFileTools } from "./fileTools.ts";
import { handlePreferences } from "./preferences.ts";

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (
    url.pathname === "/preferences" || url.pathname.startsWith("/preferences/")
  ) return handlePreferences(req);
  if (url.pathname === "/tools/file" && req.method === "POST") {
    if (!isAuthorized(req)) {
      return new Response(null, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return await handleFileTools(req);
  }

  if (
    url.pathname === "/translation-sessions" ||
    url.pathname.startsWith("/translation-sessions/")
  ) {
    return await handleTranslationSessions(req, url);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // POST /generate
  if (url.pathname === "/generate" && req.method === "POST") {
    if (!isAuthorized(req)) {
      return new Response(null, { status: 401 });
    }
    return await generate(req);
  }

  if (url.pathname === "/tools/audio-to-video" && req.method === "POST") {
    if (!isAuthorized(req)) return new Response(null, { status: 401 });
    return await generateUpload(req);
  }

  if (url.pathname === "/health" && req.method === "GET") {
    return Response.json({ status: "ok" });
  }

  return new Response("I'm a teapot", { status: 418 });
}

if (import.meta.main) {
  Deno.serve({
    hostname: Deno.env.get("HOST") ?? "0.0.0.0",
    port: Number(Deno.env.get("PORT") ?? 3000),
    onError: errorResponse,
  }, handleRequest);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };
}

//conversion_logs
// date, file_name, conversion_time, input_size,
// output_size, file_duration, input_bitrate,
// output_bitrate, audio_format, user_id, server_id, cached, type: auto | slash | menu | button
