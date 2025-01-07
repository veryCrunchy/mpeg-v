import { AnyContext, Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";
import { COLORS } from "utils/embed.ts";

export const handleError = (
  ctx: AnyContext,
  error: Error,
) => {
  console.log(Error);
  return ctx.editOrReply({
    embeds: [
      new Embed().setColor(COLORS["error"])
        .setTitle(
          error.message,
        ).setDescription(
          typeof error.cause === "string" ? `${error.cause}` : undefined,
        ),
    ],
    flags: MessageFlags.Ephemeral,
  });
};
