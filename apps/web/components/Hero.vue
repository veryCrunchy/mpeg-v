<template>
  <div class="flex items-center justify-between p-6 bg-discord">
    <div class="max-w-xl space-y-4 my-auto">
      <h1 class="text-4xl font-extrabold text-primary tracking-tight sm:text-5xl">
        Turn audio to video for phonekind
      </h1>
      <div class="flex gap-x-2">
        <button class="bg-primary/90 hover:bg-primary/80 transition-all text-white px-4 py-2 rounded-lg mt-4 font-semibold">Invite to Server</button>
      </div>
    </div>
    <div class="card w-2/5" ref="card" @mousemove="move" @mouseleave="leave">
      <img src="/discord_preview.webp" alt="Discord Preview" class="rounded-lg shadow-lg" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'Hero',
  data() {
    return {
      debounce: null,
    };
  },
  methods: {
    leave() {
      console.log("leave", event);
      const card = this.$refs.card;
      card.style.transform = `perspective(500px) scale(1)`;
    },
    move(event) {
      console.log("move", event);
      const card = this.$refs.card;

      const relX = (event.offsetX + 1) / card.offsetWidth;
      const relY = (event.offsetY + 1) / card.offsetHeight;
      const rotY = `rotateY(${(relX - 0.5) * 60}deg)`;
      const rotX = `rotateX(${(relY - 0.5) * -60}deg)`;
      card.style.transform = `perspective(500px) scale(1.05) ${rotY} ${rotX}`;
    },
    scale(val, inMin, inMax, outMin, outMax) {
      return outMin + (val - inMin) * (outMax - outMin) / (inMax - inMin);
    }
  }
}
</script>

<style scoped>
.card {
  position: relative;
  transition: transform 0.3s, box-shadow 0.3s;
}
.reflection {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
}
</style>