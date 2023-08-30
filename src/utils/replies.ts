import {
  InteractionReplyOptions,
  WebhookMessageEditOptions,
  MessageReplyOptions,
  Message,
} from "discord.js";

export const Colors = {
  error: 0xf54242,
};

export const Reply = {
  error(msg: string): InteractionReplyOptions {
    return {
      ephemeral: true,
      embeds: [
        {
          color: Colors.error,
          description: msg,
        },
      ],
    };
  },
};
export const MessageReply = {
  error(msg: string): MessageReplyOptions {
    return {
      embeds: [
        {
          color: Colors.error,
          description: msg,
        },
      ],
    };
  },
  TempError(replyMessage: Message, msg: string) {
    void replyMessage
      .reply({
        embeds: [
          {
            color: Colors.error,
            description: msg,
          },
        ],
      })
      .then((m) =>
        setTimeout(() => {
          m.delete();
        }, 10000)
      );
  },
};

export const EditReply = {
  error(msg: string): WebhookMessageEditOptions {
    return {
      embeds: [
        {
          color: Colors.error,
          description: msg,
        },
      ],
    };
  },
};
