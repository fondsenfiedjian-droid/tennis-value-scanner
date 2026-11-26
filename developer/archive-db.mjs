// Use the physical name of the v2 database in both the window and the Worker.
const DB_NAME = "tvs-developer:tvs-developer-historical-archives";

export function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openArchiveDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      const create = (name, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return req.transaction.objectStore(name);
        const store = db.createObjectStore(name, { keyPath: "id" });
        for (const [key, options] of indexes) store.createIndex(key, key, options);
        return store;
      };
      create("archives", [["sha256", { unique: true }], ["importedAt"]]);
      create("operations", [["createdAt"]]);
      const matches = create("normalizedMatches", [["archiveId"], ["reviewStatus"]]);
      matches.createIndex("naturalKey", "naturalKey");
      matches.createIndex("sourceKey", "sourceKey");
      create("duplicateRegistry", [["archiveId"], ["reviewStatus"]]);
      create("archiveJobs");
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Закройте другие вкладки Developer Edition для обновления архива."));
  });
}

export async function transaction(db, stores, mode, work) {
  const tx = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error ?? new Error("Транзакция архива отменена."));
  });
  try {
    const value = await work(tx);
    await done;
    return value;
  } catch (error) {
    try { tx.abort(); } catch { /* Already settled. */ }
    await done.catch(() => {});
    throw error;
  }
}

export async function sha256(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
