type WorkerRequestType =
  | "loadNotes"
  | "saveNote"
  | "bulkSaveNotes"
  | "deleteNote"
  | "searchNotes"
  | "listBacklinks";

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const TIMEOUT_MS = 5000;
let sqliteWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

export type SqliteWorkerRequestType = WorkerRequestType;

export function callWorker<T>(type: SqliteWorkerRequestType, payload?: unknown): Promise<T> {
  const worker = ensureWorker();
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(id);
      try {
        worker.postMessage({ id, type: "cancelRequest", payload: { targetId: id } });
      } catch (postError) {
        console.warn("Failed to notify SQLite worker about cancellation", postError);
      }
      reject(new Error("SQLite worker timed out"));
    }, TIMEOUT_MS);
    pendingRequests.set(id, {
      resolve: (value: unknown) => {
        window.clearTimeout(timeoutId);
        resolve(value as T);
      },
      reject: (reason) => {
        window.clearTimeout(timeoutId);
        reject(reason);
      },
    });
    try {
      worker.postMessage({ id, type, payload });
    } catch (error) {
      pendingRequests.delete(id);
      reject(error);
    }
  });
}

function ensureWorker(): Worker {
  if (!sqliteWorker) {
    const workerUrl = new URL(
      `${import.meta.env.BASE_URL ?? "/"}sqlite-opfs-worker.js`,
      window.location.origin,
    );
    sqliteWorker = new Worker(workerUrl);
    sqliteWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (!message || typeof message.id !== "number") {
        return;
      }
      const entry = pendingRequests.get(message.id);
      if (!entry) {
        return;
      }
      pendingRequests.delete(message.id);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(message.error));
      }
    };
    sqliteWorker.onerror = (event: ErrorEvent) => {
      const error = new Error(event.message || "Unknown SQLite worker error");
      for (const [, entry] of pendingRequests) {
        entry.reject(error);
      }
      pendingRequests.clear();
      sqliteWorker?.terminate();
      sqliteWorker = null;
    };
  }
  return sqliteWorker;
}
