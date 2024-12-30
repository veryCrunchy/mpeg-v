import { execSync } from "child_process";

const ffmpeg = require("child_process");

export async function render(
  audio: string,
  output: string
): Promise<{ time: number; duration: number } | boolean> {
  return new Promise((resolve) => {
    const colors = [`0x1e1f22`, `0x9cf42f`, `0xfc7828`];
    const [width, height] = [250, 100];
    const extension = audio.split(".").pop() || "mp3";
    const duration = getDuration(audio);
    const bitrate = calculateBitrate(getSize(audio), duration, extension);

    // Generate the ffmpeg command
    const command = `ffmpeg -y -f lavfi -i \
    color=c=${colors[0]}:s=${width}x${height} -i "${audio}" \
    -filter_complex "\
    [1:a]showwaves=s=${width}x${height}:mode=point:colors=${colors[1]}:0.1:0.8[v];\
    [1:a]showwaves=s=${width}x${height}:mode=line:colors=${colors[2]}[v1];\
    [0:v][v1]overlay[outv1];[outv1][v]overlay[outv];[outv]fps=15[outv]"\
    -map "[outv]"\
    -map 1:a\
    -b:v ${bitrate}k\
    -c:v libx264\
    -pix_fmt yuv420p\
    -preset veryfast \
    -c:a aac\
    -b:a 192k\
    -shortest\
    ${output}`;
    console.log(bitrate);
    try {
      const startTime = Date.now();
      const ls = ffmpeg.exec(command).on("exit", function () {
        const endTime = Date.now();
        const timeElapsed = endTime - startTime;
        resolve({ time: timeElapsed, duration });
      });

      ls.stderr?.on("data", function (data: any) {
        // console.log("stdout: " + data.toString());
        if (data.toString().includes("Error ")) resolve(false);
        if (data.toString().includes("Conversion failed!")) resolve(false);
      });
    } catch (e) {
      console.log(e);
      resolve(false);
    }
  });
}
function getDuration(file: string) {
  const output = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
  );
  return Math.floor(parseFloat(output.toString()));
}

export function getAudioBitrate(file: string) {
  const output = execSync(
    `ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate -of default=noprint_wrappers=1:nokey=1 "${file}"`
  );
  return parseInt(output.toString(), 10);
}
export function getSize(file: string) {
  const output = execSync(
    `ffprobe -v error -show_entries format=size -of default=noprint_wrappers=1:nokey=1  "${file}"`
  );
  return Math.floor(parseFloat(output.toString()) / 1000);
}
function calculateBitrate(
  inputSize: number,
  durationSeconds: number,
  fileExtension: string
) {
  inputSize = inputSize / 1024;
  const MAX_FILE_SIZE_KB = 25 * 1024; // 25MB in KB
  const BASE_BITRATE = 320; // Base bitrate in kbps (can be adjusted)
  const SECOND_TO_MINUTE = 60;
  // Compression ratios for different file types
  const compressionRatios: { [key: string]: number } = {
    mp3: 1.0, // No compression change for MP3
    aac: 0.9, // Example: AAC to MP3 compression ratio (can vary)
    wav: 0.1, // Example: WAV to MP3 compression ratio (can vary)
    flac: 0.3, // Example: FLAC to MP3 compression ratio (can vary)
    m4a: 0.9, // Example: M4A to MP3 compression ratio (can vary)
    ogg: 0.85, // Example: OGG to MP3 compression ratio (can vary)
    // Add other file types as needed
  };

  // Get the compression ratio for the input file type
  const compressionRatio =
    compressionRatios[fileExtension.toLowerCase()] || 1.0;

  // Adjust the input size based on the compression ratio
  const adjustedInputSizeMB = inputSize * compressionRatio;

  // Calculate the average bitrate required to stay under the limit
  // Total file size in KB = (bitrate in kbps * duration in seconds) / 8
  const maxBitrate = (MAX_FILE_SIZE_KB * 8) / durationSeconds;

  // Adjust bitrate based on input size and duration
  // Reduce bitrate if input size is larger or duration is longer
  let adjustedBitrate = BASE_BITRATE;

  // Example adjustment: reduce bitrate by 10% for each MB over 10MB
  // and by 5% for each minute over 5 minutes
  const sizeThreshold = 8 / compressionRatio; // MB
  const durationThreshold = 5 * SECOND_TO_MINUTE; // 5 minutes

  if (adjustedInputSizeMB > sizeThreshold) {
    adjustedBitrate *= Math.pow(0.9, adjustedInputSizeMB - sizeThreshold);
  }

  if (durationSeconds > durationThreshold) {
    adjustedBitrate *= Math.pow(
      0.95,
      (durationSeconds - durationThreshold) / SECOND_TO_MINUTE
    );
  }

  // Ensure adjusted bitrate is not higher than the maximum allowed bitrate
  adjustedBitrate = Math.min(adjustedBitrate, maxBitrate);

  return Math.round(adjustedBitrate);
}
