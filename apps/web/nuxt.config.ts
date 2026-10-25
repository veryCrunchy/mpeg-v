export default defineNuxtConfig({
  srcDir: ".",
  devtools: { enabled: false },
  typescript: { tsConfig: { exclude: ["../public/vendor/**"] } },
  routeRules: {
    "/vendor/**": {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    discordClientSecret: "",
    conversionUrl: "",
    conversionToken: "",
    preferencesUrl: "",
    preferencesToken: "",
    public: { discordClientId: "", discordInstallUrl: "" },
  },
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "MPEG-V | Make your files fit",
      meta: [
        {
          name: "description",
          content:
            "Convert media, render and split PDFs, extract archives, transform text and check files on your device. No account or conversion upload required.",
        },
        { name: "theme-color", content: "#171919" },
      ],
      link: [{ rel: "icon", type: "image/svg+xml", href: "/mark.svg" }],
    },
  },
  compatibilityDate: "2025-01-01",
});
