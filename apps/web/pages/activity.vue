<script setup lang="ts">
useHead({ title: "MPEG-V | File workspace" });
</script>
<template>
  <main id="main" class="activity-page">
    <ClientOnly
      ><FileWorkspace embedded /><template #fallback
        ><p class="loading-message" role="status">
          Opening your file workspace…
        </p></template
      ></ClientOnly
    >
  </main>
</template>
