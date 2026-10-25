import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createServer } from "node:http";
import { createApp, defineEventHandler, toNodeListener } from "h3";
import { fitDimensions, outputName } from "../utils/image";
import { verifyDiscordToken } from "../server/utils/discord";
import {
  mediaType,
  rateLimit,
  withUserJob,
  readBoundedBody,
} from "../server/utils/files";

test("gateway limits streamed uploads without Content-Length", async () => {
  const app = createApp();
  app.use(
    defineEventHandler(async (event) => ({
      size: (await readBoundedBody(event, 8)).length,
    })),
  );
  const server = createServer(toNodeListener(app));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(5));
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    });
    const response = await fetch(`http://127.0.0.1:${address.port}`, {
      method: "POST",
      body: source,
      duplex: "half",
      signal: AbortSignal.timeout(5000),
    } as RequestInit);
    assert.equal(response.status, 413);
    await response.text();
    const accepted = await fetch(`http://127.0.0.1:${address.port}`, {
      method: "POST",
      body: "valid",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { size: 5 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("resize preserves aspect ratio, never enlarges, and handles portrait images", () => {
  assert.deepEqual(fitDimensions(4000, 2000, 1280), {
    width: 1280,
    height: 640,
  });
  assert.deepEqual(fitDimensions(600, 900, 1280), { width: 600, height: 900 });
  assert.deepEqual(fitDimensions(2000, 4000, 800), { width: 400, height: 800 });
  assert.deepEqual(fitDimensions(4000, 2000, 0), { width: 4000, height: 2000 });
  assert.throws(() => fitDimensions(NaN, 100, 0));
});
test("output filenames remove control characters and path separators", () => {
  assert.equal(outputName("sample.photo.png", "webp"), "sample.photo.webp");
  assert.equal(outputName("dir\\name\n.jpg", "png"), "dir_name_.png");
});
test("Discord authorization rejects missing tokens and tokens from another app", async () => {
  await assert.rejects(() => verifyDiscordToken(undefined, "123"), {
    statusCode: 401,
  });
  const fetcher = (async () =>
    Response.json({
      application: { id: "other" },
      user: { id: "456" },
      scopes: ["identify"],
      expires: "2099-01-01",
    })) as typeof fetch;
  await assert.rejects(
    () => verifyDiscordToken("Bearer synthetic-token", "123", fetcher),
    { statusCode: 403 },
  );
});
test("Discord authorization checks scopes, expiration and server-verified identity", async () => {
  const authorization = "Bearer synthetic-token";
  for (const patch of [
    { scopes: [] },
    { expires: "2020-01-01" },
    { expires: "invalid" },
    { user: {} },
  ]) {
    const fetcher = (async () =>
      Response.json({
        application: { id: "123" },
        user: { id: "456" },
        scopes: ["identify"],
        expires: "2099-01-01",
        ...patch,
      })) as typeof fetch;
    await assert.rejects(
      () => verifyDiscordToken(authorization, "123", fetcher),
      { statusCode: 403 },
    );
  }
  const fetcher = (async () =>
    Response.json({
      application: { id: "123" },
      user: { id: "456" },
      scopes: ["identify"],
      expires: "2099-01-01",
    })) as typeof fetch;
  assert.deepEqual(await verifyDiscordToken(authorization, "123", fetcher), {
    id: "456",
    authorization,
  });
});
test("sharing validates file signatures instead of the supplied MIME type", () => {
  assert.equal(
    mediaType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(
    mediaType(new TextEncoder().encode("<script>not an image</script>")),
    undefined,
  );
  assert.equal(
    mediaType(new TextEncoder().encode("1234ftypisom")),
    "video/mp4",
  );
});
test("user admission rejects concurrent jobs and recovers after failure", async () => {
  let release!: () => void;
  const first = withUserJob(
    "synthetic-user",
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(() => withUserJob("synthetic-user", async () => {}), {
    statusCode: 429,
  });
  release();
  await first;
  await assert.rejects(() =>
    withUserJob("synthetic-user", async () => {
      throw new Error("test");
    }),
  );
  assert.equal(await withUserJob("synthetic-user", async () => true), true);
});
test("rate limits expire rather than retaining identities indefinitely", () => {
  rateLimit("synthetic-rate-test", 1, 1000);
  assert.throws(() => rateLimit("synthetic-rate-test", 1, 1001), {
    statusCode: 429,
  });
  assert.doesNotThrow(() => rateLimit("synthetic-rate-test", 1, 61001));
});
