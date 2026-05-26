"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type StatusFilter = "active" | "all" | "inactive";

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
  const [searchTerm, setSearchTerm] =
    useState("");
  const [categoryFilter, setCategoryFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("active");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setBusiness(null);
      setServices([]);
      resetForm();

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

  const categories = useMemo(() => {
    const uniqueCategories = new Set<string>();

    services.forEach((service) => {
      const serviceCategory =
        service.category?.trim();

      if (serviceCategory) {
        uniqueCategories.add(serviceCategory);
      }
    });

    return Array.from(uniqueCategories).sort(
      (first, second) =>
        first.localeCompare(second)
    );
  }, [services]);

  const categorySummaries = useMemo(
    () =>
      categories.map((serviceCategory) => ({
        name: serviceCategory,
        count: services.filter(
          (service) =>
            service.category === serviceCategory
        ).length,
      })),
    [categories, services]
  );

  const filteredServices = useMemo(() => {
    const normalizedSearch =
      searchTerm.trim().toLowerCase();

    return services.filter((service) => {
      const isActive = Boolean(service.is_active);

      if (
        statusFilter === "active" &&
        !isActive
      ) {
        return false;
      }

      if (
        statusFilter === "inactive" &&
        isActive
      ) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        (service.category || "") !== categoryFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        service.name,
        service.description,
        service.category,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        normalizedSearch
      );
    });
  }, [
    categoryFilter,
    searchTerm,
    services,
    statusFilter,
  ]);

  const activeCount = services.filter(
    (service) => service.is_active
  ).length;

  const autoCapturedCount = services.filter(
    (service) =>
      service.category === "Auto Captured"
  ).length;

  const categoryCount = categories.length;

  const inactiveCount =
    services.length - activeCount;

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

  function duplicateService(service: ServiceItem) {
    setEditingServiceId("");
    setName(`${service.name} Copy`);
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
    setToast({
      type: "success",
      message:
        "Service copied into the form. Rename it, then save.",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Active Services
            </p>

            <p className="mt-3 text-4xl font-black">
              {activeCount}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Ready for estimates and invoices.
            </p>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.25em] text-blue-300">
              Auto Captured
            </p>

            <p className="mt-3 text-4xl font-black">
              {autoCapturedCount}
            </p>

            <button
              type="button"
              onClick={() => {
                setCategoryFilter("Auto Captured");
                setStatusFilter("all");
              }}
              className="mt-3 text-sm font-semibold text-orange-400 transition hover:text-orange-300"
            >
              Review captured services
            </button>
          </Card>

          <Card>
            <p className="text-sm uppercase tracking-[0.25em] text-green-300">
              Categories
            </p>

            <p className="mt-3 text-4xl font-black">
              {categoryCount}
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Grouped service types.
            </p>
          </Card>
        </div>

        <Card>
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Service Library
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  {activeCount} active,{" "}
                  {inactiveCount} inactive,{" "}
                  {services.length} total.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "active",
                    "all",
                    "inactive",
                  ] as StatusFilter[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setStatusFilter(status)
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                      statusFilter === status
                        ? "bg-orange-500 text-black"
                        : "bg-zinc-800 text-zinc-300 hover:text-orange-400"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_260px]">
              <InputField
                label="Search Services"
                placeholder="Search name, description, or category"
                value={searchTerm}
                onChange={setSearchTerm}
              />

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Category
                </label>

                <select
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(
                      event.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  <option value="all">
                    All Categories
                  </option>

                  {categories.map(
                    (serviceCategory) => (
                      <option
                        key={serviceCategory}
                        value={serviceCategory}
                      >
                        {serviceCategory}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            {categorySummaries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCategoryFilter("all")
                  }
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    categoryFilter === "all"
                      ? "border-orange-500 bg-orange-500 text-black"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-orange-400 hover:text-orange-300"
                  }`}
                >
                  All categories
                </button>

                {categorySummaries.map(
                  (serviceCategory) => (
                    <button
                      key={serviceCategory.name}
                      type="button"
                      onClick={() =>
                        setCategoryFilter(
                          serviceCategory.name
                        )
                      }
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        categoryFilter ===
                        serviceCategory.name
                          ? "border-orange-500 bg-orange-500 text-black"
                          : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-orange-400 hover:text-orange-300"
                      }`}
                    >
                      {serviceCategory.name}{" "}
                      <span className="text-xs opacity-75">
                        {serviceCategory.count}
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
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
        ) : filteredServices.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No services match those filters.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredServices.map((service) => (
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
                        duplicateService(service)
                      }
                    >
                      Duplicate
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
