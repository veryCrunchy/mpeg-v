<script setup lang="ts">
const config = useRuntimeConfig();
const installUrl = computed(
  () =>
    config.public.discordInstallUrl ||
    (config.public.discordClientId
      ? `https://discord.com/oauth2/authorize?client_id=${config.public.discordClientId}&scope=bot%20applications.commands&permissions=34816`
      : ""),
);
</script>
<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header shell">
    <NuxtLink to="/" class="brand" aria-label="MPEG-V home"
      ><img src="/mark.svg" width="34" height="34" alt="" />MPEG-V<span
        class="brand-dot"
        >.</span
      ></NuxtLink
    >
    <nav aria-label="Main navigation">
      <NuxtLink to="/#tools">Tools</NuxtLink
      ><NuxtLink to="/#discord">Discord</NuxtLink
      ><a href="https://github.com/veryCrunchy/mpeg-v"
        >GitHub <span aria-hidden="true">↗</span></a
      >
    </nav>
    <a v-if="installUrl" :href="installUrl" class="button button-small"
      >Add to Discord <ToolIcon kind="arrow"
    /></a>
    <NuxtLink v-else to="/workspace" class="button button-small"
      >Open tools <ToolIcon kind="arrow"
    /></NuxtLink>
  </header>
</template>
