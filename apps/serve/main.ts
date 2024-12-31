import generate from "./generate.ts";
import { Authorization } from "@mpeg-v/utils";

Deno.serve({ port: 3000 }, async (req) => {
  const url = new URL(req.url);

  // POST /generate
  if (url.pathname === "/generate" && req.method === "POST") {
    if (req.headers.get("Authorization") !== Authorization)
      return new Response(null, { status: 401 });
    return await generate(req);
  }
  return new Response("I'm a teapot", { status: 418 });
});

//conversion_logs
// date, file_name, conversion_time, input_size,
// output_size, file_duration, input_bitrate,
// output_bitrate, audio_format, user_id, server_id, cached, type: auto | slash | menu | button
