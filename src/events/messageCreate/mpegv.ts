import { event, generateVideo } from "../../utils";
export default event("messageCreate", async ({ log, client }, message) => {
  if (client.user && message.author.id === client.user?.id) return;
  generateVideo(message, log, client);
});
