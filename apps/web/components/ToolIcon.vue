<script setup lang="ts">
defineProps<{ kind?: string }>();
</script>
<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="kind === 'audio'">
      <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />
    </template>
    <template v-else-if="kind === 'image'">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </template>
    <template v-else-if="kind === 'video'">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m10 8 6 4-6 4z" />
    </template>
    <template v-else-if="kind === 'archive'">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M10 3v3h4v3h-4v3h4v3h-4v3h4" />
    </template>
    <template v-else-if="kind === 'arrow'">
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </template>
    <template v-else-if="kind === 'file'">
      <path
        d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6M8 14h8m-8 3h5"
      />
    </template>
    <template v-else>
      <path d="M6 7c4-2 8-2 12 0l3 11-5 2-1-2H9l-1 2-5-2z" />
      <path d="M8 12v2m8-2v2" />
    </template>
  </svg>
</template>
