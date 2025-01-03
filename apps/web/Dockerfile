FROM denoland/deno:alpine-2.1.4

WORKDIR /app

# Switch to root user to perform installation
USER root

COPY deno.json deno.template.json
RUN sed '2i "nodeModulesDir": "auto",' deno.template.json > deno.json
RUN deno install

# Set DENO_DIR to a writable directory
ENV DENO_DIR=/app/.deno_dir

# Create the DENO_DIR directory and set permissions
RUN mkdir -p /app/.deno_dir && chown -R deno:deno /app/.deno_dir

USER deno

COPY . .
EXPOSE 3000

CMD ["run","--allow-net","--allow-read","--allow-env",".output/server/index.mjs"]
