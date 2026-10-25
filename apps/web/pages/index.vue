<script setup lang="ts">
import { tools } from "~/utils/tools";
const route = useRoute();
// Discord's root URL mapping must retain its launch parameters.
if (route.query.frame_id)
  await navigateTo(
    { path: "/activity", query: route.query },
    { replace: true },
  );
const example = ref<"audio" | "image">("audio");
const bars = Array.from(
  { length: 56 },
  (_, i) => 8 + Math.abs(Math.sin(i * 0.83) * Math.cos(i * 0.19)) * 76,
);
</script>
<template>
  <div>
    <SiteHeader />
    <main id="main">
      <section class="hero shell">
        <div class="hero-copy">
          <div class="intro-line">
            <span class="status-dot" /> A little less file friction.
          </div>
          <h1>Make your<br />files <span>fit.</span></h1>
          <p>
            That audio clip. That oversized image.<br class="desktop-only" />
            Get it into the shape you need, and get back to the conversation.
          </p>
          <div class="hero-actions">
            <NuxtLink class="button" to="/workspace"
              >Open the toolbox <ToolIcon kind="arrow" /></NuxtLink
            ><a class="text-link" href="#discord"
              >Meet the Discord bot <span aria-hidden="true">↗</span></a
            >
          </div>
          <p class="hero-note">
            Images, media, PDFs, archives and text. All on your device.
          </p>
        </div>
        <div class="conversion-scene" aria-label="Example file conversions">
          <div class="scene-top">
            <span class="tiny-mark">MV</span><span>One file. A better fit.</span
            ><span class="scene-dots" aria-hidden="true">•••</span>
          </div>
          <div
            class="example-tabs"
            role="group"
            aria-label="Choose a conversion example"
          >
            <button
              :aria-pressed="example === 'audio'"
              @click="example = 'audio'"
            >
              Audio to video</button
            ><button
              :aria-pressed="example === 'image'"
              @click="example = 'image'"
            >
              Image to WebP
            </button>
          </div>
          <div class="input-file">
            <span class="file-icon"><ToolIcon :kind="example" /></span>
            <div>
              <strong>{{
                example === "audio" ? "voice-note.wav" : "weekend-photo.png"
              }}</strong
              ><small>{{
                example === "audio"
                  ? "A clip worth sharing"
                  : "A photo worth keeping"
              }}</small>
            </div>
            <span class="extension">{{
              example === "audio" ? "WAV" : "PNG"
            }}</span>
          </div>
          <div class="conversion-connector" aria-hidden="true">
            <span /><span>↓</span><span />
          </div>
          <div class="output-file">
            <div v-if="example === 'audio'" class="waveform" aria-hidden="true">
              <i
                v-for="(height, i) in bars"
                :key="i"
                :style="{ height: `${height}%` }"
              />
            </div>
            <div v-else class="image-example" aria-hidden="true">
              <div class="sun" />
              <div class="hill hill-back" />
              <div class="hill" />
            </div>
            <div class="output-meta">
              <div>
                <strong>{{
                  example === "audio" ? "voice-note.mp4" : "weekend-photo.webp"
                }}</strong
                ><small>{{
                  example === "audio"
                    ? "Sound on. Press play."
                    : "Same moment. A new format."
                }}</small>
              </div>
              <span class="ready-mark" aria-label="Example result">✓</span>
            </div>
          </div>
          <div class="scene-bottom">
            <span>{{
              example === "audio"
                ? "Made for the chat"
                : "Converted on your device"
            }}</span
            ><span>{{ example === "audio" ? "WAV → MP4" : "PNG → WEBP" }}</span>
          </div>
        </div>
      </section>
      <div class="format-strip">
        <div class="shell">
          <span>Different files. Same place.</span
          ><span
            >MP3 <b>↔</b> WAV <b>↔</b> MP4 <b>·</b> PNG <b>↔</b> JPG
            <b>↔</b> WEBP</span
          >
        </div>
      </div>
      <section id="tools" class="tools-section shell section-space">
        <div class="section-heading">
          <h2>Small tools.<br />Useful every day.</h2>
          <p>
            Start with the file you have.<br />Leave with the file you need.
          </p>
        </div>
        <div class="tool-list">
          <NuxtLink
            v-for="(item, index) in tools"
            :key="item.id"
            :to="`/workspace?tool=${item.id}`"
            class="tool-row"
            ><span class="tool-number">{{
              String(index + 1).padStart(2, "0")
            }}</span
            ><span class="tool-symbol"><ToolIcon :kind="item.icon" /></span>
            <div>
              <h3>{{ item.label }}</h3>
              <p>{{ item.description }}. {{ item.formats }}.</p>
            </div>
            <span class="tool-location">In your browser</span
            ><ToolIcon kind="arrow"
          /></NuxtLink>
        </div>
        <div class="next-tools">
          <ToolIcon kind="file" />
          <p>
            <strong>Have another file headache?</strong> Tell us which formats
            and tools you would like to see next.
          </p>
          <a href="https://github.com/veryCrunchy/mpeg-v/issues"
            >Suggest a tool <span aria-hidden="true">↗</span></a
          >
        </div>
      </section>
      <section id="discord" class="discord-section shell">
        <div class="discord-copy">
          <ToolIcon />
          <h2>Stay in the<br />conversation.</h2>
          <p>
            MPEG-V started with a simple idea: make audio easier to share on
            Discord. Drop a file, get a video, keep talking.
          </p>
          <p>
            The next step is a file workspace right inside Discord. Convert an
            image or make a clip, then choose where to share it.
          </p>
          <NuxtLink class="button" to="/workspace"
            >Try the workspace <ToolIcon kind="arrow"
          /></NuxtLink>
        </div>
        <div class="command-guide">
          <div class="guide-heading">
            <span>Already in your server?</span><span class="status-dot" />
          </div>
          <ol>
            <li>
              <span>1</span>
              <div>
                <h3>Pick your audio</h3>
                <p>MP3, WAV, FLAC, AAC, M4A, OGG or Opus.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Give it a new format</h3>
                <p>
                  Use <code>/generate video</code> or right-click an attachment
                  and choose <strong>Apps → Generate Video</strong>.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Keep it to yourself, or share</h3>
                <p>
                  Choose a private reply when you only want the result for you.
                </p>
              </div>
            </li>
          </ol>
          <div class="guide-footer">
            <ToolIcon kind="audio" /> Same audio. Now with a play button.
          </div>
        </div>
      </section>
      <section class="faq-section shell section-space">
        <h2>A few useful details.</h2>
        <div class="faq-list">
          <details>
            <summary>Where do my files go?</summary>
            <p>
              All toolbox conversions run on your device, including audio and
              video. Files are only uploaded if you choose Share in Discord. The
              Discord bot processes attachments on the conversion service.
              Discord keeps uploaded files according to its own policies.
            </p>
          </details>
          <details>
            <summary>Do I need Discord?</summary>
            <p>
              No. Every browser tool works without an account. Connect inside
              the Discord Activity only when you want to share a result
              directly.
            </p>
          </details>
          <details>
            <summary>Can it handle every kind of file?</summary>
            <p>
              The toolbox covers common image, audio and video formats, PDF
              images and text, archive creation and extraction, text conversions
              and checksums. Each tool lists its limits. Protected files and
              some specialist formats are not supported.
            </p>
          </details>
          <details>
            <summary>Can I see the code?</summary>
            <p>
              The code is available on
              <a href="https://github.com/veryCrunchy/mpeg-v">GitHub</a>. You
              can follow development, report a problem or suggest a new tool
              there.
            </p>
          </details>
        </div>
      </section>
      <section class="closing shell">
        <h2>Less fuss.<br /><span>More file freedom.</span></h2>
        <NuxtLink class="button" to="/workspace"
          >Find your tool <ToolIcon kind="arrow"
        /></NuxtLink>
      </section>
    </main>
    <footer class="site-footer shell">
      <NuxtLink to="/" class="brand">MPEG-V.</NuxtLink
      ><span>Made for the files you share.</span>
      <div>
        <NuxtLink to="/privacy">File privacy</NuxtLink
        ><a href="https://github.com/veryCrunchy/mpeg-v">GitHub ↗</a>
      </div>
    </footer>
  </div>
</template>
