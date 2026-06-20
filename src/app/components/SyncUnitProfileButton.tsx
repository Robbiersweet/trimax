"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "./Button";
import { supabase } from "../lib/supabase";

type ConfirmedUnit = {
  building_letter: string;
  unit_number: number;
  unit_label: string;
  floor: string;
  floorplan: string;
};

type SyncUnitProfileButtonProps = {
  businessId: string;
  propertyId: string;
  unit: ConfirmedUnit;
};

export default function SyncUnitProfileButton({
  businessId,
  propertyId,
  unit,
}: SyncUnitProfileButtonProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const { error: saveError } = await supabase
      .from("property_units")
      .upsert(
        {
          business_id: businessId,
          property_id: propertyId,
          building_letter: unit.building_letter,
          unit_number: unit.unit_number,
          unit_label: unit.unit_label,
          floor: unit.floor,
          floorplan: unit.floorplan,
        },
        {
          onConflict: "property_id,unit_label",
        }
      );

    if (saveError) {
      setError(
        "Trimax could not save this profile yet. Open Property Intelligence and run the full unit sync."
      );
      setIsSaving(false);
      return;
    }

    setMessage("Profile saved. Refreshing this queue item...");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
      <Button onClick={handleSync} disabled={isSaving} className="px-4 py-2">
        {isSaving ? "Saving..." : "Save Profile"}
      </Button>
      {message ? (
        <p className="text-xs font-black text-emerald-100">{message}</p>
      ) : null}
      {error ? (
        <p className="max-w-xs text-xs font-black text-rose-100">{error}</p>
      ) : null}
    </div>
  );
}
