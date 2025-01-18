import { } from "seyfert";
import { AnyContext, Embed } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";
import { COLORS } from "utils/embed.ts";

export const handleError = (
  ctx: AnyContext,
  error: unknown,
  ephemeral?: boolean,
) => {
  let err: Error

  if (error instanceof Error) {
    err = error
  } else {
    err = new Error(String(error), { cause: error })
  }

  return ctx.editOrReply({
    embeds: [
      new Embed().setColor(COLORS["error"])
        .setTitle(
          err.message,
        ).setDescription(
          (typeof err.cause === "string" ? `${err.cause}\n` : "" +
            "-# If this issue persists, please let us know in our [Discord Server](https://discord.gg/UeZ3KEbUUm)") +
          (ephemeral
            ? ""
            : `\n-# This message will be deleted in <t:${Math.round(Date.now() / 1000 + 15)
            }:R>`),
        ),
    ],
    flags: MessageFlags.Ephemeral,
  }, true).then((m) => {
    setTimeout(() => {
      m.delete();
    }, 15000);
  });
};
