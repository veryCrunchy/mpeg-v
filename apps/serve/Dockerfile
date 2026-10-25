FROM denoland/deno:2.7.7
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY deno.json deno.lock ./
# Workspace manifests must be available when resolving the shared packages.
COPY apps/bot/deno.json ./apps/bot/deno.json
COPY apps/hooks/deno.json ./apps/hooks/deno.json
COPY apps/mpeg-v ./apps/mpeg-v
COPY apps/serve ./apps/serve
COPY apps/web/utils/core ./apps/web/utils/core
RUN deno cache apps/serve/main.ts apps/serve/fileJob.worker.ts
RUN mkdir -p /app/apps/serve/.data && chown deno:deno /app/apps/serve/.data
USER deno
EXPOSE 3000
CMD ["run", "--allow-net", "--allow-run=ffmpeg,ffprobe", "--allow-read", "--allow-write", "--allow-env", "apps/serve/main.ts"]
