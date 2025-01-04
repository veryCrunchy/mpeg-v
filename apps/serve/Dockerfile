FROM denoland/deno:alpine-2.1.4

WORKDIR /app
COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/serve ./apps/serve

EXPOSE 3000

CMD ["run","--allow-net","--allow-run","--allow-sys","--allow-env","apps/serve/main.ts"]