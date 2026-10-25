import { readBoundedBody, withUserJob } from "../../utils/files";
import { discordIdentity } from "../../utils/discord";

export default defineEventHandler(async (event) => {
  const user = await discordIdentity(event);
  return withUserJob(user.id, async () => {
    const config = useRuntimeConfig(event);
    if (!config.conversionUrl || !config.conversionToken)
      throw createError({
        statusCode: 503,
        statusMessage: "Audio conversion is unavailable. Try the Discord bot.",
      });
    const body = await readBoundedBody(event, 25 * 1024 * 1024);
    const controller = new AbortController();
    const cancel = () => {
      if (!event.node.res.writableFinished) controller.abort();
    };
    event.node.res.once("close", cancel);
    try {
      const response = await fetch(
        new URL("/tools/audio-to-video", config.conversionUrl),
        {
          method: "POST",
          body: new Uint8Array(body),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(125_000),
          ]),
          headers: {
            Authorization: `Bearer ${config.conversionToken}`,
            "Content-Type": "application/octet-stream",
          },
        },
      );
      if (!response.ok) {
        const messages: Record<number, string> = {
          413: "The audio is too long or the video exceeds 10 MiB.",
          422: "This file does not contain supported audio.",
          429: "The converters are busy. Try again shortly.",
          504: "Conversion took too long. Try a shorter clip.",
        };
        await response.body?.cancel();
        throw createError({
          statusCode: messages[response.status] ? response.status : 502,
          statusMessage:
            messages[response.status] ||
            "Audio conversion is unavailable. Please try again.",
        });
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 10 * 1024 * 1024)
        throw createError({
          statusCode: 413,
          statusMessage: "The converted video is too large.",
        });
      setHeaders(event, {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return bytes;
    } finally {
      event.node.res.off("close", cancel);
    }
  });
});
