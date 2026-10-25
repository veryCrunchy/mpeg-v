<script setup lang="ts">
import { resolveAudioVideo, type AudioVideoSettings, type PreferenceRecord } from "~/utils/core/audioVideo";
interface SavedPreferences { personal: PreferenceRecord; server: PreferenceRecord | null; canManageServer: boolean; effective: AudioVideoSettings }
const model = defineModel<AudioVideoSettings>({ required: true });
const props = defineProps<{ connected: boolean; disabled: boolean; guildId: string; request: (method?: string, body?: unknown) => Promise<SavedPreferences> }>();
const target = ref<"device" | "user" | "guild">("device"), pending = ref(false), notice = ref(""), failure = ref("");
const saved = shallowRef<SavedPreferences>();
const storageKey = "mpeg-v.audio-video.v1";
let alive = true;
let connectionVersion = 0;
onBeforeUnmount(() => { alive = false; });
function deviceSettings() {
  const raw = localStorage.getItem(storageKey);
  return resolveAudioVideo(raw ? JSON.parse(raw) : undefined);
}
function useSaved() {
  failure.value = ""; notice.value = "";
  try {
    if (target.value === "device") model.value = deviceSettings();
    else if (saved.value) model.value = target.value === "guild" ? resolveAudioVideo(saved.value.server?.values) : resolveAudioVideo(saved.value.server?.values, saved.value.personal.values);
  } catch { failure.value = "Saved device settings could not be read. Reset them to start fresh."; }
}
async function reload() {
  if (!props.connected || pending.value) return;
  pending.value = true; failure.value = "";
  const version = connectionVersion;
  try { const value = await props.request(); if (alive && version === connectionVersion && props.connected) { saved.value = value; if (target.value !== "device") useSaved(); } }
  catch (error) { if (alive) failure.value = (error as Error).message; }
  finally { if (alive) pending.value = false; }
}
async function persist(reset = false) {
  failure.value = ""; notice.value = "";
  if (pending.value || props.disabled) return;
  pending.value = true;
  const version = connectionVersion;
  try {
    if (target.value === "device") {
      if (reset) { localStorage.removeItem(storageKey); model.value = resolveAudioVideo(); }
      else localStorage.setItem(storageKey, JSON.stringify(resolveAudioVideo(model.value)));
    } else {
      if (!saved.value) throw new Error("Reload saved settings before making changes.");
      const record = target.value === "user" ? saved.value.personal : saved.value.server;
      const result = await props.request(reset ? "DELETE" : "PATCH", { scope: target.value, revision: record?.revision ?? null, changes: model.value });
      if (!alive || version !== connectionVersion || !props.connected) return;
      saved.value = result;
      useSaved();
    }
    notice.value = reset ? "Saved overrides cleared." : target.value === "device" ? "Saved on this device." : target.value === "user" ? "Your Discord defaults are saved." : "Server defaults are saved.";
  } catch (error) { if (alive) failure.value = (error as Error).message; }
  finally { if (alive) pending.value = false; }
}
onMounted(() => { useSaved(); if (props.connected) { target.value = "user"; void reload(); } });
watch(() => props.connected, connected => { connectionVersion++; saved.value = undefined; target.value = connected ? "user" : "device"; if (connected) void reload(); else useSaved(); });
watch(target, useSaved);
const bars = [12, 19, 28, 45, 65, 82, 72, 57, 74, 90, 70, 49, 36, 29, 18, 13];
const wave = Array.from({ length: 81 }, (_, index) => [index * 5, 60 + Math.sin(index * 0.72) * Math.sin(index / 80 * Math.PI) * 42]);
const wavePoints = wave.map(([x,y]) => `${x},${y}`).join(" ");
</script>
<template>
  <section class="audio-style-panel" aria-label="Audio-to-video appearance">
    <div class="style-heading"><h3>Make it yours</h3><span>Audio to video</span></div>
    <svg class="style-preview" viewBox="0 0 400 120" role="img" aria-label="Visualization style preview" :style="{ background: model.background, color: model.color }">
      <template v-if="model.visualization === 'bars'"><rect v-for="(height,index) in bars" :key="index" :x="index * 24 + 10" :y="108-height" width="15" :height="height" rx="2" fill="currentColor" /></template>
      <template v-else-if="model.visualization === 'dots'"><circle v-for="([x,y],index) in wave" :key="index" :cx="x" :cy="y" r="2" fill="currentColor" /></template>
      <polygon v-else-if="model.visualization === 'filled'" :points="`0,60 ${wavePoints} 400,60`" fill="currentColor" />
      <polyline v-else :points="wavePoints" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    <fieldset class="image-settings" :disabled="disabled || pending">
      <legend class="sr-only">Visualization settings</legend>
      <label>Visualization<select v-model="model.visualization"><option value="wave">Waveform</option><option value="filled">Filled wave</option><option value="dots">Dots</option><option value="bars">Frequency bars</option></select></label>
      <label>Foreground color<input v-model="model.color" type="color" /></label>
      <label>Background color<input v-model="model.background" type="color" /></label>
      <label>Video size<select v-model="model.size"><option value="compact">Compact · 250 × 100</option><option value="standard">Standard · 500 × 200</option><option value="wide">Wide · 960 × 360</option></select></label>
      <label>Frame rate<select v-model.number="model.fps"><option :value="15">15 fps</option><option :value="24">24 fps</option><option :value="30">30 fps</option></select></label>
      <label>Audio quality<select v-model.number="model.bitrate"><option :value="64">64 kbps</option><option :value="128">128 kbps</option><option :value="192">192 kbps</option><option :value="256">256 kbps</option></select></label>
    </fieldset>
    <div class="preference-controls">
      <label>Save defaults for<select v-model="target" :disabled="disabled || pending"><option value="device">This device</option><option v-if="connected" value="user">My Discord account</option><option v-if="connected && guildId" value="guild" :disabled="!saved?.canManageServer">This server</option></select></label>
      <button class="button button-secondary button-small" :disabled="disabled || pending || (target !== 'device' && !saved)" @click="persist()">{{ pending ? "Please wait…" : "Save defaults" }}</button>
      <button class="text-button" :disabled="disabled || pending || (target !== 'device' && !saved)" @click="persist(true)">Reset saved defaults</button>
      <button v-if="connected" class="text-button" :disabled="disabled || pending" @click="reload">Reload saved</button>
    </div>
    <p class="setting-note">Changes apply to this conversion. Saving remembers all options shown. Personal defaults override server defaults; reset them to inherit.</p>
    <p v-if="!connected" class="setting-note">Device defaults stay in this browser. Connect inside Discord to save personal or server defaults.</p>
    <p v-if="connected && guildId && saved && !saved.canManageServer" class="setting-note">Changing server defaults requires Manage Server permission.</p>
    <p v-if="notice" class="setting-note" role="status">{{ notice }}</p>
    <p v-if="failure" class="error-message" role="alert">{{ failure }}</p>
  </section>
</template>
