# MPEG-V

A growing file toolbox for the web and Discord. The bot works with image, audio,
video, PDF, archive and text attachments. The web workspace converts and resizes PNG, JPEG
and WebP images, converts audio and video, works with PDFs, archives and text files
locally. It can run as a Discord Activity with the same tools and an explicit
sharing dialog. Browser conversion never uploads file contents or requires sign-in.

## Run locally

Use Node **24.15 or newer in the 24.x line** for the website, Deno **2.7.7 or newer** for the bot
and worker, and FFmpeg plus FFprobe on the worker's PATH. The web Docker image
pins Node 24.19.0; the Deno Docker images pin Deno 2.7.7.

```sh
cd apps/web
npm ci
npm run dev
```

The website listens on `http://127.0.0.1:3100`. All browser tools work without
account credentials or a conversion worker. Copy `.env.example` to `.env` to configure Discord sharing.
Keep all secrets out of version control.

```sh
cd apps/serve
# Copy .env.example to .env and set API_TOKEN.
deno task dev
```

The worker listens on port 3000. Existing bot deployments continue to use
`STREAM` and `API_TOKEN` with `POST /generate`. The web gateway uses
`POST /tools/audio-to-video`, forwarding raw audio bytes with the worker's token.
Neither conversion endpoint accepts unauthenticated requests. These endpoints
remain available for service clients; the browser workspace does not call them.

## Applications

| Path | Responsibility |
| --- | --- |
| `apps/web` | Nuxt landing page, browser image tools, Discord Activity and authenticated gateway |
| `apps/serve` | Bounded file processing and translation session tracking |
| `apps/bot` | Discord slash commands, attachment menus and automatic audio conversion |
| `apps/hooks` | Ed25519 request verification and signed ping responses |
| `apps/mpeg-v` | Shared types and service helpers |

## Browser tools

| Tool | Supported work |
| --- | --- |
| Images | PNG, JPEG, WebP, GIF, BMP and browser-supported AVIF to PNG/JPEG/WebP; resize, quality, rotation, flipping and batches |
| Audio to video | Local MP4 with waveform, filled wave, dots or frequency bars; colors, size, frame rate, audio quality and trimming |
| Audio | MP3, WAV, FLAC, OGG Vorbis and M4A output; extract the first audio track from video; optional loudness normalization |
| Video | MP4, WebM and animated GIF output; resize, quality, trimming, remove audio, PNG/JPEG frame capture |
| PDF | Merge, select/reorder/duplicate pages, split into individual PDFs, rotate selected pages, images to PDF, PDF to PNG/JPEG, embedded text extraction |
| Archives | Create ZIP, extract ZIP, GZIP compression/decompression, bundle any multi-file results; safe and unique download names |
| Text and data | JSON formatting/minification, CSV/TSV to JSON rows and back, binary Base64, sort/deduplicate lines, LF/CRLF conversion |
| Checksums | SHA-256/384/512 batch reports and optional expected-checksum comparison |

Browser limits: 20 files and 100 MiB total; images and PDFs have a 25 MiB
per-file limit. Images are limited to 24 million pixels. PDF operations accept
200 pages; encrypted PDFs are rejected, and copied pages do not preserve forms,
bookmarks or signatures. Audio clips can be up to 15 minutes, videos 3 minutes
with up to 4K input, and GIFs 20 seconds at a 480-pixel longest edge. All results
are limited to 100 MiB. File size may increase when changing formats.

PDF rendering accepts up to 50 selected pages at 72/144/216 DPI, capped at
12 million pixels per page and 100 million pixels total. Text extraction reads
embedded text, not OCR; layout/reading order depends on the source document.
PDF.js and its worker, fonts, CMaps and decoders are loaded from this site's
versioned assets. No document URL is sent to an external renderer.

ZIP extraction accepts up to 200 entries and 100 MiB expanded data. It validates
the directory, actual streamed expansion and CRC, rejects encrypted, multipart
and ZIP64 archives, and flattens paths for safe downloads. Extracted files are
never previewed as active content. GZIP decompresses one stream to a file; TAR,
RAR and 7z unpacking are not implemented. Text tools accept up to 10 MiB UTF-8;
Base64 encoding also accepts binary. JSON unsafe integer values are rejected.
CSV/TSV preserve cells as strings and include the header row. Table export can
prefix formula-like cells to prevent spreadsheet execution.

Media tools load a self-hosted, versioned FFmpeg WebAssembly engine on demand
(about 31 MB). The single-thread build works without cross-origin isolation,
including environments where SharedArrayBuffer is unavailable. PDF and ZIP
processing also run in cancellable workers. There is no automatic server
fallback. After loading the engine, processing uses device CPU and memory;
large conversions can be slower on phones. Closing or cancelling terminates
the active worker. No conversion telemetry or file contents are uploaded.

