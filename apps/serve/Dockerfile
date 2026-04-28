FROM jrottenberg/ffmpeg:4.4-scratch AS ffmpeg

FROM denoland/deno:2.7.7

COPY --from=ffmpeg /bin/ffmpeg /bin/ffprobe /usr/local/bin/
COPY --from=ffmpeg /lib /lib
COPY --from=ffmpeg /share /share

# RUN apk update && apk upgrade && \
#     apk add --no-cache ffmpeg ffmpeg-libs libgcc && \
#     rm -f /usr/local/lib/libgcc_s.so.1 && \
#     apk add --no-cache libgcc

WORKDIR /app

COPY apps/mpeg-v ./apps/mpeg-v 
COPY apps/serve ./apps/serve

EXPOSE 3000

CMD ["run","--allow-net","--allow-run","--allow-sys","--allow-read","--allow-env","apps/serve/main.ts"]
