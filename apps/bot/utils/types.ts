import {
  CommandContext,
  MenuCommandContext,
  MessageCommandInteraction,
} from "seyfert";

export type Context =
  | MenuCommandContext<MessageCommandInteraction>
  | CommandContext;
