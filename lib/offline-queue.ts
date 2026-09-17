/**
 * Durable outbox for reports filed with no usable network.
 *
 * A dropped emergency report is the worst failure this app can have, so a
 * failed insert is written to IndexedDB and retried when connectivity returns.
 * Raw IndexedDB keeps this dependency-free and works in every target browser
 * including iOS Safari in standalone mode.
 */

const DB_NAME = "aegis";
const DB_VERSION = 1;
const STORE = "pending-reports";

export interface PendingReport {
  /** Client-generated so the UI can key on it before the server sees it. */
  localId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

function supported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function newLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueue(payload: Record<string, unknown>): Promise<PendingReport | null> {
  if (!supported()) return null;
  const entry: PendingReport = {
    localId: newLocalId(),
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  try {
    await tx("readwrite", (store) => store.put(entry));
    await requestSync();
    return entry;
  } catch {
    return null;
  }
}

export async function listPending(): Promise<PendingReport[]> {
  if (!supported()) return [];
  try {
    const all = await tx<PendingReport[]>("readonly", (store) =>
      store.getAll() as IDBRequest<PendingReport[]>,
    );
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function remove(localId: string): Promise<void> {
  if (!supported()) return;
  try {
    await tx("readwrite", (store) => store.delete(localId) as IDBRequest<undefined>);
  } catch {
    /* ignore */
  }
}

async function markAttempt(entry: PendingReport, error: string) {
  try {
    await tx("readwrite", (store) =>
      store.put({ ...entry, attempts: entry.attempts + 1, lastError: error }),
    );
  } catch {
    /* ignore */
  }
}

export interface FlushResult {
  sent: string[];
  failed: number;
}

/**
 * Attempts to submit every queued report. Returns the ids that made it, so the
 * caller can record them as real incidents the user can follow.
 */
export async function flush(): Promise<FlushResult> {
  const pending = await listPending();
  const sent: string[] = [];
  let failed = 0;

  for (const entry of pending) {
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const body = (await res.json()) as { id?: string };
      await remove(entry.localId);
      if (body.id) sent.push(body.id);
    } catch (err) {
      failed += 1;
      await markAttempt(
        entry,
        err instanceof Error ? err.message : "send failed",
      );
    }
  }

  return { sent, failed };
}

/** Asks the service worker to retry in the background, where supported. */
async function requestSync() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    // Absent on iOS Safari; the online listener covers that case.
    await sync?.register("aegis-sync-reports");
  } catch {
    /* ignore */
  }
}
