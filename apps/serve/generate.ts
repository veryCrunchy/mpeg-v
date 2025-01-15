// @deno-types="npm:@types/fluent-ffmpeg"
import ffmpeg from "npm:fluent-ffmpeg";
import { Readable, Writable } from "node:stream";
import { Buffer } from "node:buffer";
import { NodeReadableStream } from "node:stream/web";
import { createItem, determineSizeLimit } from "@mpeg-v/utils";
import { GenerateVideoRequest, ServeItem } from "@mpeg-v/types";
const env = Deno.env.get("ENV");
export default async (req: Request): Promise<Response> => {
  const colors = [`0x1e1f22`, `0xfe7fff`, `0xfc7828`];
  const [width, height] = [250, 100];
  // const bitrate = "320";
  const json: GenerateVideoRequest = await req.json();
  if (!json.url) return new Response(null, { status: 400 });
  const file = await fetch(json.url);
  if (!file.ok || !file.body) {
    throw new Error(`Failed to fetch video: ${file.statusText}`);
  }
  const input_size = Number(file.headers.get("content-length"));
  const max_size = determineSizeLimit(json.tier_limit);
  const nodeReadableStream = Readable.fromWeb(
    file.body as NodeReadableStream,
  );
  const chunks: Uint8Array[] = [];
  const output = new Writable({
    write(chunk, _, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  const codec = "aac"; // aac or copy
  //TODO: codec issues with ogg
  let conversionStart: number;
  try {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(`color=c=${colors[0]}:s=${width}x${height}`)
        .inputOptions("-f", "lavfi")
        .input(nodeReadableStream)
        .complexFilter([
          //create wavy waveform
          {
            filter: "showwaves",
            options: `s=${width}x${height}:mode=point:colors=${
              colors[1]
            }:0.1:0.8`,
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
          // {
          //   filter: "showspectrum",
          //   options: `s=${width}x${height}:mode=separate:scale=lin:overlap=0.875:color=channel:slide=fullframe:data=phase`,
          //   inputs: "1:a",
          //   outputs: "line",
          // },
          // {
          //   filter: "avectorscope",
          //   options: `s=${width}x${height}`,
          //   inputs: "1:a",
          //   outputs: "line",
          // },
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
        // .videoBitrate("100")
        .outputOptions(["-movflags frag_keyframe+empty_moov+faststart"]) // magic line to make it stream-able, DO NOT TOUCH!!!
        .outputFormat("mp4")
        .outputOptions("-shortest")
        .on("start", (commandLine: string) => {
          conversionStart = Date.now();
          console.log("Spawned Ffmpeg with command: " + commandLine);
        })
        .on("progress", () => {
          const fileSize = Buffer.concat(chunks).length;
          if (fileSize > max_size) {
            reject("413");
          }
        })
        .on("end", () => {
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
    if (error === "413") {
      return new Response(null, { status: 413 });
    }
    return new Response(String(error), { status: 500 });
  }
  const conversionEnd = Date.now();

  const fileBuffer = Buffer.concat(chunks);
  const fileSize = fileBuffer.length; // bytes
  try {
    const headers = new Headers();
    headers.append("Content-Type", "video/mp4");
    headers.append("Conversion-Time", String(conversionEnd - conversionStart!));

    return new Response(fileBuffer, { headers });
  } finally {
    if (env === "production") {
      createItem(ServeItem.ConversionLogs, {
        audio_format: json.logs.audio_format,
        conversion_time: conversionEnd - conversionStart!,
        date_created: json.logs.date_created,
        file_duration: 0,
        file_name: json.logs.file_name,
        guild_id: json.logs.guild_id,
        input_bitrate: 0, //TODO: IMPORTANT
        input_size,
        output_bitrate: 0, //TODO: IMPORTANT
        output_size: fileSize,
        user_id: json.logs.user_id,
        cached: false,
        type: json.logs.type,
      });

      // const formData = new FormData();
      // const fileBlob = new Blob([fileBuffer]);
      // formData.append("file", fileBlob, "audio.mp4");
      //cache the converted file
      // TODO: add audio caching to privacy policy
      // fetch(
      //   `https://discord.com/api/v10/channels/${
      //     Deno.env.get(
      //       "CACHE_CHANNEL",
      //     )
      //   }/messages`,
      //   {
      //     method: "POST",
      //     headers: {
      //       "User-Agent": "DiscordBot (null, v0)",
      //       Authorization: `Bot ${Deno.env.get("BOT_TOKEN")}`,
      //     },
      //     body: formData,
      //   },
      // );
      //TODO: store file "cache" in db
    }
  }
};
