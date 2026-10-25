# Growing the file toolbox

Keep the website and Discord Activity as two clients of the same tools. The bot
remains useful for quick attachment actions. Tools that can run locally, such
as image conversion, should keep doing so without a sign-in or upload.

## Next useful tools

1. Video compression with a target upload size; format conversion and resizing already run locally.
2. Per-file recovery for image batches; conversion and ZIP download already run locally.
3. OCR for scanned PDFs, password-protected PDF workflows and document previews;
   PDF rendering, embedded text extraction, splitting and rotation now run locally.
4. Selective archive extraction and TAR/7z support. ZIP extraction and GZIP now
   run locally with expansion limits and safe download names. Never extract
   untrusted archive paths directly or silently open extracted active content.
5. Office document conversion only after a reliable local engine is available.
   Do not advertise unsupported formats as part of an unrestricted file suite.

Keep new tools local whenever practical. Use device workers with resource budgets
and explicit cancellation. Never silently upload a file when local processing
fails. Any future remote-only tool must clearly explain the upload before it starts.

## Shared job service

The bot now exposes `/file` commands through authenticated `POST /tools/file`.
PDF, archive, text, checksum, validation and media planning code is shared with
the browser in `apps/web/utils/core`. The service uses native FFmpeg for media
and terminable workers for document processing. Browser tools continue to run
locally with no server fallback. Both `/workspace` and `/activity` support
passing a result into a compatible next tool without downloading it first.

The current synchronous API is suitable for short conversions in a single
worker process. Before adding long jobs or multiple replicas, introduce:

- A tool registry with validated inputs, outputs and resource budgets.
- Authenticated job creation and owner-scoped status, cancellation and download
  endpoints. A job ID alone must not grant access to a file.
- A bounded durable queue, a shared quota store and isolated workers with CPU,
  memory, disk and execution limits. Preserve per-user and overall admission limits.
- Short-lived object storage with explicit expiry and deletion. Do not turn
  conversion results into a permanent user file library by accident.
- Coarse operational metrics without filenames, raw media, signed attachment
  URLs, bearer tokens or unnecessary Discord identities.

Keep existing voice translation separate from file jobs. Its session metadata
API requires the private service token for every read and write. JSON snapshots
now load and update serially, with atomic replacement and explicit failure
responses. This remains a single-process store: use transactional shared
persistence before adding replicas. A future viewer API must authenticate the
viewer and authorize access to that session without exposing the service token.

## Dependency maintenance

Use the committed lockfiles and audit dependency changes. The current upstream
Discord SDK depends on Zod 3; its constrained-collection memory advisory does
not have a compatible upstream fix. Do not force Zod 4 underneath the SDK.
Nitro's local development listener also brings node-forge with an RSA signature
verification advisory. Run production from the built server, not the dev server,
and use the HTTPS ingress for TLS. Track upstream releases before public rollout.
