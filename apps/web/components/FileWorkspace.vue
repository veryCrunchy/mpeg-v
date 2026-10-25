<script setup lang="ts">
import {
  tools,
  validateFiles,
  allowsMultiple,
  type ToolId,
  type PdfMode,
  type ArchiveMode,
  type TextMode,
  type LocalResult,
} from "~/utils/tools";
import { convertLocalFiles, zipResults } from "~/utils/localFiles";
import type { ImageFormat } from "~/utils/image";
import type { AudioFormat, VideoFormat } from "~/utils/mediaPlan";
import { nextTools, workflowMode } from "~/utils/workflow";
import { resolveAudioVideo } from "~/utils/core/audioVideo";
const props = defineProps<{ embedded?: boolean }>();
const audioVideo = ref(resolveAudioVideo());
const route = useRoute();
const tool = ref<ToolId>(
  tools.find((item) => item.id === route.query.tool)?.id ?? "image",
);
const selectedTool = computed(
  () => tools.find((item) => item.id === tool.value)!,
);
const imageFormat = ref<ImageFormat>("image/webp"),
  imageEdge = ref(0),
  imageQuality = ref(82);
const audioFormat = ref<AudioFormat>("mp3"),
  videoFormat = ref<VideoFormat>("mp4");
const bitrate = ref(128),
  videoEdge = ref(720),
  videoQuality = ref(28),
  start = ref(0),
  duration = ref(0);
const pdfMode = ref<PdfMode>("merge"),
  pages = ref("");
const imageRotation = ref(0),
  imageFlip = ref<"none" | "horizontal" | "vertical">("none");
const pdfFormat = ref<"image/png" | "image/jpeg">("image/png"),
  pdfDpi = ref(144),
  pdfRotation = ref(90);
const archiveMode = ref<ArchiveMode>("create"),
  textMode = ref<TextMode>("json-format"),
  spreadsheetSafe = ref(true);
const hashAlgorithm = ref<"SHA-256" | "SHA-384" | "SHA-512">("SHA-256"),
  expectedHash = ref("");
const mute = ref(false),
  normalize = ref(false);
const textModes: [TextMode, string][] = [
  ["json-format", "Format JSON"],
  ["json-minify", "Minify JSON"],
  ["csv-json", "CSV to JSON"],
  ["tsv-json", "TSV to JSON"],
  ["json-csv", "JSON to CSV"],
  ["json-tsv", "JSON to TSV"],
  ["base64-encode", "File to Base64"],
  ["base64-decode", "Base64 to file"],
  ["lines-sort", "Sort lines"],
  ["lines-unique", "Remove duplicate lines"],
  ["lines-lf", "Unix line endings (LF)"],
  ["lines-crlf", "Windows line endings (CRLF)"],
];
const frame = computed(
  () => tool.value === "video" && ["png", "jpg"].includes(videoFormat.value),
);
const actionLabel = computed(() =>
  tool.value === "zip"
    ? {
        create: "Create ZIP",
        extract: "Extract files",
        gzip: "Compress file",
        gunzip: "Decompress file",
      }[archiveMode.value]
    : tool.value === "pdf"
      ? {
          merge: "Merge PDFs",
          extract: "Create PDF",
          images: "Create PDF",
          render: "Create images",
          text: "Extract text",
          split: "Split PDF",
          rotate: "Rotate pages",
        }[pdfMode.value]
      : tool.value === "hash"
        ? "Calculate checksums"
        : frame.value
          ? "Capture frame"
          : tool.value === "audio"
            ? "Make video"
            : "Convert",
);
const files = shallowRef<File[]>([]);
const outputs = shallowRef<(LocalResult & { url: string })[]>([]);
const archive = shallowRef<LocalResult & { url: string }>();
const busy = ref(false),
  packing = ref(false),
  dragging = ref(false),
  inDiscord = ref(false);
const error = ref(""),
  status = ref("");
