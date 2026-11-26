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
    const { auditPreparedInput, reviewPreparedGroups } = await import("./archive-local-input.mjs");
    const { task, root, entry, cursor, limit } = workerData ?? {};
    const work = { "audit-prepared": auditPreparedInput, "review-prepared": reviewPreparedGroups }[task];
    if (!work) throw Error("Unknown archive worker task");
    parentPort.postMessage({ result: work(root, entry, cursor, limit) });
  } catch (error) {
    parentPort.postMessage({ error: String(error?.message ?? error) });
  }
}
