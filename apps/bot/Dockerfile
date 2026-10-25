FROM denoland/deno:2.7.7

WORKDIR /app
COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/bot ./apps/bot
COPY apps/web/utils/core/streams.ts ./apps/web/utils/core/streams.ts
COPY apps/web/utils/core/audioVideo.ts ./apps/web/utils/core/audioVideo.ts

EXPOSE 3000
WORKDIR /app/apps/bot
CMD ["run","--allow-sys","--allow-net","--allow-read","--allow-write","--allow-env","--allow-ffi","main.ts"]
