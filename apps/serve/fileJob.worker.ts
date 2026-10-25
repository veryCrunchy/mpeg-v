import {
  type DocumentJob,
  processFileJob,
} from "../web/utils/core/documents.ts";
import { extractZip } from "../web/utils/core/archives.ts";
import type { DocumentFile } from "../web/utils/core/documents.ts";
const worker = self as unknown as Pick<Worker, "onmessage" | "postMessage">;
worker.onmessage = async (
  { data }: MessageEvent<
    { job: DocumentJob; archiveMode?: string; entry?: string }
  >,
) => {
  try {
    let result: DocumentFile[];
    if (data.archiveMode === "list" || data.archiveMode === "extract") {
      const entries = extractZip(data.job.files[0]!.bytes);
      if (data.archiveMode === "list") {
        result = [{
          name: "archive-contents.txt",
          type: "text/plain",
          bytes: new TextEncoder().encode(
            entries.map((file) => `${file.name}\t${file.bytes.length} bytes`)
              .join("\n"),
          ),
        }];
      } else {
        const selected = data.entry
          ? entries.find((file) => file.name === data.entry)
          : entries.length === 1
          ? entries[0]
          : undefined;
        if (!selected) {
          throw new Error(
            "Use /file archive with action:list, then set entry to the exact filename to extract.",
          );
        }
        result = [selected];
      }
    } else result = await processFileJob(data.job);
    worker.postMessage({ result }, {
      transfer: result.map((file) => file.bytes.buffer as ArrayBuffer),
    });
  } catch (error) {
    worker.postMessage({
      error: error instanceof Error
        ? error.message
        : "Could not process these files.",
    });
  }
};
