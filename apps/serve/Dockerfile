# FROM jrottenberg/ffmpeg:7.1-alpine AS ffmpeg

FROM denoland/deno:alpine-2.1.4

RUN apk update && apk upgrade && \
    apk add --no-cache ffmpeg ffmpeg-libs libgcc && \
    rm -f /usr/local/lib/libgcc_s.so.1 && \
    apk add --no-cache libgcc

WORKDIR /app

COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/serve ./apps/serve

EXPOSE 3000

CMD ["run","--allow-net","--allow-run","--allow-sys","--allow-read","--allow-env","apps/serve/main.ts"]