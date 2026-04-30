FROM denoland/deno:2.7.7

WORKDIR /app
COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/bot ./apps/bot

EXPOSE 3000
WORKDIR /app/apps/bot
CMD ["run","--allow-sys","--allow-net","--allow-read","--allow-write","--allow-env","--allow-ffi","main.ts"]
