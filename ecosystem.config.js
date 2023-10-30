//pm2 configs
module.exports = {
  apps: [
    {
      name: "MPEG-V2",
      script: "dist/index.js",
      watch: true,
      watch_delay: 6000,
      log_date_format: "YYYY-MM-DD HH:mm Z",
      ignore_watch: ["node_modules", "assets"],
    },
  ],
};
