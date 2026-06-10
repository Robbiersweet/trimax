"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
};

type PropertyRow = {
  id: string;
  name: string;
  address: string | null;
};

type PropertyUnitRow = {
  id: string;
  building_letter: string | null;
  unit_number: number | null;
  unit_label: string | null;
  floor: string | null;
  floorplan: string | null;
  notes: string | null;
};

const floorOptions = ["bottom", "top"];
const floorplanOptions = ["2x1", "2x2"];

const confirmedNBuildingUnits = [
  { building_letter: "N", unit_number: 1, unit_label: "N1", floor: "bottom", floorplan: "2x1" },
  { building_letter: "N", unit_number: 2, unit_label: "N2", floor: "top", floorplan: "2x1" },
  { building_letter: "N", unit_number: 3, unit_label: "N3", floor: "bottom", floorplan: "2x1" },
  { building_letter: "N", unit_number: 4, unit_label: "N4", floor: "top", floorplan: "2x1" },
  { building_letter: "N", unit_number: 5, unit_label: "N5", floor: "bottom", floorplan: "2x2" },
  { building_letter: "N", unit_number: 6, unit_label: "N6", floor: "top", floorplan: "2x2" },
  { building_letter: "N", unit_number: 7, unit_label: "N7", floor: "bottom", floorplan: "2x2" },
  { building_letter: "N", unit_number: 8, unit_label: "N8", floor: "top", floorplan: "2x2" },
];

