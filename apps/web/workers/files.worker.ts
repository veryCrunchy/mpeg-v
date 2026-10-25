import { processFileJob, type DocumentJob } from "../utils/documents";
self.onmessage = async (event: MessageEvent<DocumentJob>) => {
  try {
    const result = await processFileJob(event.data);
    self.postMessage(
      { result },
      { transfer: result.map((file) => file.bytes.buffer as ArrayBuffer) },
    );
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The files could not be processed.",
    });
  }
};
