const ffmpeg = require("child_process");

export async function render(
  background: string,
  audio: string,
  output: string
) {
  return new Promise((resolve) => {
    const origPeg = `ffmpeg -y -loop 0 -i ${background} -i ${audio} -filter_complex "[1:a]showwaves=s=200x40:mode=point:colors=0x9cf42f:0.1:0.8[v];[1:a]showwaves=s=200x40:mode=line:colors=0xfc7828[v1];[0:v]scale=200:40[bg];[bg][v1]overlay[outv1];[outv1][v]overlay[outv];[outv]fps=30[outv]" -map "[outv]" -map 1:a -c:v libx264 -preset ultrafast -c:a aac -b:a 192k -b:v 200k -pix_fmt yuv420p -shortest ${output}`;
    const newPegP = `ffmpeg -y -loop 0 -i ${background} -i ${audio} -filter_complex "[1:a]showwaves=s=200x40:mode=point:colors=0x9cf42f:0.1:0.8[v];[1:a]showwaves=s=200x40:mode=line:colors=0xfc7828[v1];[0:v]scale=200:40[bg];[bg][v1]overlay[outv1];[outv1][v]overlay[outv];[outv]fps=30[outv]" -map "[outv]" -map 1:a -c:v libx264 -preset ultrafast -c:a aac -b:a 192k -b:v 400k -pix_fmt yuv420p -shortest ${output}`;

    try {
      const ls = ffmpeg
        .exec(newPegP)

        .on("exit", function () {
          resolve(true);
        });

      ls.stdout.on("data", function (data: any) {
        // console.log("stdout: " + data.toString());
      });

      ls.stderr.on("data", function (data: any) {
        console.log("stderr: " + data.toString());
        if (data.toString().toLowerCase().includes("error")) resolve(false);
      });
    } catch (e) {
      console.log(e);
      resolve(false);
    }
  });
}
