# MPEG-V web

Nuxt 4 landing page and file workspace. Use Node 24.15+ and `npm ci`, followed by
`npm run dev`. The production command is `node .output/server/index.mjs` after
`npm run build`. Supply runtime environment variables to that process.

Routes: `/` introduces the toolbox; `/workspace` runs the browser tools;
`/activity` hosts the Discord experience; `/privacy` explains file handling.
Discord launches mapped to `/` retain their launch query and route to `/activity`.

All toolbox conversion happens on the device. Images use canvas; media uses a
single-thread FFmpeg WebAssembly worker; PDF and ZIP operations use a separate
worker. Dependencies load on demand. The browser never sends files to the legacy
audio conversion gateway. Inside Discord, the SDK initializes to acknowledge the
Activity launch; authorization is requested only when connecting for sharing or
account/server defaults. Device defaults are saved only after choosing Save
defaults. File bytes and Discord access tokens are never put in localStorage.
Results can be passed into another compatible tool in memory. The pure modules
in `utils/core` are also used by the bot's Deno file-processing service.

Development and builds copy pinned engine assets to the ignored
`public/vendor/ffmpeg/` directory. Versioned URLs allow long-term browser caching.
Ship those generated assets with the application. Changing engine versions also
requires updating `utils/mediaAssets.ts`; preparation verifies both versions.

PDF rendering and text extraction use PDF.js. Its worker, CMaps, fonts and decoders
are copied to ignored `public/vendor/pdfjs/` assets and served from this origin.
Update `utils/pdfAssets.ts` with the pinned package. PDF splitting/rotation,
archive extraction, text transformations and checksum calculations use the
cancellable file worker. Extracted archive content is download-only.

See the root [README](../../README.md) and [Activity guide](../../docs/discord-activity.md).

For account/server preferences, set `NUXT_PREFERENCES_URL` to the local worker and
`NUXT_PREFERENCES_TOKEN` to its `API_TOKEN`. The browser API derives the owner from
Discord's verified identity and checks guild permissions for every server write.
The worker owns SQLite; the Nuxt app never opens the database directly.
