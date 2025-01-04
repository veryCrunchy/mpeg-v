# Build stage
FROM denoland/deno:alpine-2.1.4 AS build

WORKDIR /app

COPY . .

USER deno

EXPOSE 3000

CMD ["run","--allow-net","--allow-run","--allow-sys","--allow-env","main.ts"]