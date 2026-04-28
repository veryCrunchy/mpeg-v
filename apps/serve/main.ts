import generate from "./generate.ts";
import { handleTranslationSessions } from "./translationSessions.ts";
import { Authorization } from "@mpeg-v/utils";

Deno.serve({ port: 3000 }, async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // POST /generate
  if (url.pathname === "/generate" && req.method === "POST") {
    if (req.headers.get("Authorization") !== Authorization) {
      return new Response(null, { status: 401 });
    }
    return await generate(req);
  }

  if (
    url.pathname === "/translation-sessions" ||
    url.pathname.startsWith("/translation-sessions/")
  ) {
    const isPublicRead = req.method === "GET" &&
      /^\/translation-sessions\/[^/]+$/.test(url.pathname);
    if (!isPublicRead && req.headers.get("Authorization") !== Authorization) {
      return new Response(null, { status: 401 });
    }
    const response = await handleTranslationSessions(req, url);
    if (response) return response;
  }

  return new Response("I'm a teapot", { status: 418 });
});

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
