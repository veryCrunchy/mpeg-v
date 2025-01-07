import { Embed } from "seyfert";
import { ColorResolvable } from "seyfert/lib/common/types/resolvables.js";

export const COLORS: { [key: string]: ColorResolvable } = {
  success: "#80ed99",
  error: "#ef4444",
  info: "#00b4d8",
  default: "#ffffff",
};

export const embed = ({
  title,
  message,
  status = "info",
  color,
}: {
  title?: string;
  message: string;
  status?: "success" | "error" | "info";
  color?: `#${string}`;
}): Embed => {
  return new Embed().setColor(color || COLORS[status || "default"])
    .setDescription(message)
    .setTitle(title);
};
