import { WebhookMessage } from "seyfert";
import {  } from "seyfert";
import { AnyContext, Embed, Message } from "seyfert";
import { MessageFlags } from "seyfert/lib/types/index.js";
import { COLORS } from "utils/embed.ts";

export const handleError = (
  ctx: AnyContext | Message,
  error: Error,
  ephemeral?: boolean,
) => {
  console.log(Error);
  let reply;
  if (ctx instanceof Message) {
    reply = ctx.reply;
  } else {
    reply = ctx.editOrReply;
  }
  reply({
    embeds: [
      new Embed().setColor(COLORS["error"])
        .setTitle(
          error.message,
        ).setDescription(
          (typeof error.cause === "string" ? `${error.cause}\n` : "" +
            "-# If this issue persists, please let us know in our [Discord Server](https://discord.gg/UeZ3KEbUUm)") +
            (ephemeral
              ? ""
              : `\n-# This message will be deleted in <t:${
                Math.round(Date.now() / 1000 + 15)
              }:R>`),
        ),
    ],
    flags: MessageFlags.Ephemeral,
  }).then((m) => {
    setTimeout(() => {
      (m as WebhookMessage).delete();
    }, 15000);
  });
};
