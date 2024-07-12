const ffmpeg = require("child_process");

export async function render(audio: string, output: string) {
  return new Promise((resolve) => {
    const colors = [`0x1e1f22`, `0x9cf42f`, `0xfc7828`];
    const [width, height] = [250, 100];
    console.log(output);
    const command = `ffmpeg -y -f lavfi -i \
    color=c=${colors[0]}:s=${width}x${height} -i "${audio}" \
    -filter_complex "\
    [1:a]showwaves=s=${width}x${height}:mode=point:colors=${colors[1]}:0.1:0.8[v];\
    [1:a]showwaves=s=${width}x${height}:mode=line:colors=${colors[2]}[v1];\
    [0:v][v1]overlay[outv1];[outv1][v]overlay[outv];[outv]fps=15[outv]"\
    -map "[outv]"\
    -map 1:a\
    -c:v libx264\
    -pix_fmt yuv420p\
    -preset ultrafast\
    -c:a aac \
    -b:a 192k\
    -shortest\
    ${output}`;

    try {
      const startTime = Date.now();
      const ls = ffmpeg.exec(command).on("exit", function () {
        const endTime = Date.now();
        const timeElapsed = endTime - startTime;
        resolve(timeElapsed);
      });

      ls.stderr?.on("data", function (data: any) {
        console.log("stdout: " + data.toString());
        if (data.toString().includes("Error ")) resolve(false);
      });
    } catch (e) {
      console.log(e);
      resolve(false);
    }
  });
}
