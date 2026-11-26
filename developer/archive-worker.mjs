import { runArchive } from "./archive-pipeline.mjs";

if (typeof self !== "undefined") {
  self.onmessage = async ({ data: id }) => {
    try {
      await runArchive(id, job => self.postMessage({ job }));
      self.postMessage({ done: true });
    } catch (error) {
      self.postMessage({ error: String(error?.message ?? error) });
    }
  };
} else {
  const { parentPort, workerData } = await import("node:worker_threads");
  if (!parentPort) throw Error("Archive worker must be started by Developer");
  try {
    if (workerData?.task !== "audit-prepared") throw Error("Unknown archive worker task");
    const { auditPreparedInput } = await import("./archive-local-input.mjs");
    parentPort.postMessage({ result: auditPreparedInput(workerData.root, workerData.entry) });
  } catch (error) {
    parentPort.postMessage({ error: String(error?.message ?? error) });
  }
}
