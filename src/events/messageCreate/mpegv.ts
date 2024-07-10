import { event, generateVideo } from "../../utils";
export default event("messageCreate", async ({ log, client }, message) => {
  generateVideo(message, log, client);
});
