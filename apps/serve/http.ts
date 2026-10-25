import { readLimited as readBounded } from "../web/utils/core/streams.ts";
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function readLimited(
  body: ReadableStream<Uint8Array>,
  limit: number,
  signal?: AbortSignal,
) {
  try {
    return await readBounded(body, limit, signal);
  } catch (error) {
    if (error instanceof RangeError) throw new HttpError(413, error.message);
    throw error;
  }
}

export async function readJson(req: Request) {
  if (!req.body) throw new HttpError(400, "A request body is required.");
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]);
  let bytes: Uint8Array;
  try {
    bytes = await readLimited(req.body, 16 * 1024, signal);
  } catch (error) {
    if (signal.aborted) throw new HttpError(408, "The request timed out.");
    throw error;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  return Response.json({
    error: error instanceof HttpError
      ? error.message
      : "The file could not be processed.",
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "5" } : {}),
    },
  });
}
