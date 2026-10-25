# Discord Activity

The Activity is a file utility, with no game mechanics required. It shares the
web workspace with the existing product. All conversions run on the device,
including audio-to-video. Sharing and account/server defaults need Discord
authorization; device defaults and conversions work without it.

## Local workspace

Run `npm run dev` in `apps/web` and open `http://127.0.0.1:3100/activity`.
No application ID, bot token or OAuth secret is needed for local file work.
Each result offers **Use in another tool**, which passes the file in memory:
for example, render PDF pages, resize an image, then package it in a ZIP.
There is no automatic upload or sign-in step between tools.

The bot includes `/tools` and `/activity`. The primary entry-point command is
registered only with `DISCORD_ACTIVITY_ENABLED=true`; leave it false for local
development. Its handler and `/activity` send the initial `LAUNCH_ACTIVITY`
callback without deferring. The Activity acknowledges the SDK ready handshake
when opened inside Discord, before the optional OAuth sharing flow. Closing the
workspace aborts outstanding requests and clears its in-memory access token.

Offline tests serialize the command definitions and exercise their callbacks
without contacting Discord. Do not start the bot merely to inspect commands:
its startup connects to the gateway and uploads command definitions.

## Configure the application

These are later integration steps; local development does not change the portal.

1. Choose a Discord application in the Developer Portal and enable Activities.
   The existing bot application can be used, or a separate testing application.
2. Add the OAuth redirect URI required by Discord's Activity setup. The Embedded
   App SDK handles the redirect during its `authorize` command.
3. Map the root `/` URL prefix to the deployed web application's HTTPS host.
   The host must serve the Nuxt application and `/api` on the same origin.
   The root route forwards Discord launch parameters to `/activity`.
4. Set `NUXT_PUBLIC_DISCORD_CLIENT_ID` and the server-only
   `NUXT_DISCORD_CLIENT_SECRET`. Optionally set
   `NUXT_PUBLIC_DISCORD_INSTALL_URL` to the portal's install link. Without an app
   ID, the site links to its browser tools instead of inventing an invite.
5. Serve the generated `/vendor/ffmpeg/` and `/vendor/pdfjs/` assets through the same root URL mapping.
   The single-thread engine does not require SharedArrayBuffer or COOP/COEP.
   The legacy conversion gateway settings are optional for other API clients;
   browser conversion does not need a worker connection. To save account/server
   defaults, set server-only `NUXT_PREFERENCES_URL` and `NUXT_PREFERENCES_TOKEN` to
   the worker's internal URL and API token.
6. Set the bot's `DISCORD_ACTIVITY_ENABLED=true` to register the app-handled
   primary entry point and enable `/activity`. Optionally set `WEB_PUBLIC_URL`
   to the HTTPS site origin for the browser link in `/tools`.
7. Launch from Discord's App Launcher using an account allowed to test the app.
   Select a file and convert without sign-in. Connect Discord when sharing.

The connection requests `identify` and `guilds`. The server checks the OAuth
token's application, identity and expiry against Discord. Server preference
reads require current membership; writes additionally require Manage Server,
Administrator or server ownership. The guilds scope supplies these checks.
Access tokens stay in page memory and request Authorization headers. They are
not stored in localStorage, URLs, cookies, server sessions or logs. The OAuth
client secret and worker token remain server-only.

Sharing uploads the converted bytes to Discord's Activity attachment endpoint,
then opens `openShareMomentDialog`. Opening that dialog does not prove a message
was sent. The user chooses the final destination and confirms sharing in Discord.
The app does not post messages to a channel automatically.

## Client acceptance checks

Verify these on Discord desktop, web and mobile before enabling discovery:

- The entry point opens the Activity with its launch query intact.
- Connect Discord completes authorization and authentication for this app.
- The file picker selects supported local media, PDFs and multiple files inside the iframe.
- A short audio conversion returns a playable MP4; malformed audio shows an error.
- PNG/WebP transparency survives conversion; JPEG fills it white.
- Sharing opens Discord's picker with the output and reaches the chosen channel.
- Cancelling or closing the Activity leaves no running audio encoder.
- Conversion still works without OAuth; reconnecting after OAuth expiry restores sharing.
- Passing a result into another tool keeps its bytes local and selects the matching operation.
- Personal defaults survive reconnecting and a worker restart; resetting restores server defaults.
- A server manager can save defaults; ordinary members can read and use them but cannot edit them.
- Two editors cannot silently overwrite each other's saved defaults; a stale save asks for reload.
- Small Activity windows and mobile clients keep all controls reachable.

Browser verification alone cannot confirm the Discord iframe, its native file
picker or final channel delivery. Discord may further restrict file sizes and
media types. Current direct sharing accepts PNG, JPEG, WebP and MP4 up to 10 MiB;
other output types can be downloaded and attached manually.

## References

- [Building an Activity](https://docs.discord.com/developers/activities/building-an-activity)
- [Networking and proxy URL mappings](https://docs.discord.com/developers/activities/development-guides/networking)
- [User actions and media sharing](https://docs.discord.com/developers/activities/development-guides/user-actions)
- [Embedded App SDK](https://docs.discord.com/developers/developer-tools/embedded-app-sdk)
