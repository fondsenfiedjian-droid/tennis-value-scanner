import { runArchive } from "./archive-pipeline.mjs";

self.onmessage = async ({ data: id }) => {
  try {
    await runArchive(id, job => self.postMessage({ job }));
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error) });
  }
};
