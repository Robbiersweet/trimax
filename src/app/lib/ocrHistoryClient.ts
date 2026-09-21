import { safeDiagnosticView } from "./ocrDebug";
import { supabase } from "./supabase";
import {
  diagnosticPayload,
  type ScanWrite,
  type ScanRecord,
} from "./ocrHistory";
const DB = "trimax-ocr-outbox-v1",
  STORE = "attempts",
  PAYLOAD = "diagnostics";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      for (const name of [STORE, PAYLOAD])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = action(tx);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
type Queued = ScanWrite & { key: string; payloadBytes: number };
// This store contains metadata only. Listing the outbox never reads diagnostic blobs.
export async function pendingScans(businessId: string) {
  return (
    (await transaction([STORE], "readonly", (tx) =>
      tx.objectStore(STORE).getAll(),
    )) as Queued[]
  ).filter((write) => write.businessId === businessId);
}
async function localPayload(write: Queued) {
  if (Date.now() - Date.parse(write.summary.timestamp) > 30 * 86400000) {
    await transaction([PAYLOAD], "readwrite", (tx) =>
      tx.objectStore(PAYLOAD).delete(write.key),
    );
    return null;
  }
  return (
    (
      await transaction([PAYLOAD], "readonly", (tx) =>
        tx.objectStore(PAYLOAD).get(write.key),
      )
    )?.payload ?? null
  );
}
async function send(write: ScanWrite) {
  const { error } = await supabase.rpc("trimax_save_ocr_attempt", {
    p_business: write.businessId,
    p_id: write.summary.attemptId,
    p_original: write.summary.originalId,
    p_parent: write.summary.parentId,
    p_phase: write.phase,
    p_summary: write.summary,
    p_payload: write.payload,
  });
  if (error && write.phase===2) {
    // Terminal metadata must survive an oversized/invalid optional diagnostic payload.
    const {error:terminalError}=await supabase.rpc('trimax_save_ocr_attempt',{
      p_business:write.businessId,p_id:write.summary.attemptId,p_original:write.summary.originalId,p_parent:write.summary.parentId,p_phase:2,p_summary:write.summary,
      p_payload:{stage:'terminal-diagnostics-fallback',diagnosticPersistenceError:error.message,canonicalCapture:(write.payload as Record<string,unknown>|null)?.canonicalCapture,transport:(write.payload as Record<string,unknown>|null)?.transport,shadowHandoff:(write.payload as Record<string,unknown>|null)?.shadowHandoff,finishedAt:new Date().toISOString()}
    });
    if(terminalError)throw Error(terminalError.message);
  } else if (error) throw new Error(error.message);
}
let flushing = Promise.resolve();
export function flushScans(businessId: string) {
  const next = flushing
    .catch(() => {})
    .then(async () => {
      const writes = (await pendingScans(businessId)).sort(
        (a, b) =>
          a.summary.timestamp.localeCompare(b.summary.timestamp) ||
          a.phase - b.phase,
      );
      let failure: unknown = null;
      for (const write of writes) {
        try {
          await send({ ...write, payload: await localPayload(write) });
          await transaction([STORE, PAYLOAD], "readwrite", (tx) => {
            tx.objectStore(PAYLOAD).delete(write.key);
            return tx.objectStore(STORE).delete(write.key);
          });
        } catch (error) {
          failure = error;
        }
      }
      if (failure) throw failure;
    });
  flushing = next;
  return next;
}
export async function saveScan(write: ScanWrite): Promise<"saved" | "device"> {
  const payload =
    write.summary.result === "success"
      ? null
      : diagnosticPayload(write.payload);
  const key = `${write.businessId}:${write.summary.attemptId}:${write.phase}`;
  const metadata: Queued = {
    ...write,
    payload: null,
    key,
    payloadBytes: payload ? new Blob([JSON.stringify(payload)]).size : 0,
  };
  // Both stores commit atomically before attempting the network; reloads can resume the outbox.
  try {
    await transaction([STORE, PAYLOAD], "readwrite", (tx) => {
      if (payload) tx.objectStore(PAYLOAD).put({ key, payload });
      else tx.objectStore(PAYLOAD).delete(key);
      return tx.objectStore(STORE).put(metadata);
    });
  } catch {
    await send({ ...write, payload });
    return "saved";
  }
  try {
    await flushScans(write.businessId);
    return "saved";
  } catch {
    // An unrelated failed record must not hide this attempt's acknowledged save.
    return (await pendingScans(write.businessId)).some(
      (item) => item.key === key,
    )
      ? "device"
      : "saved";
  }
}
export async function recentScans(businessId: string, before?: string) {
  let query = supabase
    .from("ocr_attempts")
    .select(
      "id,created_at,original_id,parent_id,result,summary,pinned,diagnostics_expires_at,diagnostic_bytes",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScanRecord[];
}
export async function pairedScanSummary(id: string) {
  const {data,error}=await supabase.from('ocr_attempts').select('summary').eq('id',id).maybeSingle();
  if(error)throw Error('Paired scan unavailable');
  return data?.summary ?? null;
}
export async function scanDiagnostics(businessId: string, id: string) {
  const local = (await pendingScans(businessId).catch(() => []))
    .filter((write) => write.summary.attemptId === id && write.payloadBytes > 0)
    .sort((a, b) => b.phase - a.phase)[0];
  if (local) {
    const payload = await localPayload(local);
    if (payload) {
      const withoutImages = { ...payload };
      delete withoutImages.optical;
      return safeDiagnosticView(withoutImages);
    }
  }
  const { data, error } = await supabase
    .from("ocr_attempt_diagnostics")
    .select("payload")
    .eq("attempt_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data)
    throw new Error(
      "Full diagnostics have expired or were not retained. The scan summary remains available.",
    );
  return safeDiagnosticView(data.payload);
}
export async function pinScan(id: string, pinned: boolean) {
  const { error } = await supabase.rpc("trimax_pin_ocr_attempt", {
    p_id: id,
    p_pinned: pinned,
  });
  if (error) throw new Error(error.message);
}

export async function scanOptical(id: string) {
  const queued = (await transaction([STORE], "readonly", (tx) =>
    tx.objectStore(STORE).getAll(),
  ).catch(() => [])) as Queued[];
  const pending = queued
    .filter((w) => w.summary.attemptId === id)
    .sort((a, b) => b.phase - a.phase)[0];
  if (pending) {
    const p = await localPayload(pending);
    if (p?.optical) return p.optical;
  }
  const { data, error } = await supabase
    .from("ocr_attempt_optical")
    .select("evidence")
    .eq("attempt_id", id)
    .maybeSingle();
  if (error) throw Error(error.message);
  return data?.evidence ?? null;
}
