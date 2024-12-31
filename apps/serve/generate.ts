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
  const input_size = Number(file.headers.get("content-length"));
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
          //create wavy waveform
          {
            filter: "showwaves",
            options: `s=${width}x${height}:mode=point:colors=${colors[1]}:0.1:0.8`,
            inputs: "1:a",
            outputs: "wave",
          },
          //create line waveform
          {
            filter: "showwaves",
            options: `s=${width}x${height}:mode=line:colors=${colors[2]}`,
            inputs: "1:a",
            outputs: "line",
          },
          //overlay line waveform on top of color background
          {
            filter: "overlay",
            inputs: ["0:v", "line"],
            outputs: "bg_line",
          },
          //overlay wavy waveform on top of line waveform with color background
          {
            filter: "overlay",
            inputs: ["bg_line", "wave"],
            outputs: ["bg_line_wave"],
          },
          // draw text over bg_line_wave
          // {
          //   filter: "drawtext",
          //   options: {
          //     // fontfile: "/path/to/font.ttf",
          //     text: json.logs.file_name,
          //     fontsize: 20,
          //     fontcolor: "white",
          //     x: "2", // Centers the text horizontally
          //     y: "10", // Positions the text vertically at 1/10th of the height
          //     shadowcolor: "black",
          //     shadowx: 2,
          //     shadowy: 2,
          //     enable: "between(t,0,15)",
          //   },
          //   inputs: "bg_line_wave_for_text",
          //   outputs: "text",
          // },
          //fade out the text
          // `drawtext=text=test:fontsize=20:fontcolor=white:x=(${width}_w)/2:y=(${height}-text_h)/10:shadowcolor=black:shadowx=2:shadowy=2:enable='between(t,0,15)',fade=t=out:st=5:d=1[final_output]`, // {
          //TODO: FIGURE THIS SHIT OUT
          // {
          //   filter: "fade",
          //   options: {
          //     t: "out",
          //     st: "5",
          //     d: "1",
          //   },
          //   inputs: "text",
          //   outputs: "faded_text",
          // },
          // //overlay faded text on top of bg_line_wave
          // {
          //   filter: "overlay",
          //   inputs: ["bg_line_wave", "faded_text"],
          //   outputs: "final_output",
          // },
          {
            filter: "fps",
            options: "15",
            inputs: "bg_line_wave",
            outputs: "output",
          },
        ])
        .map("output")
        .addOption("-map 1:a")
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
          console.error("FFMPEG Error: " + err);
          reject(err.message);
        })
        .output(output)
        .run();
    });
  } catch (error) {
    return new Response(String(error), { status: 500 });
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
    createItem(ServeItem.ConversionLogs, {
      audio_format: json.logs.audio_format,
      conversion_time: conversionEnd - conversionStart,
      date_created: json.logs.date_created,
      file_duration: 0,
      file_name: json.logs.file_name,
      guild_id: json.logs.guild_id,
      input_bitrate: 0,
      input_size,
      output_bitrate: 0,
      output_size: fileSize,
      user_id: json.logs.user_id,
      cached: false,
      type: json.logs.type,
    });

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
