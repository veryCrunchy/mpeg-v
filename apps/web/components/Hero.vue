<template>
  <div class="flex items-center justify-between p-6 bg-discord">
    <div class="max-w-xl space-y-4 my-auto">
      <h1
        class="text-4xl font-extrabold text-primary tracking-tight sm:text-5xl"
      >
        Turn audio to video for phonekind
      </h1>
      <div class="flex gap-x-2">
        <button
          class="bg-primary/90 hover:bg-primary/80 transition-all text-white px-4 py-2 rounded-lg mt-4 font-semibold"
        >
          Invite to Server
        </button>
      </div>
    </div>
    <CardContainer>
      <CardBody class="p-10 h-min w-full">
        <CardItem :translate-z="50">
          <img
            src="/discord_preview.webp"
            alt="Discord Preview"
            class="rounded-lg shadow-lg"
          />
        </CardItem>
      </CardBody>
    </CardContainer>
  </div>
</template>

<script>
  export default {
    name: "Hero",
  };
</script>