`npm run dev` and `npm run build` copy the pinned engine into the ignored
`apps/web/public/vendor/ffmpeg/` and `pdfjs/` directories. Serve these generated assets with the
application; do not commit them. Update `utils/mediaAssets.ts` and `utils/pdfAssets.ts` alongside engine
package upgrades. See [media engine upstream](https://ffmpegwasm.netlify.app/docs/faq/)
for its source, build instructions and codec licenses before distributing builds.

## Bot and service conversion limits

### File commands

| Command | Supported work |
| --- | --- |
| `/file image` | PNG/JPEG/WebP output, resize, rotate and flip |
| `/file audio` | MP3/WAV/FLAC/OGG/M4A, audio extraction, trimming, normalization and waveform MP4 |
| `/file video` | MP4/WebM/GIF, trim, resize, mute and PNG/JPEG frame capture |
| `/file pdf` | Merge up to five PDFs, select/reorder pages, split into a ZIP, rotate and images to PDF |
| `/file archive` | Create ZIP, list entries, extract one named entry, GZIP compression and decompression |
| `/file text` | JSON, CSV/TSV, Base64 and line transformations |
| `/file checksum` | SHA-256/384/512 and expected-hash comparison |
| `/file info` | File size and SHA-256 report |
| `/file cancel` | Cancel your active file job |
| `/tools` | Tool directory and optional browser link |
| `/activity` | Launch the file workspace when the Activity is configured |
| `/settings show` | View personal or server defaults and effective conversion settings |
| `/settings audio-video` | Save selected audio-to-video defaults for yourself or a server |
| `/settings reset` | Remove one saved setting or all overrides |

File commands default to private responses. `public:true` explicitly posts the
result publicly; it does not change visibility of an attachment already posted
in a channel. Commands accept up to five attachments totaling 100 MiB. The bot
allows one active file job and six new jobs per minute per user, per bot worker.
The service shares its two conversion slots with the existing audio endpoints.
Results must fit the interaction's attachment limit. Jobs time out after two
minutes, with a 60-second budget for each document worker. Split PDFs are returned
as one ZIP; ZIP extraction uses the safe name returned by `action:list`.
PDF-to-image and PDF text extraction are available in the browser and Activity.

`POST /tools/file` requires the worker's API token. It downloads only validated
Discord attachments and returns the result bytes directly, with no stored job
history. Native media tools use temporary files, while document tools run in
terminable workers. The pure processing modules in `apps/web/utils/core` are
shared by the browser and Deno service. New file commands do not write analytics.

The commands are implemented locally. Starting the real bot connects to Discord
and uploads its commands, so offline checks must use `deno task test` instead.
Keep `DISCORD_ACTIVITY_ENABLED=false` until the portal and hosting are ready.
`WEB_PUBLIC_URL` optionally adds an HTTPS browser-toolbox link to `/tools`.

### Existing audio conversion

- Two worker jobs at once, including their downloads. Excess requests receive 429.
- Audio input: 100 MiB for bot attachments, 25 MiB through the web gateway.
- Audio duration: 15 minutes maximum; conversion timeout: two minutes.
- Default audio output: 250 × 100 H.264 waveform at 15 fps with 128 kb/s stereo AAC; saved preferences and explicit command options can change it.
- Web output: 10 MiB. Bot commands use Discord's interaction-specific attachment
  limit up to a 100 MiB worker ceiling. Automatic replies retain the conservative
  10/50/100 MiB tier fallback when no interaction limit is available.
- Browser image animation is flattened to a single frame. JPEG uses a white
  background for transparency. Resize never enlarges.
- Authenticated gateway processing and sharing: one active job per Discord user, four admitted
  gateway jobs overall and six jobs per user per minute, per server process.

Downloads only accept HTTPS Discord attachment hosts and never follow redirects.
FFmpeg runs on temporary local files with a restricted demuxer/protocol list.
The encoder is killed on cancellation, timeout or output overflow. Temporary
inputs are removed in a `finally` block. Configure host-level temporary-file
cleanup for abnormal process or host termination.

## Saved preferences

The conversion worker owns a local SQLite database for personal and server
audio-to-video preferences. It stores Discord IDs, selected settings and random
revision tokens. It stores no files, OAuth tokens, display names or conversion
history. Translation-session storage remains separate.

The database is created automatically on first use. To initialize it without
starting the bot or connecting to Discord:

```sh
cd apps/serve
# Copy .env.example to .env first.
deno task db:init
```

The default is the ignored `apps/serve/.data/settings.sqlite`. Set
`SETTINGS_DATABASE` to move it. The local web application's server connects using
`NUXT_PREFERENCES_URL=http://127.0.0.1:3000` and `NUXT_PREFERENCES_TOKEN` set to the
worker's `API_TOKEN`. These credentials never go to the browser. Keep the worker
bound to `HOST=127.0.0.1` for local development; a container's internal network
listener can use `HOST=0.0.0.0`.

Settings apply in this order: built-in defaults, server defaults, personal
overrides, then explicit conversion options. Resetting an individual personal
setting restores inheritance for that field. For example:

```text
/settings audio-video scope:server visualization:bars color:#6eecb5 background:#10201a
/settings audio-video scope:me size:wide fps:30
/settings reset scope:me setting:color
/settings show
```

Personal settings belong to the invoking user. Server edits require Manage
Server or Administrator permission; Activity requests verify membership and
current permissions with Discord before writing. Settings commands always reply
privately. Stored defaults apply to `/generate video`, attachment menus,
automatic audio conversion and `/file audio format:waveform`. One-time command
options do not modify saved settings.

In the browser, **Save defaults → This device** stores only appearance options in
localStorage. This is opt-in and can be reset from the same panel. Connect inside
the Activity to load/save personal or server defaults. Browser saves remember
all six displayed options; bot commands can save or reset individual fields.
Conversions still run entirely on the device. Discord authorization is needed
only for account/server preferences and sharing, not for local work.

SQLite uses WAL mode, transactional updates and revision checks to prevent stale
edits from silently overwriting newer ones. A conflict requires reloading.
Corrupt, unreadable or unsupported database versions fail closed and are never
replaced automatically. Use a persistent directory on one host, not a network
filesystem or separately copied databases across replicas. Back up with SQLite's
online backup facility, or stop the worker before copying the database directory
including any WAL files. On Windows, restrict the directory ACL to the service
account; new Unix files use owner-only permissions. Deno 2.7.7 is the tested
minimum for reliable SQLite closure on Windows.

## Translation session privacy and storage

Every `/translation-sessions` route requires the worker's `API_TOKEN`, including
individual reads. Responses use `Cache-Control: no-store` and do not grant
cross-origin browser access. A session ID is not authorization. Keep this API
internal; a captions frontend must use its own authenticated backend and check
viewer access before returning any session data. Never put the worker token in
browser code. Existing anonymous metadata consumers will now receive 401.

New caption links use full random UUIDs rather than embedded Discord server and
channel IDs. Existing session IDs remain readable by the authenticated bot so
restart recovery still works. The separate caption service controls access to
captions themselves; this repository does not revoke already-shared caption links.

Set `TRANSLATION_SESSIONS_FILE` to a file on a persistent volume outside the
repository, or an ignored `.data/` directory for local development. Without it,
session tracking remains in memory and does not survive worker restarts.
Use **one worker process per session file**. Multiple replicas need transactional
shared storage, not separate in-memory caches writing the same JSON file.

The worker serializes initial loading, reads and updates. Each save writes a
complete temporary snapshot beside the destination, flushes it, then replaces
the destination. It publishes the new in-memory state only after saving succeeds.
Save failures return 503, leaving the previous state intact; the bot will not
start a new session after a failed tracking request. Invalid or unreadable
snapshots also return 503 and are never silently replaced with empty state.
Preserve the failing file before repairing or restoring it from backup.

New files use owner-only Unix permissions; on Windows, restrict the containing
directory's ACL to the service account. Maintain backups. A host crash can leave
an incomplete `.translation-sessions-*.tmp` file beside the snapshot; these files
contain private metadata and must not be published. Clean them only while the
worker is stopped. Atomic replacement does not provide cross-host coordination
or a backup against storage-device failure.

## Checks

```sh
deno task test
cd apps/web
npm test
npm run typecheck
npm run build
```

The conversion tests create synthetic audio fixtures in the OS temporary
directory, run real FFmpeg/FFprobe, inspect output codecs and decode the results.
No personal audio, browser captures or local diagnostics belong in this repo.
Session tests cover unauthorized reads, concurrent startup and updates, restart
recovery, corrupt snapshots and failed writes using synthetic data in temporary
directories.

## Deployment

```sh
docker build -t mpeg-v-web apps/web
deno task build:serve
```

Deploy the web gateway separately from the worker. Set the variables from the
two `.env.example` files in the deployment environment. Production Node does not
automatically load `.env`. Keep the conversion worker on the internal network;
only the web application needs a public HTTPS endpoint. Apply ingress body,
connection and rate limits too. The limits in this application are per process,
not a substitute for a distributed quota service.

See [Discord Activity setup](docs/discord-activity.md) for URL mappings, credentials
and client verification. See [service direction](docs/service-direction.md) for
the path towards additional file tools.
