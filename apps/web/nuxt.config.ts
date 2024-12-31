export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ["@nuxtjs/tailwindcss", "@nuxt/fonts"],
  fonts: {
    google: {
      families: {
        "Montserrat": [400, 600, 700, 800],
      },
    },
  },
});
