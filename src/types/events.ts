import { ClientEvents, Awaitable, Client, APIEmbed } from "discord.js";

export type LoggerFunction = (...args: unknown[]) => void;
type EmbedLoggerFunction = (...args: APIEmbed[]) => void;
export interface EventProps {
  client: Client;
  log: LoggerFunction;
  embedLog: EmbedLoggerFunction;
}

export type EventKeys = keyof ClientEvents;
export type EventExec<T extends EventKeys> = (
  props: EventProps,
  ...args: ClientEvents[T]
) => Awaitable<unknown>;
export interface Event<T extends EventKeys> {
  id: T;
  exec: EventExec<T>;
}
