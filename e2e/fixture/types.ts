import type { commands } from "@/bindings";

type Commands = typeof commands;

export type CommandName = keyof Commands;

export type CommandData<K extends CommandName> = Extract<
  Awaited<ReturnType<Commands[K]>>,
  { status: "ok" }
>["data"];

export type Handlers = {
  [K in CommandName]?: (...args: Parameters<Commands[K]>) => CommandData<K>;
};
