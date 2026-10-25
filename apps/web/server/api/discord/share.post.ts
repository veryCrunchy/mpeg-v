import { readBoundedBody, withUserJob, mediaType } from "../../utils/files";
import { discordIdentity } from "../../utils/discord";

export default defineEventHandler(async (event) => {
  const user = await discordIdentity(event);
  return withUserJob(user.id, async () => {
    const config = useRuntimeConfig(event);
    const bytes = await readBoundedBody(event, 10 * 1024 * 1024);
    const type = mediaType(bytes);
    if (!type)
      throw createError({
        statusCode: 415,
        statusMessage: "Choose a converted image or MP4 to share.",
      });
    const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type }),
      `mpeg-v.${extension}`,
    );
    const response = await fetch(
      `https://discord.com/api/v10/applications/${config.public.discordClientId}/attachment`,
      {
        method: "POST",
        headers: { Authorization: user.authorization },
        body: form,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw createError({
        statusCode: response.status === 413 ? 413 : 502,
        statusMessage:
          "Discord could not accept this file. Try a smaller file or download it.",
      });
    const attachment = await response.json();
    if (
      typeof attachment.url !== "string" ||
      !attachment.url.startsWith("https://cdn.discordapp.com/")
    )
      throw createError({
        statusCode: 502,
        statusMessage: "Discord did not return a shareable file.",
      });
    return { url: attachment.url };
  });
});
