import { createClient } from "@supabase/supabase-js";
import { diagnosticPayload, type ScanSummary } from "./ocrHistory";

// This checkpoint records transport evidence only. It never determines payment eligibility.
// A later client resolution (phase 2) wins over this server checkpoint (phase 1).
export async function checkpointOcr(
  request: Request,
  run: (request: Request) => Promise<Response>,
) {
  const started = Date.now();
  const body = request.headers.get("content-type")?.includes("application/json")
    ? await request
        .clone()
        .json()
        .catch(() => null)
    : null;
  const history = body?.history as ScanSummary | undefined;
  const authorization = request.headers.get("authorization");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const client =
    authorization &&
    url &&
    key &&
    history &&
    uuid.test(history.attemptId) &&
    uuid.test(body?.businessId ?? "")
      ? createClient(url, key, {
          global: {
            headers: { Authorization: authorization },
            fetch: (input, init) =>
              fetch(input, { ...init, signal: AbortSignal.timeout(3000) }),
          },
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  const persistenceFailures: Array<{attemptId:string;stage:string;code:string;message:string}> = [];
  async function checkpoint(payload: unknown, reason: string) {
    if (!client || !history) return false;
    try {
      const summary = {
        ...history,
        result: "processing",
        durationMs: Date.now() - started,
        paymentCanApply: false,
        reasons: [reason],
      };
      const { error } = await client.rpc("trimax_save_ocr_attempt", {
        p_business: body.businessId,
        p_id: history.attemptId,
        p_original: history.originalId,
        p_parent: history.parentId,
        p_phase: 1,
        p_summary: summary,
        p_payload: diagnosticPayload(payload),
      });
      if (error) throw error;
      return true;
    } catch (error) {
      const detail=error as {code?:string;message?:string};
      const failure={attemptId:history.attemptId,stage:"server-checkpoint",code:detail?.code||"transport-or-abort",message:detail?.message||String(error)};
      persistenceFailures.push(failure);
      console.error("OCR history checkpoint failed",failure);
      return false;
    }
  }
  try {
    const response = await run(request);
    if (client) {
      const result = await response
        .clone()
        .json()
        .catch(() => ({ error: "Response was not JSON" }));
      const { optical, ...responseEvidence } = result;
      // Commit the OCR result before reading or uploading multi-megabyte optical data.
      // A failed optional image write can no longer roll back the completed response.
      const corePayload={...body.debugContext,response:responseEvidence,stage:"server-extraction",httpStatus:response.status};
      let persisted=await checkpoint(corePayload,"OCR response retained; client review completion not yet confirmed.");
      if(!persisted) persisted=await checkpoint({...corePayload,persistenceFailures},"OCR response retained after checkpoint retry.");
      if(!persisted) await checkpoint({...body.debugContext,stage:"server-persistence-failed",persistenceFailures},"Server OCR completed but response persistence failed; inspect runtime diagnostics.");
      let retainedOptical;
      if (persisted && optical?.images?.length) {
        try {
          const { data, error } = await client
            .from("ocr_attempt_optical")
            .select("evidence")
            .eq("attempt_id", history!.attemptId)
            .maybeSingle();
          // A diagnostic read failure must neither fail OCR nor overwrite earlier capture evidence.
          if (!error)
            retainedOptical = {
              ...data?.evidence,
              images: [...(data?.evidence?.images ?? []), ...optical.images],
              notes: [
                ...(data?.evidence?.notes ?? []),
                ...(optical.notes ?? []),
              ],
            };
        } catch {
          console.warn(
            "Earlier optical evidence unavailable; client will retain completed optical evidence.",
          );
        }
      }
      if (persisted && retainedOptical) { const imageSaved = await checkpoint(
        {
          ...body.debugContext,
          ...(retainedOptical ? { optical: retainedOptical } : {}),
          response: responseEvidence,
          stage: "server-extraction",
          httpStatus: response.status,
        },
        "OCR response retained; client review completion not yet confirmed.",
      );
      if (!imageSaved) await checkpoint({...corePayload,persistenceFailures},"OCR response retained; optional optical checkpoint failed.");
      }
    }
    return response;
  } catch (error) {
    await checkpoint(
      {
        error: error instanceof Error ? error.message : "OCR request failed",
        stage: "server-extraction",
      },
      "OCR request failed before client review.",
    );
    throw error;
  }
}
