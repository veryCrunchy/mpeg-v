import { AttachmentBuilder, type CommandContext } from "seyfert";
import { Authorization } from "@mpeg-v/utils";
import type {
  FileOperation,
  FileToolOptions,
} from "../../mpeg-v/types/fileTools.ts";
import { readLimited } from "../../web/utils/core/streams.ts";

export class FileJobRegistry {
  private jobs = new Map<string, AbortController>();
  private attempts = new Map<string, number[]>();
  start(user: string, now = Date.now()) {
    if (this.jobs.has(user)) {
      throw new Error(
        "You already have a file job running. Use /file cancel first.",
      );
    }
    for (const [id, times] of this.attempts) {
      if (times.every((time) => now - time >= 60_000)) this.attempts.delete(id);
    }
    const recent = (this.attempts.get(user) ?? []).filter((time) =>
      now - time < 60_000
    );
    if (recent.length >= 6 || this.attempts.size >= 10_000) {
      throw new Error("Please wait a minute before starting another file job.");
    }
    recent.push(now);
    this.attempts.set(user, recent);
    const controller = new AbortController();
    this.jobs.set(user, controller);
    return controller;
  }
  finish(user: string, controller: AbortController) {
    if (this.jobs.get(user) === controller) this.jobs.delete(user);
  }
  cancel(user: string) {
    const controller = this.jobs.get(user);
    if (!controller) return false;
    controller.abort();
    return true;
  }
}
export const fileJobs = new FileJobRegistry();
export interface FileCommandInput {
  file: { filename: string; url: string; size: number };
  file2?: FileCommandInput["file"];
  file3?: FileCommandInput["file"];
  file4?: FileCommandInput["file"];
  file5?: FileCommandInput["file"];
  public?: boolean;
  [key: string]: unknown;
}
export async function runFileCommand(
  ctx: CommandContext,
  operation: FileOperation,
  options: FileToolOptions,
) {
  const input = ctx.options as unknown as FileCommandInput;
  // Visibility is chosen on the initial response; later edits cannot make it private.
  await ctx.deferReply(input.public !== true);
  let controller: AbortController | undefined;
  try {
    controller = fileJobs.start(ctx.author.id);
    const files = [
      input.file,
      input.file2,
      input.file3,
      input.file4,
      input.file5,
    ].filter((file): file is FileCommandInput["file"] => Boolean(file));
    if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
      throw new Error("Choose files totaling no more than 100 MiB.");
    }
    const base = Deno.env.get("STREAM");
    if (!base || !Authorization) {
      throw new Error(
        "The bot's file service is unavailable. Use the browser toolbox instead.",
      );
    }
    const discordLimit = ctx.interaction.attachmentSizeLimit;
    const limit = Number.isInteger(discordLimit) && discordLimit > 0
      ? Math.min(discordLimit, 100 * 1024 * 1024)
      : 10 * 1024 * 1024;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(130_000),
    ]);
    const response = await fetch(`${base.replace(/\/+$/, "")}/tools/file`, {
      method: "POST",
      headers: { Authorization, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        operation,
        options,
        files: files.map((file) => ({ name: file.filename, url: file.url })),
        maxOutputBytes: limit,
        actor: { userId: ctx.author.id, guildId: ctx.guildId },
      }),
    });
    if (!response.ok) {
      const bytes = response.body
        ? await readLimited(response.body, 4096, signal)
        : new Uint8Array();
      let detail =
        "The file could not be processed. Try again with a smaller file.";
      try {
        const body = JSON.parse(new TextDecoder().decode(bytes));
        if (typeof body.error === "string") detail = body.error.slice(0, 500);
      } catch { /* Keep the safe fallback. */ }
      throw new Error(detail);
    }
    if (!response.body) throw new Error("No file was returned.");
    const bytes = await readLimited(response.body, limit, signal);
    signal.throwIfAborted();
    const filename = decodeURIComponent(
      response.headers.get("X-File-Name") ?? "result.bin",
    );
    return await ctx.editOrReply({
      content:
        "Your file is ready. Bot tools process attachments on the server; use /tools for the browser toolbox.",
      files: [
        new AttachmentBuilder({ filename, resolvable: bytes, type: "buffer" }),
      ],
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    const message = controller?.signal.aborted
      ? "Cancelled. Your original attachments are unchanged."
      : error instanceof Error &&
          !/fetch|network|http|abort|timeout|stream/i.test(error.message)
      ? error.message
      : "The file service did not finish. Try a smaller file or use /tools.";
    return await ctx.editOrReply({
      content: message,
      allowed_mentions: { parse: [] },
    });
  } finally {
    if (controller) fileJobs.finish(ctx.author.id, controller);
  }
}
