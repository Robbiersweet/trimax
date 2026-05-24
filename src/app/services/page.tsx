"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Card from "../components/Card";
import Button from "../components/Button";
import InputField from "../components/InputField";
import Toast from "../components/Toast";
import { supabase } from "../lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
};

type ServiceItem = {
  id: string;
  business_id: string | null;
  name: string;
  description: string | null;
  default_quantity: number | string | null;
  default_unit_price: number | string | null;
  category: string | null;
  is_active: boolean | null;
};

function formatCurrency(value: number | string | null) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function ServicesPageContent() {
  const searchParams = useSearchParams();

  const businessSlug =
    searchParams.get("business") ??
    "rnl-creations";

  const [business, setBusiness] =
    useState<Business | null>(null);

  const [services, setServices] = useState<
    ServiceItem[]
  >([]);

  const [editingServiceId, setEditingServiceId] =
    useState("");

  const [name, setName] = useState("");
  const [description, setDescription] =
    useState("");
  const [defaultQuantity, setDefaultQuantity] =
    useState("1");
  const [defaultUnitPrice, setDefaultUnitPrice] =
    useState("");
  const [category, setCategory] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);

      const { data: businessData, error } =
        await supabase
          .from("businesses")
          .select("*")
          .eq("slug", businessSlug)
          .single();

      if (error || !businessData) {
        console.error(error);

        setToast({
          type: "error",
          message:
            "Unable to load selected business.",
        });

        setLoading(false);
        return;
      }

      const selectedBusiness =
        businessData as Business;

      setBusiness(selectedBusiness);

      const { data: serviceData } =
        await supabase
          .from("service_items")
          .select("*")
          .eq("business_id", selectedBusiness.id)
          .order("is_active", {
            ascending: false,
          })
          .order("category", {
            ascending: true,
          })
          .order("name", {
            ascending: true,
          });

      setServices(
        (serviceData ?? []) as ServiceItem[]
      );

      setLoading(false);
    }

    loadData();
  }, [businessSlug]);

  async function reloadServices() {
    if (!business) {
      return;
    }

    const { data } = await supabase
      .from("service_items")
      .select("*")
      .eq("business_id", business.id)
      .order("is_active", {
        ascending: false,
      })
      .order("category", {
        ascending: true,
      })
      .order("name", {
        ascending: true,
      });

    setServices((data ?? []) as ServiceItem[]);
  }

  function resetForm() {
    setEditingServiceId("");
    setName("");
    setDescription("");
    setDefaultQuantity("1");
    setDefaultUnitPrice("");
    setCategory("");
  }

  function startEdit(service: ServiceItem) {
    setEditingServiceId(service.id);
    setName(service.name ?? "");
    setDescription(service.description ?? "");
    setDefaultQuantity(
      String(
        Number(service.default_quantity) || 1
      )
    );
    setDefaultUnitPrice(
      String(
        Number(service.default_unit_price) || 0
      )
    );
    setCategory(service.category ?? "");
  }

  async function handleSave() {
    setToast(null);

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

    if (!name || !defaultUnitPrice) {
      setToast({
        type: "error",
        message:
          "Service name and price are required.",
      });

      return;
    }

    setSaving(true);

    if (editingServiceId) {
      const { error } = await supabase
        .from("service_items")
        .update({
          name,
          description,
          default_quantity:
            Number(defaultQuantity) || 1,
          default_unit_price:
            Number(defaultUnitPrice) || 0,
          category,
        })
        .eq("id", editingServiceId);

      setSaving(false);

      if (error) {
        console.error(error);

        setToast({
          type: "error",
          message:
            "Unable to update service.",
        });

        return;
      }

      setToast({
        type: "success",
        message: "Service updated.",
      });

      resetForm();
      await reloadServices();
      return;
    }

    const { error } = await supabase
      .from("service_items")
      .insert({
        business_id: business.id,
        name,
        description,
        default_quantity:
          Number(defaultQuantity) || 1,
        default_unit_price:
          Number(defaultUnitPrice) || 0,
        category,
        is_active: true,
      });

    setSaving(false);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message: "Unable to create service.",
      });

      return;
    }

    setToast({
      type: "success",
      message: "Service created.",
    });

    resetForm();
    await reloadServices();
  }

  async function toggleActive(service: ServiceItem) {
    const { error } = await supabase
      .from("service_items")
      .update({
        is_active: !service.is_active,
      })
      .eq("id", service.id);

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to update service status.",
      });

      return;
    }

    await reloadServices();
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
            Services
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage saved line items for{" "}
            {business?.name ?? "this business"}.
          </p>
        </div>

        <Card>
          <div className="grid gap-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                {editingServiceId
                  ? "Edit Service"
                  : "New Service"}
              </h2>

              {editingServiceId && (
                <Button
                  variant="secondary"
                  onClick={resetForm}
                >
                  Cancel Edit
                </Button>
              )}
            </div>

            <InputField
              label="Service Name"
              placeholder="Example: Classic Paint"
              value={name}
              onChange={setName}
            />

            <InputField
              label="Description"
              placeholder="Example: Classic Paint"
              value={description}
              onChange={setDescription}
            />

            <div className="grid gap-5 md:grid-cols-3">
              <InputField
                label="Default Quantity"
                type="number"
                value={defaultQuantity}
                onChange={setDefaultQuantity}
              />

              <InputField
                label="Default Unit Price"
                type="number"
                value={defaultUnitPrice}
                onChange={setDefaultUnitPrice}
              />

              <InputField
                label="Category"
                placeholder="Example: Apartment Turns"
                value={category}
                onChange={setCategory}
              />
            </div>

            <Button onClick={handleSave}>
              {saving
                ? "Saving..."
                : editingServiceId
                  ? "Save Service"
                  : "Create Service"}
            </Button>
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="text-zinc-400">
              Loading services...
            </p>
          </Card>
        ) : services.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No services yet.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {services.map((service) => (
              <Card
                key={service.id}
                className={
                  service.is_active
                    ? ""
                    : "opacity-50"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-orange-400">
                      {service.category ||
                        "Uncategorized"}
                    </p>

                    <h2 className="mt-2 text-2xl font-semibold">
                      {service.name}
                    </h2>

                    <p className="mt-2 text-zinc-400">
                      {service.description ||
                        "No description."}
                    </p>

                    <p className="mt-3 text-sm text-zinc-500">
                      Qty{" "}
                      {Number(
                        service.default_quantity
                      ) || 1}{" "}
                      at{" "}
                      {formatCurrency(
                        service.default_unit_price
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        startEdit(service)
                      }
                    >
                      Edit
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() =>
                        toggleActive(service)
                      }
                    >
                      {service.is_active
                        ? "Deactivate"
                        : "Activate"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ServicesPage() {
  return (
    <Suspense>
      <ServicesPageContent />
    </Suspense>
  );
}