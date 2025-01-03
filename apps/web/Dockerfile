# Build stage
FROM denoland/deno:alpine-2.1.4 AS build

WORKDIR /app

COPY deno.json deno.template.json
RUN sed '2i "nodeModulesDir": "auto",' deno.template.json > deno.json
RUN deno install
RUN deno task postinstall

COPY . .

RUN deno task build

# Runtime stage
FROM denoland/deno:alpine-2.1.4

WORKDIR /app

COPY --from=build /app /app

USER deno

EXPOSE 3000

CMD ["run","--allow-net","--allow-read","--allow-env",".output/server/index.mjs"]
