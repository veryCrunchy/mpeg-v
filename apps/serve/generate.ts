// @deno-types="npm:@types/fluent-ffmpeg"
import ffmpeg from "npm:fluent-ffmpeg";
import { Readable, Writable } from "node:stream";
import { Buffer } from "node:buffer";
import { createItem } from "./cms.ts";
interface Logs {
  date_created: string;
  file_name: string;
  type: string;
  conversion_time: number;
  input_size: number;
  output_size: number;
  file_duration: number;
  input_bitrate: number;
  output_bitrate: number;
  audio_format: string;
  user_id: string;
  guild_id: string;
  cached: boolean;
}
export default async (req: Request): Promise<Response> => {
  const start = Date.now();

  const colors = [`0x1e1f22`, `0x9cf42f`, `0xfc7828`];
  const [width, height] = [250, 100];
  // const bitrate = "320";
  const json: { file: string; logs: Logs } = await req.json();
  if (!json.file) return new Response(null, { status: 400 });
  const file = await fetch(json.file);
  console.log("Before file", Date.now() - start);
  if (!file.ok || !file.body) {
    throw new Error(`Failed to fetch video: ${file.statusText}`);
  }
  const nodeReadableStream = new Readable({
    async read() {
      const reader = file.body!.getReader();
      let done, value;
      while (!done) {
        ({ done, value } = await reader.read());
        if (value) {
          this.push(Buffer.from(value));
        }
      }
      this.push(null);
    },
  });

  const chunks: Uint8Array[] = [];
  const output = new Writable({
    write(chunk, _, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  const conversionStart = Date.now();
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(`color=c=${colors[0]}:s=${width}x${height}`)
      .inputOptions("-f", "lavfi")
      .input(nodeReadableStream)
      .complexFilter([
        {
          filter: "showwaves",
          options: `s=${width}x${height}:mode=point:colors=${colors[1]}:0.1:0.8`,
          inputs: "1:a",
          outputs: "v",
        },
        {
          filter: "showwaves",
          options: `s=${width}x${height}:mode=line:colors=${colors[2]}`,
          inputs: "1:a",
          outputs: "v1",
        },
        {
          filter: "overlay",
          inputs: ["0:v", "v1"],
          outputs: "outv1",
        },
        {
          filter: "overlay",
          inputs: ["outv1", "v"],
          outputs: "outv",
        },
        {
          filter: "fps",
          options: "15",
          inputs: "outv",
          outputs: "outv",
        },
      ])
      .map("outv")
      .addOption("-map 1:a")
      // .videoBitrate(`${bitrate}k`)
      .videoCodec("libx264")
      .outputOptions("-pix_fmt yuv420p")
      .outputOptions("-preset veryfast")
      .audioCodec("aac")
      .audioBitrate("192k")
      .outputOptions(["-movflags frag_keyframe+empty_moov+faststart"]) // magic line to make it streamable, DO NOT TOUCH!!!
      .outputFormat("mp4")
      .outputOptions("-shortest")
      .on("start", (commandLine: string) => {
        console.log("Spawned Ffmpeg with command: " + commandLine);
      })
      .on("progress", (e) => {
        console.log(e);
      })
      .on("end", () => {
        console.log("Processing finished successfully");
        console.log(`FFMPEG Time taken ${Date.now() - start}ms`);
        resolve(true);
      })
      .on("error", (err: Error) => {
        console.error("FFMPEG Error: " + err.message);
        reject(err);
      })
      .output(output)
      .run();
  });
  const conversionEnd = Date.now();

  const fileBuffer = Buffer.concat(chunks);
  const formData = new FormData();
  const fileBlob = new Blob([fileBuffer]);

  try {
    return new Response();
  } finally {
    console.log(`Time taken ${Date.now() - start}ms`);
    //TODO: logs
    // createItem<Logs>("conversion_logs", {
    // });

    formData.append("file", fileBlob, "audio.mp4");
    formData.append(
      "payload_json",
      JSON.stringify({
        content: "Test",
      })
    );
    //cache the converted file
    fetch(
      `https://discord.com/api/v10/channels/${Deno.env.get(
        "AUDIO_CHANNEL"
      )}/messages`,
      {
        method: "POST",
        headers: {
          "User-Agent": "DiscordBot (null, v0)",
          Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
        },
        body: formData,
      }
    );
    //TODO: store file cache in db
  }
};
