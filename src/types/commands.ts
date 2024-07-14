import {
  Awaitable,
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
} from "discord.js";

type LoggerFunction = (...args: unknown[]) => void;
export interface CommandProps {
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction;
  client: Client;
  log: LoggerFunction;
}

export class ExtendedContextMenuCommandBuilder extends ContextMenuCommandBuilder {
  private _description?: string;
  public integration_types = [0, 1];
  public contexts = [0, 1, 2];

  setDescription(description: string): this {
    this._description = description;
    return this;
  }

  get description(): string | undefined {
    return this._description;
  }
}

export type CommandExec = (props: CommandProps) => Awaitable<unknown>;
interface AdditionalCommandMetaFields {
  integration_types?: number[];
  contexts?: number[];
}
export type CommandMeta = (
  | SlashCommandBuilder
  | ExtendedContextMenuCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
) &
  AdditionalCommandMetaFields;
export interface Command {
  meta: CommandMeta;
  exec: CommandExec;
}

export interface CommandCategoryExtra {
  description?: string;
  emoji?: string;
}

export interface CommandCategory extends CommandCategoryExtra {
  name: string;
  commands: Command[];
}
