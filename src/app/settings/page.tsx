"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
  split_warning_amount: number | string | null;
};

function formatCurrency(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "No default set";
  }

  return `$${amount.toFixed(2)}`;
}

function BusinessSettingsPageContent() {
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";

  const [business, setBusiness] =
    useState<Business | null>(null);

  const [splitWarningAmount, setSplitWarningAmount] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadBusiness() {
      setLoading(true);
      setToast(null);

      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("slug", businessSlug)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message:
            "Unable to load selected business.",
        });

        setLoading(false);
        return;
      }

      const selectedBusiness = data as Business;

      setBusiness(selectedBusiness);
      setSplitWarningAmount(
        selectedBusiness.split_warning_amount ===
          null ||
          selectedBusiness.split_warning_amount ===
            undefined
          ? ""
          : String(
              selectedBusiness.split_warning_amount
            )
      );

      setLoading(false);
    }

    loadBusiness();
  }, [businessSlug]);

  async function handleSave() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

    const trimmedAmount =
      splitWarningAmount.trim();

    const nextAmount =
      trimmedAmount === ""
        ? null
        : Number(trimmedAmount);

    if (
      nextAmount !== null &&
      (!Number.isFinite(nextAmount) ||
        nextAmount <= 0)
    ) {
      setToast({
        type: "error",
        message:
          "Enter a positive amount, or leave it blank to turn off the default warning.",
      });

      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("businesses")
      .update({
        split_warning_amount: nextAmount,
      })
      .eq("id", business.id)
      .select("*")
      .single();

    setSaving(false);

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to save business settings.",
      });

      return;
    }

    const updatedBusiness = data as Business;

    setBusiness(updatedBusiness);
    setSplitWarningAmount(
      updatedBusiness.split_warning_amount === null ||
        updatedBusiness.split_warning_amount ===
          undefined
        ? ""
        : String(
            updatedBusiness.split_warning_amount
          )
    );

    setToast({
      type: "success",
      message: "Business settings saved.",
    });
  }

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
            Trimax
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Settings
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage defaults for{" "}
            {business?.name ?? "this business"}.
          </p>
        </div>

        {loading ? (
          <Card>
            <p className="text-zinc-400">
              Loading settings...
            </p>
          </Card>
        ) : (
          <Card>
            <div className="grid gap-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                  Split Warning
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Default Split Warning Amount
                </h2>

                <p className="mt-2 max-w-3xl text-zinc-400">
                  This is the default amount Trimax
                  uses when a job has split warnings
                  turned on. Leave it blank for a
                  business that does not need split
                  warnings by default.
                </p>
              </div>

              <InputField
                label="Default Split Warning Amount"
                type="number"
                placeholder="Example: 1300"
                value={splitWarningAmount}
                onChange={setSplitWarningAmount}
              />

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <p className="text-sm text-zinc-400">
                  Current Default
                </p>

                <p className="mt-2 text-2xl font-semibold text-orange-400">
                  {formatCurrency(
                    splitWarningAmount
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave}>
                  {saving
                    ? "Saving..."
                    : "Save Settings"}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function BusinessSettingsPage() {
  return (
    <Suspense>
      <BusinessSettingsPageContent />
    </Suspense>
  );
}