function normalizeUnitLabel(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export default function PropertyIntelligencePage() {
  const searchParams = useSearchParams();
  const businessSlug = searchParams.get("business") ?? "rnl-creations";
  const [business, setBusiness] = useState<Business | null>(null);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [units, setUnits] = useState<PropertyUnitRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const filteredUnits = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    if (!normalizedFilter) {
      return units;
    }

    return units.filter((unit) =>
      [
        unit.building_letter,
        unit.unit_label,
        unit.floor,
        unit.floorplan,
        unit.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter)
    );
  }, [filter, units]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setToast(null);

    const { data: businessData, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .eq("slug", businessSlug)
      .limit(1)
      .maybeSingle();

    if (businessError || !businessData) {
      setToast({
        type: "error",
        message: "Selected workspace was not found.",
      });
      window.setTimeout(() => setIsLoading(false), 0);
      return;
    }

    const selectedBusiness = businessData as Business;
    setBusiness(selectedBusiness);

    const { data: propertyData, error: propertyError } = await supabase
      .from("properties")
      .select("id, name, address")
      .eq("business_id", selectedBusiness.id)
      .eq("name", "North Creek Apartments")
      .limit(1)
      .maybeSingle();

    if (propertyError) {
      setToast({
        type: "error",
        message:
          "Property intelligence tables are not ready yet. Run the SQL setup first.",
      });
      window.setTimeout(() => setIsLoading(false), 0);
      return;
    }

    const selectedProperty = propertyData as PropertyRow | null;
    setProperty(selectedProperty);

    if (!selectedProperty?.id) {
      setUnits([]);
      window.setTimeout(() => setIsLoading(false), 0);
      return;
    }

    const { data: unitData, error: unitError } = await supabase
      .from("property_units")
      .select("id, building_letter, unit_number, unit_label, floor, floorplan, notes")
      .eq("property_id", selectedProperty.id)
      .order("building_letter", { ascending: true })
      .order("unit_number", { ascending: true });

    if (unitError) {
      setToast({
        type: "error",
        message: "Unable to load North Creek units.",
      });
      window.setTimeout(() => setIsLoading(false), 0);
      return;
    }

    setUnits((unitData ?? []) as PropertyUnitRow[]);
    window.setTimeout(() => setIsLoading(false), 0);
  }, [businessSlug]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadData]);

  async function ensureNorthCreekProperty() {
    if (!business) {
      throw new Error("Workspace is still loading.");
    }

    const { data, error } = await supabase
      .from("properties")
      .upsert(
        {
          business_id: business.id,
          name: "North Creek Apartments",
          address: "11401 3rd Ave SE Everett, WA 98208",
        },
        {
          onConflict: "business_id,name",
        }
      )
      .select("id, name, address")
      .single();

    if (error || !data) {
      throw error ?? new Error("Unable to create North Creek property.");
    }

    setProperty(data as PropertyRow);
    return data as PropertyRow;
  }

  async function seedConfirmedNBuilding() {
    setIsSaving(true);
    setToast(null);

    try {
      if (!business) {
        throw new Error("Workspace is still loading.");
      }

      const propertyRow = property ?? (await ensureNorthCreekProperty());

      const { error } = await supabase.from("property_units").upsert(
        confirmedNBuildingUnits.map((unit) => ({
          business_id: business.id,
          property_id: propertyRow.id,
          building_letter: unit.building_letter,
          unit_number: unit.unit_number,
          unit_label: unit.unit_label,
          floor: unit.floor,
          floorplan: unit.floorplan,
          notes: "Seeded from confirmed North Creek N building rule.",
        })),
        {
          onConflict: "property_id,unit_label",
        }
      );

      if (error) {
        throw error;
      }

      setToast({
        type: "success",
        message: "Confirmed N building units were seeded.",
      });
      await loadData();
    } catch (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to seed North Creek units.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function updateUnit(unit: PropertyUnitRow) {
    setIsSaving(true);
    setToast(null);

    const { error } = await supabase
      .from("property_units")
      .update({
        building_letter: unit.building_letter?.trim().toUpperCase() || null,
        unit_number: unit.unit_number,
        unit_label: normalizeUnitLabel(unit.unit_label || ""),
        floor: unit.floor || null,
        floorplan: unit.floorplan || null,
        notes: unit.notes?.trim() || null,
      })
      .eq("id", unit.id);

    if (error) {
      setToast({
        type: "error",
        message: "Unable to save this unit.",
      });
      setIsSaving(false);
      return;
    }

    setToast({
      type: "success",
      message: `${unit.unit_label || "Unit"} saved.`,
    });
    setIsSaving(false);
    await loadData();
  }

  function patchUnit(id: string, patch: Partial<PropertyUnitRow>) {
    setUnits((currentUnits) =>
      currentUnits.map((unit) =>
        unit.id === id
          ? {
              ...unit,
              ...patch,
            }
          : unit
      )
    );
  }

  return (
    <AppShell>
      {toast ? <Toast type={toast.type} message={toast.message} /> : null}

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Property Intelligence
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              North Creek Unit Map
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              Store permanent unit facts here so queue requests can auto-fill
              floor, floorplan, and future property history.
            </p>
          </div>

          <Button onClick={seedConfirmedNBuilding} disabled={isSaving}>
            {isSaving ? "Saving..." : "Seed Confirmed N Building"}
          </Button>
        </div>

        <Card className="border-sky-500/30 bg-sky-500/10">
          <p className="font-semibold text-sky-100">
            Current safe seed: confirmed N building only.
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Trimax is ready for all A-Z buildings, but it will not guess from
            the image. Add or correct units here as the property map is
            confirmed.
          </p>
        </Card>

        <Card>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <InputField
              label="Search Units"
              placeholder="Example: N7, 2x2, bottom"
              value={filter}
              onChange={setFilter}
            />

            <p className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
              Showing {filteredUnits.length} of {units.length} units.
            </p>
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <p className="text-zinc-400">Loading property intelligence...</p>
          </Card>
        ) : !property ? (
          <Card>
            <p className="font-semibold">
              North Creek has not been seeded yet.
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Click Seed Confirmed N Building to create the property and its
              known N building units.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredUnits.map((unit) => (
              <Card key={unit.id}>
                <div className="grid gap-4 lg:grid-cols-[0.7fr_0.7fr_1fr_1fr_1.5fr_auto] lg:items-end">
                  <InputField
                    label="Building"
                    value={unit.building_letter || ""}
                    onChange={(value) =>
                      patchUnit(unit.id, {
                        building_letter: value,
                      })
                    }
                  />
                  <InputField
                    label="Unit"
                    value={unit.unit_label || ""}
                    onChange={(value) =>
                      patchUnit(unit.id, {
                        unit_label: value,
                      })
                    }
                  />
                  <InputField
                    label="Floor"
                    value={unit.floor || ""}
                    onChange={(value) =>
                      patchUnit(unit.id, {
                        floor: value,
                      })
                    }
                    options={floorOptions}
                  />
                  <InputField
                    label="Floorplan"
                    value={unit.floorplan || ""}
                    onChange={(value) =>
                      patchUnit(unit.id, {
                        floorplan: value,
                      })
                    }
                    options={floorplanOptions}
                  />
                  <InputField
                    label="Notes"
                    value={unit.notes || ""}
                    onChange={(value) =>
                      patchUnit(unit.id, {
                        notes: value,
                      })
                    }
                  />
                  <Button
                    onClick={() => updateUnit(unit)}
                    variant="secondary"
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
