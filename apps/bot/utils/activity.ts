import {
  ActionRow,
  Button,
  type CommandContext,
  type EntryPointContext,
} from "seyfert";
import {
  ButtonStyle,
  InteractionResponseType,
  MessageFlags,
} from "seyfert/lib/types/index.js";
export function workspaceUrl(value = Deno.env.get("WEB_PUBLIC_URL")) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }
    return new URL("/workspace", url).href;
  } catch {
    return undefined;
  }
}
export function toolboxReply() {
  const url = workspaceUrl();
  return {
    content:
      "**MPEG-V file tools**\nUse `/file image`, `/file audio`, `/file video`, `/file pdf`, `/file archive`, `/file text`, `/file checksum` or `/file info`. Stop a job with `/file cancel`.\n\nUse `/settings audio-video` to save visualization, color, size and audio defaults for yourself or your server. `/settings reset` restores inherited defaults.\n\nBot tools process Discord attachments on the server and return private replies unless you choose `public:true`. The browser toolbox and Activity process files on your device, including PDF-to-image conversion.\n\n" +
      (Deno.env.get("DISCORD_ACTIVITY_ENABLED") === "true"
        ? "Use `/activity` or the App Launcher to open the file workspace inside Discord."
        : "The Activity is not connected to this Discord application yet."),
    flags: MessageFlags.Ephemeral,
    allowed_mentions: { parse: [] as never[] },
    components: url
      ? [
        new ActionRow<Button>().addComponents(
          new Button().setStyle(ButtonStyle.Link).setLabel(
            "Open browser toolbox",
          ).setURL(url),
        ),
      ]
      : [],
  };
}
export function launchWorkspace(ctx: CommandContext | EntryPointContext) {
  if (Deno.env.get("DISCORD_ACTIVITY_ENABLED") !== "true") {
    return ctx.write(toolboxReply());
  }
  // Launch must be the initial response. Do not defer before this callback.
  return ctx.interaction.reply({
    type: InteractionResponseType.LaunchActivity,
  });
}
