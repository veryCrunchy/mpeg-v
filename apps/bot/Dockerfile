FROM denoland/deno:2.7.7

WORKDIR /app
COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/bot ./apps/bot

EXPOSE 3000
WORKDIR /app/apps/bot
RUN deno cache --allow-sys --allow-net --allow-read --allow-env --allow-ffi main.ts
CMD ["run","--allow-sys","--allow-net","--allow-read","--allow-write","--allow-env","--allow-ffi","main.ts"]
