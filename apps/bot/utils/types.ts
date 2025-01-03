import {
  MessageCommandInteraction,
  CommandContext,
  MenuCommandContext,
} from "seyfert";

export type File = {
  filename: string;
  url: string;
  id: string;
};

export type Context =
  | MenuCommandContext<MessageCommandInteraction>
  | CommandContext;
