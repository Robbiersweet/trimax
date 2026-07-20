"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { appendUnitHistoryForQueueItem } from "../lib/unitHistory";
import Button from "./Button";

type MarkCompletedButtonProps = {
  queueItemId: string;
  businessId?: string | null;
  businessSlug?: string | null;
  label?: string | null;
  returnToQueue?: boolean;
  unit?: string | null;
  property?: string | null;
  currentStatus?: string | null;
  hasActiveSession?: boolean;
  activeSessionHref?: string | null;
};

export default function MarkCompletedButton({
  queueItemId,
  businessId,
  businessSlug,
  label,
  returnToQueue = false,
  unit,
  property,
  currentStatus,
  hasActiveSession = false,
  activeSessionHref,
}: MarkCompletedButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const handleMarkCompleted = async () => {
    setErrorMessage("");

    if (hasActiveSession) {
      setIsConfirming(true);
      setErrorMessage("Finish the active Job Session before marking this job complete.");
      return;
    }

    setIsSaving(true);

    const today = new Date().toISOString().slice(0, 10);

    let error: unknown = null;

    try {
      await assertCanWriteDuringMaintenance(businessSlug);

      const { data: currentItem } = await supabase
        .from("queue_items")
        .select("status, completed_date, progress_stage, percent_complete")
        .eq("id", queueItemId)
        .maybeSingle();

      let result = await supabase
        .from("queue_items")
        .update({
          status: "Completed",
          completed_date: today,
          progress_stage: "Complete",
          percent_complete: 100,
        })
        .eq("id", queueItemId);
      error = result.error;

      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string" &&
        (error.message.includes("progress_stage") ||
          error.message.includes("percent_complete"))
      ) {
        result = await supabase
          .from("queue_items")
          .update({
            status: "Completed",
            completed_date: today,
          })
          .eq("id", queueItemId);
        error = result.error;
      }

      if (!error) {
        await logActivity({
          businessId,
          action: "queue_item.completed",
          entityType: "queue_item",
          entityId: queueItemId,
          entityLabel: label,
          details: {
            completedDate: today,
            previousCompletedDate: currentItem?.completed_date ?? null,
            previousStatus: currentItem?.status ?? null,
            newStatus: "Completed",
            changes: [
              {
                field: "completed_date",
                label: "Completed Date",
                previousValue: currentItem?.completed_date ?? null,
                newValue: today,
              },
              {
                field: "status",
                label: "Status",
                previousValue: currentItem?.status ?? null,
                newValue: "Completed",
              },
              {
                field: "progress_stage",
                label: "Progress",
                previousValue: currentItem?.progress_stage ?? null,
                newValue: "Complete",
              },
              {
                field: "percent_complete",
                label: "Percent Complete",
                previousValue: currentItem?.percent_complete ?? null,
                newValue: 100,
              },
            ].filter((change) => change.previousValue !== change.newValue),
          },
        });
      }
    } catch (caughtError) {
      error = caughtError;
    }

    if (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to mark this queue item completed. Refresh the page, then try again."
      );
      setIsSaving(false);

      return;
    }

    await appendUnitHistoryForQueueItem({
      queueItemId,
      businessId,
      eventType: "general_turn",
      eventDate: today,
    });

    setIsSaving(false);
    setIsConfirming(false);

    if (returnToQueue) {
      router.push(
        `/queue?business=${businessSlug ?? "rnl-creations"}&completed=1`
      );
      return;
    }

    router.refresh();
  };

  return (
    <div className="grid gap-2" data-job-completion-control="true">
      <Button
        onClick={() => setIsConfirming(true)}
        disabled={isSaving}
        className="w-full"
      >
        {isSaving ? "Saving..." : "Mark Job Complete"}
      </Button>

      {isConfirming ? (
        <div
          className="grid gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-50"
          role="dialog"
          aria-label="Confirm job completion"
        >
          <div className="grid gap-1">
            <p className="font-black text-white">Confirm job completion</p>
            <p>
              Unit {unit || "-"} / {property || "Property"} /{" "}
              {currentStatus || "Current status"}
            </p>
            <p>
              This will remove the item from the active Work Queue. History,
              notes, sessions, estimates, invoices, and payments stay saved.
            </p>
            {hasActiveSession ? (
              <p className="font-semibold text-amber-100">
                A Job Session is still running. Finish that session before
                marking the job complete.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsConfirming(false);
                setErrorMessage("");
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            {hasActiveSession ? (
              <Link href={activeSessionHref || "#job-session"}>
                <Button variant="secondary">Finish Session First</Button>
              </Link>
            ) : (
              <Button onClick={handleMarkCompleted} disabled={isSaving}>
                {isSaving ? "Saving..." : "Mark Job Complete"}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
