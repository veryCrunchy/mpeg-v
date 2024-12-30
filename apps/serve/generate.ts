// @deno-types="npm:@types/fluent-ffmpeg"
import ffmpeg from "npm:fluent-ffmpeg";
import { Readable, Writable } from "node:stream";
import { Buffer } from "node:buffer";
import { createItem } from "@mpeg-v/utils";
import { ServeItem, ConversionLogs, GenerateVideoRequest } from "@mpeg-v/types";
export default async (req: Request): Promise<Response> => {
  const start = Date.now();

  const colors = [`0x1e1f22`, `0xfc7828`, `0x9cf42f`];
  const [width, height] = [250, 100];
  // const bitrate = "320";
  const json: GenerateVideoRequest = await req.json();
  if (!json.url) return new Response(null, { status: 400 });
  const file = await fetch(json.url);
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
  const codec = "copy"; // aac
  try {
    await new Promise((resolve, reject) => {
      //TODO: sanitization???
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
        // .addOption(
        //   "-vf \"drawtext=text='abcd':fontfile=bpmono.ttf:y=h-line_h-10:x=w-mod(max(t-4.5,0)*(w+tw)/5.5,(w+tw)):fontcolor=ffcc00:fontsize=40:shadowx=2:shadowy=2\""
        // )
        // .videoBitrate(`${bitrate}k`)
        .videoCodec("libx264")
        .outputOptions("-pix_fmt yuv420p")
        .outputOptions("-preset veryfast")
        .audioCodec(codec)
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
  } catch (error: unknown) {
    return new Response((error as Error).message, { status: 500 });
  }
  const conversionEnd = Date.now();

  const fileBuffer = Buffer.concat(chunks);
  const fileSize = fileBuffer.length; // bytes
  try {
    const headers = new Headers();
    headers.append("Content-Type", "video/mp4");
    headers.append("Conversion-Time", String(conversionEnd - conversionStart));

    return new Response(fileBuffer, { headers });
  } finally {
    console.log(`Time taken ${Date.now() - start}ms`);
    //TODO: logs
    // createItem(ServeItem.ConversionLogs, {});

    const formData = new FormData();
    const fileBlob = new Blob([fileBuffer]);
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
        "CACHE_CHANNEL"
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
    //TODO: store file "cache" in db
  }
};