const fileInput = ref<HTMLInputElement>();
const { connected, connecting, sharing, connect, share, prepare, guildId, preferences } =
  useDiscordWorkspace();
let controller: AbortController | undefined;
let generation = 0;
const media = computed(() =>
  ["audio", "audio-format", "video"].includes(tool.value),
);
const multiple = computed(() =>
  allowsMultiple(tool.value, pdfMode.value, archiveMode.value),
);
const accept = computed(() => {
  const images = ".png,.jpg,.jpeg,.webp,.gif,.avif,.bmp";
  const audio = ".mp3,.wav,.flac,.aac,.m4a,.ogg,.opus";
  const video = ".mp4,.webm,.mov,.mkv,.avi,.m4v,.gif";
  if (
    tool.value === "image" ||
    (tool.value === "pdf" && pdfMode.value === "images")
  )
    return images;
  if (tool.value === "audio") return audio;
  if (tool.value === "audio-format") return `${audio},${video}`;
  if (tool.value === "video") return video;
  if (tool.value === "zip" && archiveMode.value === "extract") return ".zip";
  if (tool.value === "zip" && archiveMode.value === "gunzip")
    return ".gz,.gzip";
  return tool.value === "pdf" ? ".pdf" : undefined;
});
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1048576).toFixed(2)} MiB`;
function clearOutput() {
  for (const output of outputs.value) URL.revokeObjectURL(output.url);
  if (archive.value) URL.revokeObjectURL(archive.value.url);
  outputs.value = [];
  archive.value = undefined;
  status.value = "";
}
function cancel() {
  generation++;
  controller?.abort();
  busy.value = false;
  packing.value = false;
  status.value = "Cancelled. Your original files are unchanged.";
}
function resetResult() {
  cancel();
  clearOutput();
  error.value = "";
}
watch(audioVideo, () => { if (tool.value === "audio") resetResult(); }, { deep: true });
function selectFiles(selected: File[]) {
  resetResult();
  files.value = [];
  if (!selected.length) return;
  try {
    validateFiles(selected, tool.value, pdfMode.value, archiveMode.value);
    files.value = selected;
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}
function dropped(event: DragEvent) {
  dragging.value = false;
  selectFiles(Array.from(event.dataTransfer?.files ?? []));
}
function reorder(index: number, direction: number) {
  const next = [...files.value];
  [next[index], next[index + direction]] = [
    next[index + direction]!,
    next[index]!,
  ];
  resetResult();
  files.value = next;
}
function remove(index: number) {
  resetResult();
  files.value = files.value.filter((_, item) => item !== index);
}
watch([tool, pdfMode, archiveMode, textMode], () => {
  selectFiles([]);
  if (fileInput.value) fileInput.value.value = "";
});
watch(
  [
    imageFormat,
    imageEdge,
    imageQuality,
    audioFormat,
    videoFormat,
    bitrate,
    videoEdge,
    videoQuality,
    start,
    duration,
    pages,
    imageRotation,
    imageFlip,
    pdfFormat,
    pdfDpi,
    pdfRotation,
    spreadsheetSafe,
    hashAlgorithm,
    expectedHash,
    mute,
    normalize,
  ],
  resetResult,
);
watch(
  () => route.query.tool,
  (value) => {
    tool.value = tools.find((item) => item.id === value)?.id ?? "image";
  },
);
async function convert() {
  if (!files.value.length || busy.value || sharing.value) return;
  clearOutput();
  error.value = "";
  busy.value = true;
  const current = ++generation;
  const operation = new AbortController();
  controller = operation;
  try {
    const result = await convertLocalFiles(
      [...files.value],
      {
        tool: tool.value,
        imageFormat: imageFormat.value,
        imageEdge: imageEdge.value,
        imageQuality: imageQuality.value,
        pdfMode: pdfMode.value,
        pages: pages.value,
        imageRotation: imageRotation.value,
        imageFlip: imageFlip.value,
        pdfFormat: pdfFormat.value,
        pdfDpi: pdfDpi.value,
        pdfRotation: pdfRotation.value,
        archiveMode: archiveMode.value,
        textMode: textMode.value,
        spreadsheetSafe: spreadsheetSafe.value,
        hashAlgorithm: hashAlgorithm.value,
        expectedHash: expectedHash.value,
        media: {
          kind: tool.value as "audio" | "audio-format" | "video",
          audioFormat: audioFormat.value,
          videoFormat: videoFormat.value,
          bitrate: bitrate.value,
          maxEdge: videoEdge.value,
          quality: videoQuality.value,
          start: start.value,
          duration: duration.value,
          mute: mute.value,
          normalize: normalize.value,
          audioVideo: audioVideo.value,
        },
      },
      operation.signal,
      (message) => {
        if (current === generation) status.value = message;
      },
    );
    if (current !== generation) return;
    outputs.value = result.map((output) => ({
      ...output,
      url: URL.createObjectURL(output.blob),
    }));
    status.value =
      result.length === 1
        ? "Your file is ready."
        : `${result.length} files are ready.`;
  } catch (cause) {
    if (current === generation) {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Could not convert these files.";
      status.value = "";
    }
  } finally {
    if (current === generation) busy.value = false;
  }
}
async function packResults() {
  const current = ++generation;
  const operation = new AbortController();
  controller = operation;
  packing.value = true;
  error.value = "";
  try {
    const result = await zipResults(outputs.value, operation.signal);
    if (current !== generation) return;
    archive.value = { ...result, url: URL.createObjectURL(result.blob) };
    status.value = "Your ZIP is ready to download.";
  } catch (cause) {
    if (current === generation) error.value = (cause as Error).message;
  } finally {
    if (current === generation) packing.value = false;
  }
}
async function connectDiscord() {
  error.value = "";
  try {
    await connect();
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}
async function continueWith(output: LocalResult, target: string) {
  if (!nextTools(output.name).some((item) => item.id === target)) return;
  const next = new File([output.blob], output.name, { type: output.blob.type });
  const mode = workflowMode(output.name, target as ToolId);
  tool.value = target as ToolId;
  if (target === "pdf") {
    pdfMode.value = mode.pdf;
    pages.value = "";
  }
  if (target === "zip") archiveMode.value = mode.archive;
  // Let tool watchers clear old results before selecting this in-memory file.
  await nextTick();
  selectFiles([next]);
}
async function shareResult(output: LocalResult) {
  error.value = "";
  try {
    await share(output.blob);
    status.value = "Choose the destination in Discord to finish sharing.";
  } catch (cause) {
    error.value = (cause as Error).message;
  }
}
const shareable = (blob: Blob) =>
  ["image/png", "image/jpeg", "image/webp", "video/mp4"].includes(blob.type) &&
  blob.size <= 10 * 1024 * 1024;
onMounted(() => {
  inDiscord.value = Boolean(props.embedded && route.query.frame_id);
  if (inDiscord.value && useRuntimeConfig().public.discordClientId) {
    void prepare().catch((cause) => {
      error.value = (cause as Error).message;
    });
  }
});
onBeforeUnmount(() => {
  cancel();
  clearOutput();
});
</script>
<template>
  <div class="file-workspace">
    <div class="workspace-heading">
      <div>
        <NuxtLink v-if="embedded" to="/" class="brand">MPEG-V.</NuxtLink>
        <h1>Your file toolbox.</h1>
        <p>Convert on your device. Download when you're ready.</p>
      </div>
      <button
        v-if="inDiscord && !connected"
        class="button button-small"
        :disabled="connecting || busy"
        @click="connectDiscord"
      >
        {{ connecting ? "Connecting…" : "Connect to share" }}
      </button>
      <span v-if="connected" class="connection-label"
        ><span class="status-dot" /> Connected to Discord</span
      >
    </div>
    <div class="workspace-grid">
      <aside class="tool-sidebar">
        <div role="group" aria-label="File tools">
          <button
            v-for="item in tools"
            :key="item.id"
            :aria-pressed="tool === item.id"
            :disabled="sharing"
            @click="tool = item.id"
          >
            <ToolIcon :kind="item.icon" /><span
              >{{ item.label }}<small>{{ item.description }}</small></span
            >
          </button>
        </div>
        <p>
          Your files stay on this device. Nothing is uploaded for conversion.
        </p>
        <NuxtLink to="/privacy">About your files ↗</NuxtLink>
      </aside>
      <div class="workspace-panel" :aria-busy="busy || packing">
        <div class="panel-title">
          <h2>{{ selectedTool.label }}</h2>
          <span>{{ selectedTool.formats }}</span>
        </div>
        <fieldset
          v-if="tool === 'pdf'"
          class="image-settings"
          :disabled="busy || sharing"
        >
          <legend class="sr-only">PDF operation</legend>
          <label
            >What would you like to do?<select v-model="pdfMode">
              <option value="merge">Merge PDFs</option>
              <option value="extract">Select or reorder pages</option>
              <option value="images">Images to PDF</option>
              <option value="render">PDF to images</option>
              <option value="text">Extract text</option>
              <option value="split">Split into separate pages</option>
              <option value="rotate">Rotate pages</option>
            </select></label
          >
        </fieldset>
        <fieldset
          v-if="tool === 'zip'"
          class="image-settings"
          :disabled="busy || sharing || packing"
        >
          <legend class="sr-only">Archive operation</legend>
          <label
            >What would you like to do?<select v-model="archiveMode">
              <option value="create">Create ZIP</option>
              <option value="extract">Extract ZIP</option>
              <option value="gzip">Compress to GZIP</option>
              <option value="gunzip">Decompress GZIP</option>
            </select></label
          >
        </fieldset>
        <fieldset
          v-if="tool === 'text'"
          class="image-settings"
          :disabled="busy || sharing || packing"
        >
          <legend class="sr-only">Text operation</legend>
          <label
            >What would you like to do?<select v-model="textMode">
              <option
                v-for="[value, label] in textModes"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select></label
          >
          <label v-if="textMode === 'json-csv' || textMode === 'json-tsv'"
            >Formula-like cells<select v-model="spreadsheetSafe">
              <option :value="true">Prefix with apostrophe</option>
              <option :value="false">Keep unchanged</option>
            </select></label
          >
        </fieldset>
        <label
          class="dropzone"
          :class="{ dragging }"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="!sharing && dropped($event)"
        >
          <input
            ref="fileInput"
            type="file"
            :accept="accept"
            :multiple="multiple"
            :disabled="sharing"
            @change="
              selectFiles(
                Array.from(($event.target as HTMLInputElement).files ?? []),
              )
            "
          />
          <span class="drop-icon"><ToolIcon :kind="selectedTool.icon" /></span
          ><strong>{{
            files.length
              ? `${files.length} ${files.length === 1 ? "file" : "files"} selected`
              : multiple
                ? "Drop files here, or choose files"
                : "Drop a file here, or choose one"
          }}</strong>
          <span>{{
            files.length
              ? "Choose again to replace"
              : multiple
                ? "Up to 20 files · 100 MiB total"
                : tool === "pdf"
                  ? "Up to 25 MiB"
                  : tool === "text"
                    ? "Up to 10 MiB"
                    : "Up to 100 MiB"
          }}</span>
        </label>
        <ol
          v-if="files.length"
          class="selected-files"
          aria-label="Selected files in output order"
        >
          <li v-for="(file, index) in files" :key="index">
            <span
              ><strong>{{ file.name }}</strong
              ><small>{{ size(file.size) }}</small></span
            >
            <div>
              <button
                v-if="multiple"
                class="text-button"
                :aria-label="`Move ${file.name} up`"
                :disabled="index === 0 || busy || sharing || packing"
                @click="reorder(index, -1)"
              >
                ↑
              </button>
              <button
                v-if="multiple"
                class="text-button"
                :aria-label="`Move ${file.name} down`"
                :disabled="
                  index === files.length - 1 || busy || sharing || packing
                "
                @click="reorder(index, 1)"
              >
                ↓
              </button>
              <button
                class="text-button"
                :aria-label="`Remove ${file.name}`"
                :disabled="busy || sharing || packing"
                @click="remove(index)"
              >
                ×
              </button>
            </div>
          </li>
        </ol>
        <AudioVideoSettings
          v-show="tool === 'audio'"
          v-model="audioVideo"
          :connected="connected"
          :guild-id="guildId"
          :request="preferences"
          :disabled="busy || packing || sharing"
        />
        <fieldset
          v-if="tool === 'image'"
          class="image-settings"
          :disabled="busy || sharing || packing"
        >
          <legend class="sr-only">Image settings</legend>
          <label
            >Save as<select v-model="imageFormat">
              <option value="image/webp">WebP</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/png">PNG</option>
            </select></label
          >
          <label
            >Longest edge<select v-model.number="imageEdge">
              <option :value="0">Original size</option>
              <option :value="2560">2560 px</option>
              <option :value="1920">1920 px</option>
              <option :value="1280">1280 px</option>
              <option :value="800">800 px</option>
            </select></label
          >
          <label v-if="imageFormat !== 'image/png'"
            >Quality {{ imageQuality }}%<input
              v-model.number="imageQuality"
              type="range"
              min="10"
              max="100"
          /></label>
          <label
            >Rotate clockwise<select v-model.number="imageRotation">
              <option :value="0">No rotation</option>
              <option :value="90">90°</option>
              <option :value="180">180°</option>
              <option :value="270">270°</option>
            </select></label
          >
          <label
            >Flip after rotating<select v-model="imageFlip">
              <option value="none">No flip</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select></label
          >
        </fieldset>
        <fieldset
          v-if="media"
          class="image-settings media-settings"
          :disabled="busy || sharing"
        >
          <legend class="sr-only">Media settings</legend>
          <label v-if="tool === 'audio-format'"
            >Save as<select v-model="audioFormat">
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="ogg">OGG Vorbis</option>
              <option value="m4a">M4A (AAC)</option>
            </select></label
          >
          <label v-if="tool === 'video'"
            >Save as<select v-model="videoFormat">
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="gif">Animated GIF</option>
              <option value="png">PNG frame</option>
              <option value="jpg">JPEG frame</option>
            </select></label
          >
          <label v-if="tool === 'video' && videoFormat !== 'gif'"
            >Longest edge<select v-model.number="videoEdge">
              <option :value="480">480 px</option>
              <option :value="720">720 px</option>
              <option :value="1080">1080 px</option>
            </select></label
          >
          <label v-if="tool === 'video' && !frame && videoFormat !== 'gif'"
            >Video quality<select v-model.number="videoQuality">
              <option :value="23">Higher quality</option>
              <option :value="28">Balanced</option>
              <option :value="33">Smaller file</option>
            </select></label
          >
          <label
            v-if="
              tool !== 'audio' && !(
                tool === 'audio-format' && ['wav', 'flac'].includes(audioFormat)
              ) &&
              !(tool === 'video' && (videoFormat === 'gif' || frame || mute))
            "
            >Audio quality<select v-model.number="bitrate">
              <option :value="64">64 kbps</option>
              <option :value="128">128 kbps</option>
              <option :value="192">192 kbps</option>
              <option :value="256">256 kbps</option>
            </select></label
          >
          <label
            >Start (seconds)<input
              v-model.number="start"
              type="number"
              min="0"
              step="0.1"
          /></label>
          <label v-if="!frame"
            >Length (seconds)<input
              v-model.number="duration"
              type="number"
              min="0"
              step="0.1"
            /><small>0 keeps the remaining duration.</small></label
          >
          <label v-if="tool === 'video' && !frame && videoFormat !== 'gif'"
            >Sound<select v-model="mute">
              <option :value="false">Keep audio</option>
              <option :value="true">Remove audio</option>
            </select></label
          >
          <label v-if="tool === 'audio-format'"
            >Loudness<select v-model="normalize">
              <option :value="false">Keep original</option>
              <option :value="true">Normalize speech / music</option>
            </select></label
          >
        </fieldset>
        <fieldset
          v-if="tool === 'pdf' && !['merge', 'images'].includes(pdfMode)"
          class="image-settings"
          :disabled="busy"
        >
          <legend class="sr-only">Page selection</legend>
          <label
            >Pages<input
              v-model="pages"
              type="text"
              placeholder="1-3, 5, 8"
            /><small
              >Leave empty for all pages. For rotation, unselected pages stay
              unchanged.</small
            ></label
          >
          <label v-if="pdfMode === 'render'"
            >Save as<select v-model="pdfFormat">
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select></label
          >
          <label v-if="pdfMode === 'render'"
            >Resolution<select v-model.number="pdfDpi">
              <option :value="72">72 DPI</option>
              <option :value="144">144 DPI</option>
              <option :value="216">216 DPI</option>
            </select></label
          >
          <label v-if="pdfMode === 'rotate'"
            >Rotate clockwise<select v-model.number="pdfRotation">
              <option :value="90">90°</option>
              <option :value="180">180°</option>
              <option :value="270">270°</option>
            </select></label
          >
        </fieldset>
        <fieldset
          v-if="tool === 'hash'"
          class="image-settings hash-settings"
          :disabled="busy || sharing || packing"
        >
          <legend class="sr-only">Checksum settings</legend>
          <label
            >Algorithm<select v-model="hashAlgorithm">
              <option>SHA-256</option>
              <option>SHA-384</option>
              <option>SHA-512</option>
            </select></label
          >
          <label
            >Expected checksum (optional)<input
              v-model="expectedHash"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Paste a hexadecimal checksum"
            /><small
              >Choose one file to compare. Leave empty for a batch
              report.</small
            ></label
          >
        </fieldset>
        <p
          v-if="tool === 'image' || (tool === 'pdf' && pdfMode === 'images')"
          class="setting-note"
        >
          Up to 25 MiB and 24 million pixels per image. Animated inputs become a
          still frame. AVIF support depends on your browser.
        </p>
        <p
          v-if="tool === 'image' && imageFormat === 'image/jpeg'"
          class="setting-note"
        >
          Transparent areas become white in JPEG.
        </p>
        <p v-if="media" class="setting-note">
          {{
            tool === "video"
              ? frame
                ? "Capture one frame at the selected start time, from input up to 4K."
                : videoFormat === "gif"
                  ? "GIFs: up to 20 seconds, 480 px, without audio."
                  : "Videos: up to 3 minutes and 4K input. Output is resized without enlarging."
              : "Audio: up to 15 minutes. Extraction uses the first audio track."
          }}
          Larger files may take a few minutes. Results are limited to 100 MiB.
        </p>
        <p v-if="tool === 'pdf' && pdfMode !== 'images'" class="setting-note">
          Up to 25 MiB per PDF and 200 pages. Use unencrypted PDFs.
          <template v-if="pdfMode === 'render'"
            >Render up to 50 pages, 12 million pixels per page and 100 million
            pixels total. Pages have a white background.</template
          >
          <template v-else-if="pdfMode === 'text'"
            >Reads embedded text. Scanned pages need OCR, which this tool does
            not perform. Reading order depends on the PDF.</template
          >
          <template v-else
            >Creates new documents; forms, bookmarks and digital signatures are
            not preserved.</template
          >
        </p>
        <p v-if="tool === 'zip'" class="setting-note">
          <template v-if="archiveMode === 'create'"
            >Files appear at the top level of the ZIP. Duplicate filenames are
            numbered.</template
          >
          <template v-else-if="archiveMode === 'extract'"
            >Up to 200 entries and 100 MiB extracted. Folder paths become flat
            filenames. Encrypted, multipart and ZIP64 archives are not
            supported. Extracted files are download-only.</template
          >
          <template v-else
            >One file per GZIP. Decompressed output is limited to 100 MiB. A
            .tar.gz becomes a TAR file.</template
          >
        </p>
        <p v-if="tool === 'text'" class="setting-note">
          UTF-8 text, up to 10 MiB. Base64 encoding also accepts binary files.
          CSV and TSV become arrays of rows, keeping the header and all cell
          values as text. JSON numbers use JavaScript precision.
        </p>
        <p
          v-if="
            tool === 'text' &&
            (textMode === 'json-csv' || textMode === 'json-tsv')
          "
          class="setting-note"
        >
          The apostrophe option prevents formula-like cells from running as
          spreadsheet formulas. It changes those cell values.
        </p>
        <p v-if="tool === 'hash'" class="setting-note">
          Checksums compare exact file bytes. Matching hashes confirm the same
          content; they do not identify who created a file.
        </p>
        <div class="convert-actions">
          <button
            class="button"
            :disabled="!files.length || busy || sharing || packing"
            @click="convert"
          >
            {{ busy ? "Working…" : actionLabel
            }}<ToolIcon v-if="!busy" kind="arrow" /></button
          ><button v-if="busy || packing" class="text-button" @click="cancel">
            Cancel
          </button>
        </div>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <p class="result-status" role="status" aria-live="polite">
          {{ status }}
        </p>
        <progress
          v-if="busy || packing"
          aria-label="Processing files"
          class="conversion-progress"
        />
        <div v-if="outputs.length > 1" class="batch-download">
          <button
            v-if="!archive"
            class="button button-secondary button-small"
            :disabled="packing || sharing"
            @click="packResults"
          >
            {{ packing ? "Packing…" : "Pack results as ZIP" }}</button
          ><a
            v-else
            :href="archive.url"
            :download="archive.name"
            class="button button-small"
            >Download ZIP · {{ size(archive.blob.size) }}</a
          >
        </div>
        <div
          v-for="output in outputs"
          :key="output.url"
          class="conversion-result"
        >
          <pre v-if="output.preview" class="file-text-preview">{{
            output.preview
          }}</pre>
          <img
            v-if="output.blob.type.startsWith('image/')"
            :src="output.url"
            :alt="output.name"
            loading="lazy"
          />
          <video
            v-else-if="output.blob.type.startsWith('video/')"
            :src="output.url"
            controls
            playsinline
            preload="metadata"
          />
          <audio
            v-else-if="output.blob.type.startsWith('audio/')"
            :src="output.url"
            controls
            preload="metadata"
          />
          <div class="result-details">
            <strong>{{ output.name }}</strong
            ><span
              >{{ size(output.blob.size)
              }}<template v-if="output.detail">
                · {{ output.detail }}</template
              ></span
            >
          </div>
          <div class="result-actions">
            <select
              class="continue-tool"
              :aria-label="`Use ${output.name} in another tool`"
              :disabled="busy || packing || sharing"
              @change="continueWith(output, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Use in another tool</option>
              <option
                v-for="item in nextTools(output.name)"
                :key="item.id"
                :value="item.id"
              >
                {{ item.label }}
              </option>
            </select>
            <a
              :href="output.url"
              :download="output.name"
              class="button button-small"
              >Download</a
            ><button
              v-if="connected && shareable(output.blob)"
              class="button button-secondary button-small"
              :disabled="sharing || packing"
              @click="shareResult(output)"
            >
              {{ sharing ? "Opening Discord…" : "Share in Discord" }}
            </button>
          </div>
          <p v-if="connected && !shareable(output.blob)" class="setting-note">
            Download this file to share it. Direct Discord sharing supports PNG,
            JPEG, WebP and MP4 up to 10 MiB.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
