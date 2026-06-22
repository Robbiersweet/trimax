"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
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
  easy_unit_price?: number | string | null;
  normal_unit_price?: number | string | null;
  difficult_unit_price?: number | string | null;
  category: string | null;
  is_active: boolean | null;
};

type StatusFilter = "active" | "all" | "inactive";
type ServiceFocusFilter =
  | "all"
  | "quote-ready"
  | "needs-category"
  | "needs-detail"
  | "needs-price"
  | "auto-captured"
  | "possible-duplicates";
type ServiceSortMode =
  | "category"
  | "name"
  | "readiness"
  | "price-high"
  | "price-low"
  | "inactive-first";

type ServiceStarter = {
  name: string;
  description: string;
  category: string;
  defaultQuantity: string;
  defaultUnitPrice: string;
  tone: string;
};

function formatCurrency(value: number | string | null) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

function isMissingTierColumnError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("easy_unit_price") ||
      error?.message?.includes("normal_unit_price") ||
      error?.message?.includes("difficult_unit_price")
  );
}

function isQuoteReady(service: ServiceItem) {
  return (
    Boolean(service.category?.trim()) &&
    Boolean(service.description?.trim()) &&
    (Number(service.default_unit_price) || 0) > 0
  );
}

function normalizeServiceName(value: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(copy|duplicate|dup)\b/g, "")
    .trim();
}

function serviceMatchesFocus(
  service: ServiceItem,
  focus: ServiceFocusFilter,
  duplicateKeys: Set<string>
) {
  if (focus === "all") {
    return true;
  }

  if (focus === "quote-ready") {
    return Boolean(service.is_active) && isQuoteReady(service);
  }

  if (focus === "needs-category") {
    return Boolean(service.is_active) && !service.category?.trim();
  }

  if (focus === "needs-detail") {
    return Boolean(service.is_active) && !service.description?.trim();
  }

  if (focus === "needs-price") {
    return (
      Boolean(service.is_active) &&
      (Number(service.default_unit_price) || 0) <= 0
    );
  }

  if (focus === "possible-duplicates") {
    return duplicateKeys.has(normalizeServiceName(service.name));
  }

  return service.category === "Auto Captured";
}

function serviceReadinessScore(service: ServiceItem) {
  const checks = [
    Boolean(service.name?.trim()),
    Boolean(service.category?.trim()),
    Boolean(service.description?.trim()),
    (Number(service.default_unit_price) || 0) > 0,
  ];

  return Math.round(
    (checks.filter(Boolean).length / checks.length) * 100
  );
}

function serviceQualitySignals(
  service: ServiceItem,
  duplicateKeys: Set<string>
) {
  const signals: string[] = [];

  if (!service.category?.trim()) {
    signals.push("Needs category");
  }

  if (!service.description?.trim()) {
    signals.push("Needs customer detail");
  }

  if ((Number(service.default_unit_price) || 0) <= 0) {
    signals.push("Needs price");
  }

  if (duplicateKeys.has(normalizeServiceName(service.name))) {
    signals.push("Similar name");
  }

  if (!service.is_active) {
    signals.push("Inactive");
  }

  return signals;
}

const starterServices: ServiceStarter[] = [
  {
    name: "Interior Paint Touch-Up",
    description:
      "Patch, prep, and touch up interior wall paint for a ready unit or punch item.",
    category: "Apartment Turns",
    defaultQuantity: "1",
    defaultUnitPrice: "185",
    tone: "cyan",
  },
  {
    name: "Outlet Replacement",
    description:
      "Replace standard outlet, confirm fit, and leave unit ready for manager review.",
    category: "Electrical",
    defaultQuantity: "1",
    defaultUnitPrice: "95",
    tone: "amber",
  },
  {
    name: "Fence Repair Section",
    description:
      "Repair damaged fence section with labor, standard fasteners, and cleanup.",
    category: "Exterior",
    defaultQuantity: "1",
    defaultUnitPrice: "325",
    tone: "emerald",
  },
  {
    name: "Tree Limb Removal",
    description:
      "Cut and remove manageable tree limb or branch debris from property work area.",
    category: "Grounds",
    defaultQuantity: "1",
    defaultUnitPrice: "240",
    tone: "rose",
  },
];

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
  const [easyUnitPrice, setEasyUnitPrice] =
    useState("");
  const [normalUnitPrice, setNormalUnitPrice] =
    useState("");
  const [difficultUnitPrice, setDifficultUnitPrice] =
    useState("");
  const [category, setCategory] = useState("");
  const [searchTerm, setSearchTerm] =
    useState("");
  const [categoryFilter, setCategoryFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("active");
  const [serviceFocusFilter, setServiceFocusFilter] =
    useState<ServiceFocusFilter>("all");
  const [sortMode, setSortMode] =
    useState<ServiceSortMode>("category");

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

      const {
        data: serviceData,
        error: serviceError,
      } =
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

      if (serviceError) {
        console.error(serviceError);

        setToast({
          type: "error",
          message:
            "Unable to load saved services. You can still try again after refreshing the page.",
        });
      }

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

  const duplicateNameKeys = useMemo(() => {
    const counts = new Map<string, number>();

    services.forEach((service) => {
      const key = normalizeServiceName(service.name);

      if (!key) {
        return;
      }

      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    );
  }, [services]);

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

      if (
        !serviceMatchesFocus(
          service,
          serviceFocusFilter,
          duplicateNameKeys
        )
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
    duplicateNameKeys,
    searchTerm,
    serviceFocusFilter,
    services,
    statusFilter,
  ]);

  const visibleServices = useMemo(() => {
    const sorted = [...filteredServices];

    sorted.sort((first, second) => {
      if (sortMode === "name") {
        return first.name.localeCompare(second.name);
      }

      if (sortMode === "readiness") {
        return (
          serviceReadinessScore(second) -
          serviceReadinessScore(first)
        );
      }

      if (sortMode === "price-high") {
        return (
          (Number(second.default_unit_price) || 0) -
          (Number(first.default_unit_price) || 0)
        );
      }

      if (sortMode === "price-low") {
        return (
          (Number(first.default_unit_price) || 0) -
          (Number(second.default_unit_price) || 0)
        );
      }

      if (sortMode === "inactive-first") {
        return Number(first.is_active) - Number(second.is_active);
      }

      const categoryCompare = (first.category || "Uncategorized")
        .localeCompare(second.category || "Uncategorized");

      return categoryCompare || first.name.localeCompare(second.name);
    });

    return sorted;
  }, [filteredServices, sortMode]);

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
  const activeServices = services.filter(
    (service) => service.is_active
  );
  const duplicateServiceCount = services.filter((service) =>
    duplicateNameKeys.has(normalizeServiceName(service.name))
  ).length;
  const servicesNeedingPolishCount = activeServices.filter(
    (service) =>
      serviceQualitySignals(service, duplicateNameKeys).length > 0
  ).length;
  const servicePrices = activeServices.map((service) =>
    Number(service.default_unit_price) || 0
  );
  const averageUnitPrice =
    servicePrices.length > 0
      ? servicePrices.reduce((total, price) => total + price, 0) /
        servicePrices.length
      : 0;
  const highestPrice =
    servicePrices.length > 0 ? Math.max(...servicePrices) : 0;
  const lowestPrice =
    servicePrices.length > 0 ? Math.min(...servicePrices) : 0;
  const categoryPriceSummaries = categories
    .map((serviceCategory) => {
      const prices = activeServices
        .filter((service) => service.category === serviceCategory)
        .map((service) => Number(service.default_unit_price) || 0)
        .filter((price) => price > 0);

      const average =
        prices.length > 0
          ? prices.reduce((total, price) => total + price, 0) / prices.length
          : 0;

      return {
        name: serviceCategory,
        count: prices.length,
        average,
        min: prices.length > 0 ? Math.min(...prices) : 0,
        max: prices.length > 0 ? Math.max(...prices) : 0,
      };
    })
    .filter((summary) => summary.count > 0)
    .sort((first, second) => second.count - first.count);
  const categoryAveragePrices = new Map(
    categoryPriceSummaries.map((summary) => [
      summary.name,
      summary.average,
    ])
  );
  const uncategorizedCount = activeServices.filter(
    (service) => !service.category?.trim()
  ).length;
  const missingDescriptionCount = activeServices.filter(
    (service) => !service.description?.trim()
  ).length;
  const topCategories = [...categorySummaries]
    .sort((first, second) => second.count - first.count)
    .slice(0, 3);
  const quoteReadyCount = activeServices.filter(
    (service) => isQuoteReady(service)
  ).length;
  const priceMissingCount = activeServices.filter(
    (service) => (Number(service.default_unit_price) || 0) <= 0
  ).length;
  const serviceLibraryScore = services.length
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 -
              uncategorizedCount * 8 -
              missingDescriptionCount * 5 -
              priceMissingCount * 6 -
              inactiveCount * 3
          )
        )
      )
    : 0;
  const serviceActionCards = [
    {
      label: "Quote Ready",
      value: `${quoteReadyCount}/${activeServices.length}`,
      detail: "Active services with category, detail, and price.",
      action: "Review active",
      onClick: () => {
        setCategoryFilter("all");
        setStatusFilter("active");
        setServiceFocusFilter("quote-ready");
        setSearchTerm("");
      },
      tone: "emerald",
    },
    {
      label: "Needs Category",
      value: String(uncategorizedCount),
      detail: "Organize these so estimates look consistent.",
      action: "Find gaps",
      onClick: () => {
        setCategoryFilter("all");
        setStatusFilter("active");
        setServiceFocusFilter("needs-category");
        setSearchTerm("");
      },
      tone: uncategorizedCount > 0 ? "amber" : "zinc",
    },
    {
      label: "Needs Price",
      value: String(priceMissingCount),
      detail: "Price blanks slow quoting and invite guesswork.",
      action: "Review prices",
      onClick: () => {
        setCategoryFilter("all");
        setStatusFilter("active");
        setServiceFocusFilter("needs-price");
        setSearchTerm("");
      },
      tone: priceMissingCount > 0 ? "rose" : "zinc",
    },
    {
      label: "Possible Duplicates",
      value: String(duplicateServiceCount),
      detail: "Similar service names that may need cleanup.",
      action: "Compare",
      onClick: () => {
        setCategoryFilter("all");
        setStatusFilter("all");
        setServiceFocusFilter("possible-duplicates");
        setSearchTerm("");
      },
      tone: duplicateServiceCount > 0 ? "amber" : "zinc",
    },
    {
      label: "Top Category",
      value: topCategories[0]?.name ?? "Not set",
      detail: topCategories[0]
        ? `${topCategories[0].count} saved service${
            topCategories[0].count === 1 ? "" : "s"
          }.`
        : "Categories appear after services are organized.",
      action: "Open category",
      onClick: () => {
        if (topCategories[0]) {
          setCategoryFilter(topCategories[0].name);
          setStatusFilter("all");
          setServiceFocusFilter("all");
          setSearchTerm("");
        }
      },
      tone: "cyan",
    },
  ];
  const serviceLibraryLabel =
    serviceLibraryScore >= 86
      ? "Client-ready"
      : serviceLibraryScore >= 68
        ? "Needs polish"
        : services.length > 0
          ? "Needs cleanup"
          : "Build starter";
  const linePreviewTotal =
    (Number(defaultQuantity) || 0) *
    (Number(defaultUnitPrice) || 0);
  const formReadinessItems = [
    {
      label: "Name",
      ready: Boolean(name.trim()),
    },
    {
      label: "Price",
      ready: (Number(defaultUnitPrice) || 0) > 0,
    },
    {
      label: "Category",
      ready: Boolean(category.trim()),
    },
    {
      label: "Detail",
      ready: Boolean(description.trim()),
    },
  ];
  const formReadinessScore = Math.round(
    (formReadinessItems.filter((item) => item.ready).length /
      formReadinessItems.length) *
      100
  );
  const draftNameKey = normalizeServiceName(name);
  const draftPossibleDuplicate = Boolean(
    draftNameKey &&
      services.some(
        (service) =>
          service.id !== editingServiceId &&
          normalizeServiceName(service.name) === draftNameKey
      )
  );
  const selectedCategorySummary = categoryPriceSummaries.find(
    (summary) => summary.name === category.trim()
  );
  const selectedCategoryAverage =
    selectedCategorySummary?.average ?? 0;
  const draftUnitPrice = Number(defaultUnitPrice) || 0;
  const draftPriceBand =
    selectedCategoryAverage && draftUnitPrice > 0
      ? draftUnitPrice > selectedCategoryAverage * 1.15
        ? "Premium lane"
        : draftUnitPrice < selectedCategoryAverage * 0.85
          ? "Below lane"
          : "In lane"
      : selectedCategoryAverage > 0
        ? "Use lane"
        : "No lane";
  const draftDescriptionQuality =
    description.trim().length >= 48
      ? "Customer-ready copy"
      : description.trim().length >= 20
        ? "Could use more detail"
        : "Needs customer detail";
  const draftCoachSignals = [
    draftPossibleDuplicate ? "Possible duplicate name" : "",
    category.trim() && selectedCategoryAverage > 0
      ? `${category.trim()} avg ${formatCurrency(selectedCategoryAverage)}`
      : "",
    draftUnitPrice > 0 ? draftPriceBand : "Add a default price",
    draftDescriptionQuality,
  ].filter(Boolean);
  const serviceFocusOptions: Array<{
    label: string;
    value: ServiceFocusFilter;
    count: number;
  }> = [
    {
      label: "All",
      value: "all",
      count: services.length,
    },
    {
      label: "Quote-ready",
      value: "quote-ready",
      count: quoteReadyCount,
    },
    {
      label: "Needs category",
      value: "needs-category",
      count: uncategorizedCount,
    },
    {
      label: "Needs detail",
      value: "needs-detail",
      count: missingDescriptionCount,
    },
    {
      label: "Needs price",
      value: "needs-price",
      count: priceMissingCount,
    },
    {
      label: "Auto captured",
      value: "auto-captured",
      count: autoCapturedCount,
    },
    {
      label: "Duplicates",
      value: "possible-duplicates",
      count: duplicateServiceCount,
    },
  ];
  const suggestedCategories = [
    "Apartment Turns",
    "Painting",
    "Electrical",
    "Exterior",
    "Grounds",
    "Cleaning",
    "Repairs",
  ].filter(
    (suggestedCategory) =>
      !categories.includes(suggestedCategory)
  );
  const serviceSpotlightCards = [
    {
      label: "Library Health",
      value: `${serviceLibraryScore}%`,
      detail: serviceLibraryLabel,
      tone: "emerald",
    },
    {
      label: "Bid Gaps",
      value: String(servicesNeedingPolishCount),
      detail: "Active services with cleanup signals.",
      tone: servicesNeedingPolishCount > 0 ? "amber" : "emerald",
    },
    {
      label: "Top Lane",
      value: topCategories[0]?.name ?? "Not set",
      detail: topCategories[0]
        ? `${topCategories[0].count} service${
            topCategories[0].count === 1 ? "" : "s"
          } grouped here.`
        : "Add categories to organize bids by work type.",
      tone: "cyan",
    },
  ];
  const existingServiceKeys = new Set(
    services.map((service) => normalizeServiceName(service.name))
  );
  const nextStarterService =
    starterServices.find(
      (starter) => !existingServiceKeys.has(normalizeServiceName(starter.name))
    ) ?? starterServices[0];

  async function reloadServices() {
    if (!business) {
      return;
    }

    const { data, error } = await supabase
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

    if (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to refresh services right now.",
      });
      return;
    }

    setServices((data ?? []) as ServiceItem[]);
  }

  function resetForm() {
    setEditingServiceId("");
    setName("");
    setDescription("");
    setDefaultQuantity("1");
    setDefaultUnitPrice("");
    setEasyUnitPrice("");
    setNormalUnitPrice("");
    setDifficultUnitPrice("");
    setCategory("");
  }

  function scrollToServiceForm() {
    window.setTimeout(() => {
      document.getElementById("service-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
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
    setEasyUnitPrice(
      service.easy_unit_price === null ||
        service.easy_unit_price === undefined
        ? ""
        : String(Number(service.easy_unit_price) || 0)
    );
    setNormalUnitPrice(
      service.normal_unit_price === null ||
        service.normal_unit_price === undefined
        ? ""
        : String(Number(service.normal_unit_price) || 0)
    );
    setDifficultUnitPrice(
      service.difficult_unit_price === null ||
        service.difficult_unit_price === undefined
        ? ""
        : String(Number(service.difficult_unit_price) || 0)
    );
    setCategory(service.category ?? "");
    setToast({
      type: "success",
      message: `Editing ${service.name}. Make changes in the form, then save.`,
    });
    scrollToServiceForm();
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
    setEasyUnitPrice(
      service.easy_unit_price === null ||
        service.easy_unit_price === undefined
        ? ""
        : String(Number(service.easy_unit_price) || 0)
    );
    setNormalUnitPrice(
      service.normal_unit_price === null ||
        service.normal_unit_price === undefined
        ? ""
        : String(Number(service.normal_unit_price) || 0)
    );
    setDifficultUnitPrice(
      service.difficult_unit_price === null ||
        service.difficult_unit_price === undefined
        ? ""
        : String(Number(service.difficult_unit_price) || 0)
    );
    setCategory(service.category ?? "");
    setToast({
      type: "success",
      message:
        "Service copied into the form. Rename it, then save.",
    });

    scrollToServiceForm();
  }

  function applyStarter(starter: ServiceStarter) {
    setEditingServiceId("");
    setName(starter.name);
    setDescription(starter.description);
    setDefaultQuantity(starter.defaultQuantity);
    setDefaultUnitPrice(starter.defaultUnitPrice);
    setEasyUnitPrice("");
    setNormalUnitPrice(starter.defaultUnitPrice);
    setDifficultUnitPrice("");
    setCategory(starter.category);
    setToast({
      type: "success",
      message: `${starter.name} is staged in the form. Adjust it, then save.`,
    });
    scrollToServiceForm();
  }

  function applySuggestedCategory(suggestedCategory: string) {
    setCategory(suggestedCategory);
    scrollToServiceForm();
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
    const baseServicePayload = {
      name,
      description,
      default_quantity:
        Number(defaultQuantity) || 1,
      default_unit_price:
        Number(defaultUnitPrice) || 0,
      category,
    };
    const tierServicePayload = {
      ...baseServicePayload,
      easy_unit_price:
        easyUnitPrice.trim() ? Number(easyUnitPrice) || 0 : null,
      normal_unit_price:
        normalUnitPrice.trim() ? Number(normalUnitPrice) || 0 : null,
      difficult_unit_price:
        difficultUnitPrice.trim()
          ? Number(difficultUnitPrice) || 0
          : null,
    };

    if (editingServiceId) {
      let { error } = await supabase
        .from("service_items")
        .update(tierServicePayload)
        .eq("id", editingServiceId);
      let savedWithoutTiers = false;

      if (isMissingTierColumnError(error)) {
        const fallback = await supabase
          .from("service_items")
          .update(baseServicePayload)
          .eq("id", editingServiceId);

        error = fallback.error;
        savedWithoutTiers = !fallback.error;
      }

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
        type: savedWithoutTiers ? "error" : "success",
        message: savedWithoutTiers
          ? "Service updated. Run the service pricing tiers SQL before tier prices can be saved."
          : "Service updated.",
      });

      resetForm();
      await reloadServices();
      return;
    }

    let { error } = await supabase
      .from("service_items")
      .insert({
        business_id: business.id,
        ...tierServicePayload,
        is_active: true,
      });
    let savedWithoutTiers = false;

    if (isMissingTierColumnError(error)) {
      const fallback = await supabase
        .from("service_items")
        .insert({
          business_id: business.id,
          ...baseServicePayload,
          is_active: true,
        });

      error = fallback.error;
      savedWithoutTiers = !fallback.error;
    }

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
      type: savedWithoutTiers ? "error" : "success",
      message: savedWithoutTiers
        ? "Service created. Run the service pricing tiers SQL before tier prices can be saved."
        : "Service created.",
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
        <Card className="services-command-hero border-cyan-500/20 bg-zinc-950/80">
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-orange-300">
                Trimax Price Book
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
                Services
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Manage reusable line items for{" "}
                {business?.name ?? "this business"} so every estimate starts
                cleaner, faster, and more consistent.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/service-analytics?business=${businessSlug}`}>
                  <Button variant="secondary">Service Analytics</Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {serviceSpotlightCards.map((card) => (
                <div
                  key={card.label}
                  data-tone={card.tone}
                  className="services-spotlight-card rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    {card.label}
                  </p>
                  <p className="mt-2 line-clamp-2 text-2xl font-black text-white">
                    {card.value}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    {card.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card id="service-form" className="service-builder-card">
          <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                    Service Builder
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {editingServiceId
                      ? "Edit Service"
                      : "New Service"}
                  </h2>
                </div>

                {editingServiceId && (
                  <Button
                    variant="secondary"
                    onClick={resetForm}
                  >
                    Cancel Edit
                  </Button>
                )}
              </div>

              {editingServiceId && (
                <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-orange-300">
                    Editing {name || "selected service"}
                  </p>

                  <p className="mt-1 text-sm text-zinc-300">
                    Update the fields below, then click Save Service. Cancel
                    Edit leaves the existing service unchanged.
                  </p>
                </div>
              )}

              <InputField
                label="Service Name"
                placeholder="Example: Classic Paint"
                value={name}
                onChange={setName}
              />

              <InputField
                label="Description"
                placeholder="Example: Patch, prep, and paint one unit wall"
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

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                      Pricing Tiers
                    </p>
                    <h3 className="mt-1 text-lg font-black text-white">
                      Optional estimate assistant prices
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-400">
                    Used only as suggestions. You can still override every line.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <InputField
                    label="Easy Unit Price"
                    type="number"
                    value={easyUnitPrice}
                    onChange={setEasyUnitPrice}
                  />

                  <InputField
                    label="Normal Unit Price"
                    type="number"
                    value={normalUnitPrice}
                    onChange={setNormalUnitPrice}
                  />

                  <InputField
                    label="Difficult Unit Price"
                    type="number"
                    value={difficultUnitPrice}
                    onChange={setDifficultUnitPrice}
                  />
                </div>
              </div>

              {suggestedCategories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestedCategories.slice(0, 5).map((suggestedCategory) => (
                    <button
                      key={suggestedCategory}
                      type="button"
                      onClick={() => applySuggestedCategory(suggestedCategory)}
                      className="service-suggestion-chip rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
                    >
                      {suggestedCategory}
                    </button>
                  ))}
                </div>
              ) : null}

              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingServiceId
                    ? "Save Service"
                    : "Create Service"}
              </Button>
            </div>

            <aside className="service-builder-preview rounded-3xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Quote Preview
              </p>
              <h3 className="mt-2 text-lg font-black text-white">
                {name.trim() || "Service name"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {description.trim() ||
                  "Add a short customer-safe description so estimates read cleanly."}
              </p>

              <div className="mt-4 grid gap-3">
                <div className="service-preview-row rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                  <span>Category</span>
                  <strong>{category.trim() || "Not set"}</strong>
                </div>
                <div className="service-preview-row rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                  <span>Line total</span>
                  <strong>{formatCurrency(linePreviewTotal)}</strong>
                </div>
                <div className="service-preview-row rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                  <span>Tier range</span>
                  <strong>
                    {[easyUnitPrice, normalUnitPrice, difficultUnitPrice].filter(
                      (price) => Number(price) > 0
                    ).length > 0
                      ? `${formatCurrency(
                          Math.min(
                            ...[easyUnitPrice, normalUnitPrice, difficultUnitPrice]
                              .map((price) => Number(price) || 0)
                              .filter((price) => price > 0)
                          )
                        )} - ${formatCurrency(
                          Math.max(
                            ...[easyUnitPrice, normalUnitPrice, difficultUnitPrice]
                              .map((price) => Number(price) || 0)
                              .filter((price) => price > 0)
                          )
                        )}`
                      : "Not set"}
                  </strong>
                </div>
                <div className="service-preview-row rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                  <span>Readiness</span>
                  <strong>{formReadinessScore}%</strong>
                </div>
              </div>

              <div className="service-builder-coach mt-4 rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">
                      Builder Coach
                    </p>
                    <p className="mt-1 text-sm leading-5 text-zinc-400">
                      Price, wording, and catalog cleanup signals for this
                      draft.
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-black ${
                      draftPossibleDuplicate
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    }`}
                  >
                    {draftPossibleDuplicate ? "Review" : "Clean"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {draftCoachSignals.map((signal) => (
                    <span
                      key={signal}
                      className="service-coach-chip rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300"
                    >
                      {signal}
                    </span>
                  ))}
                </div>

                {selectedCategoryAverage > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setDefaultUnitPrice(
                        String(Math.round(selectedCategoryAverage))
                      )
                    }
                    className="service-coach-action mt-3 w-full rounded-2xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-sm font-black text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/15"
                  >
                    Use category average {formatCurrency(selectedCategoryAverage)}
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-2">
                {formReadinessItems.map((item) => (
                  <div
                    key={item.label}
                    className={`service-readiness-line rounded-full border px-3 py-2 text-xs font-black ${
                      item.ready
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                    }`}
                  >
                    {item.ready ? "Ready" : "Needs"} {item.label}
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </Card>

        <Card className="service-starter-lab border-orange-500/20 bg-zinc-950/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-300">
                Service Starter Lab
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Start from real-world contractor work
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Use these as quick drafts for common work types, then tune the
                wording and price to match how R&L wants to bid.
              </p>
            </div>

            <button
              type="button"
              onClick={() => applyStarter(nextStarterService)}
              className="service-next-starter rounded-2xl border border-orange-300/30 bg-orange-400/10 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-400/15"
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-200">
                Suggested Next
              </p>
              <p className="mt-1 text-sm font-black text-white">
                {nextStarterService.name}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {nextStarterService.category} -{" "}
                {formatCurrency(nextStarterService.defaultUnitPrice)}
              </p>
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {starterServices.map((starter) => (
              <button
                key={starter.name}
                type="button"
                onClick={() => applyStarter(starter)}
                data-tone={starter.tone}
                className="service-starter-card rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  {starter.category}
                </p>
                <h3 className="mt-2 text-base font-black text-white">
                  {starter.name}
                </h3>
                <p className="mt-2 min-h-[3.75rem] text-xs leading-5 text-zinc-400">
                  {starter.description}
                </p>
                <span className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-black text-orange-100">
                  Start at {formatCurrency(starter.defaultUnitPrice)}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="service-capture-card border-emerald-500/30 bg-emerald-500/10">
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">
            Smart Service Capture
          </p>

          <h2 className="mt-2 text-2xl font-bold">
            Typed line items can become reusable services
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
            When a new service is typed on an estimate or invoice, Trimax can
            capture it here for this workspace. That keeps R&L apartment work
            and Just Kleen cleaning work organized without making you enter
            the same service twice.
          </p>
        </Card>

        <Card className="service-intelligence-card border-cyan-500/25 bg-cyan-500/10">
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-200">
                Service Intelligence
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Price book health
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                A clean service library keeps estimates faster, invoices more
                consistent, and recurring work easier to quote without hunting
                through old documents.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="service-intelligence-stat rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Library Score
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {serviceLibraryScore}%
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Based on active, categorized, described services.
                  </p>
                </div>

                <div className="service-intelligence-stat rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Avg Price
                  </p>
                  <p className="mt-2 text-2xl font-black text-emerald-100">
                    {formatCurrency(averageUnitPrice)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Active service unit price.
                  </p>
                </div>

                <div className="service-intelligence-stat rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Price Range
                  </p>
                  <p className="mt-2 text-lg font-black text-amber-100">
                    {formatCurrency(lowestPrice)} - {formatCurrency(highestPrice)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Low to high active services.
                  </p>
                </div>
              </div>
            </div>

            <div className="service-intelligence-panel rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                    Cleanup Signals
                  </p>
                  <h3 className="mt-1 text-lg font-black text-white">
                    Keep the catalog quote-ready
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setStatusFilter("active");
                    setServiceFocusFilter("all");
                    setSearchTerm("");
                  }}
                  className="service-intelligence-action rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"
                >
                  View active
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setStatusFilter("active");
                    setServiceFocusFilter("needs-category");
                    setSearchTerm("");
                  }}
                  className="service-intelligence-row rounded-2xl border border-white/10 bg-zinc-950/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Uncategorized
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {uncategorizedCount}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Active services needing a category.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("active");
                    setServiceFocusFilter("needs-detail");
                    setSearchTerm("");
                  }}
                  className="service-intelligence-row rounded-2xl border border-white/10 bg-zinc-950/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Needs Detail
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {missingDescriptionCount}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Active services without descriptions.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("inactive");
                    setServiceFocusFilter("all");
                    setSearchTerm("");
                  }}
                  className="service-intelligence-row rounded-2xl border border-white/10 bg-zinc-950/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Inactive
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {inactiveCount}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Hidden from new quotes.
                  </p>
                </button>
              </div>

              {topCategories.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {topCategories.map((serviceCategory) => (
                    <button
                      key={serviceCategory.name}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(serviceCategory.name);
                        setServiceFocusFilter("all");
                      }}
                      className="service-category-signal rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"
                    >
                      {serviceCategory.name}{" "}
                      <span className="text-xs opacity-75">
                        {serviceCategory.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="service-action-strip border-emerald-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-emerald-200">
                Estimate Starter Readiness
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                Build cleaner bids from the price book
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                A polished service catalog turns repeat work into faster,
                more consistent estimates without bloating the estimate screen.
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                resetForm();
                scrollToServiceForm();
              }}
            >
              Add Service
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {serviceActionCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={card.onClick}
                data-tone={card.tone}
                className="service-action-card rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/60"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-3 line-clamp-2 text-2xl font-black text-white">
                  {card.value}
                </p>
                <p className="mt-2 min-h-[2.75rem] text-sm leading-5 text-zinc-400">
                  {card.detail}
                </p>
                <span className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs font-black text-emerald-100">
                  {card.action}
                </span>
              </button>
            ))}
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
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
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

        {categoryPriceSummaries.length > 0 && (
          <Card className="service-price-map rounded-3xl border border-white/10 bg-zinc-950/80">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
                  Price Map
                </p>
                <h2 className="mt-2 text-xl font-black text-white">
                  Category pricing lanes
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  See where service categories are priced today so bids stay
                  consistent while still leaving room for premium work.
                </p>
              </div>

              <div className="service-price-map-summary rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Average Service
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-100">
                  {formatCurrency(averageUnitPrice)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {categoryPriceSummaries.slice(0, 8).map((summary) => (
                <button
                  key={summary.name}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(summary.name);
                    setStatusFilter("active");
                    setServiceFocusFilter("all");
                    setSearchTerm("");
                  }}
                  className="service-price-card rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-300/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-black text-white">
                      {summary.name}
                    </p>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-black text-emerald-100">
                      {summary.count}
                    </span>
                  </div>

                  <p className="mt-3 text-2xl font-black text-orange-300">
                    {formatCurrency(summary.average)}
                  </p>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-orange-400"
                      style={{
                        width: `${Math.max(
                          12,
                          Math.min(
                            100,
                            highestPrice > 0
                              ? (summary.average / highestPrice) * 100
                              : 0
                          )
                        )}%`,
                      }}
                    />
                  </div>

                  <p className="mt-3 text-xs font-semibold text-zinc-400">
                    {formatCurrency(summary.min)} to{" "}
                    {formatCurrency(summary.max)}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        )}

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
                        ? "app-chip-active bg-orange-500 text-black"
                        : "app-chip bg-zinc-800 text-zinc-300 hover:text-orange-400"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_240px_220px]">
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
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
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

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Sort
                </label>

                <select
                  value={sortMode}
                  onChange={(event) =>
                    setSortMode(event.target.value as ServiceSortMode)
                  }
                  className="app-form-input service-sort-select w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  <option value="category">
                    Category + name
                  </option>
                  <option value="name">Name</option>
                  <option value="readiness">
                    Most ready
                  </option>
                  <option value="price-high">
                    Price high to low
                  </option>
                  <option value="price-low">
                    Price low to high
                  </option>
                  <option value="inactive-first">
                    Inactive first
                  </option>
                </select>
              </div>
            </div>

            <div className="service-focus-bar rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
                    Smart Focus
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Jump straight to services that are ready, incomplete, or auto-captured.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setStatusFilter("active");
                    setServiceFocusFilter("all");
                    setSearchTerm("");
                  }}
                  className="service-clear-filters rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/10"
                >
                  Reset view
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {serviceFocusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setServiceFocusFilter(option.value);
                      if (option.value !== "all") {
                        setStatusFilter(
                          option.value === "auto-captured" ||
                            option.value === "possible-duplicates"
                            ? "all"
                            : "active"
                        );
                      }
                    }}
                    className={`service-focus-chip rounded-full border px-4 py-2 text-sm font-black transition ${
                      serviceFocusFilter === option.value
                        ? "app-chip-active border-orange-500 bg-orange-500 text-black"
                        : "app-chip border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-orange-400 hover:text-orange-300"
                    }`}
                  >
                    {option.label}{" "}
                    <span className="text-xs opacity-75">{option.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="service-result-count rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-300">
              Showing {visibleServices.length} of {services.length} services
              {serviceFocusFilter !== "all"
                ? ` in ${serviceFocusFilter.replace(/-/g, " ")} focus`
                : ""}
              .
            </div>

            {categorySummaries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setServiceFocusFilter("all");
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    categoryFilter === "all"
                      ? "app-chip-active border-orange-500 bg-orange-500 text-black"
                      : "app-chip border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-orange-400 hover:text-orange-300"
                  }`}
                >
                  All categories
                </button>

                {categorySummaries.map(
                  (serviceCategory) => (
                    <button
                      key={serviceCategory.name}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(
                          serviceCategory.name
                        );
                        setServiceFocusFilter("all");
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        categoryFilter ===
                        serviceCategory.name
                          ? "app-chip-active border-orange-500 bg-orange-500 text-black"
                          : "app-chip border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-orange-400 hover:text-orange-300"
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
            <p className="font-semibold text-white">
              No saved services yet.
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Add common services above, or create an estimate or invoice and
              type a new line item. Trimax can save that service for this
              workspace after the document is saved.
            </p>
          </Card>
        ) : visibleServices.length === 0 ? (
          <Card>
            <p className="text-zinc-400">
              No services match those filters.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {visibleServices.map((service) => {
              const readinessScore = serviceReadinessScore(service);
              const readinessTone =
                readinessScore >= 100
                  ? "ready"
                  : readinessScore >= 75
                    ? "review"
                    : "gap";
              const servicePrice =
                Number(service.default_unit_price) || 0;
              const categoryAverage = service.category
                ? categoryAveragePrices.get(service.category)
                : 0;
              const priceBand =
                categoryAverage && servicePrice > 0
                  ? servicePrice > categoryAverage * 1.15
                    ? "premium"
                    : servicePrice < categoryAverage * 0.85
                      ? "below"
                      : "aligned"
                  : "unset";
              const priceBandLabel =
                priceBand === "premium"
                  ? "Premium lane"
                  : priceBand === "below"
                    ? "Below lane"
                    : priceBand === "aligned"
                      ? "In lane"
                      : "No lane";
              const isPossibleDuplicate = duplicateNameKeys.has(
                normalizeServiceName(service.name)
              );
              const qualitySignals = serviceQualitySignals(
                service,
                duplicateNameKeys
              );
              const servicePricingTiers = [
                {
                  label: "Easy",
                  price: Number(service.easy_unit_price) || 0,
                },
                {
                  label: "Normal",
                  price: Number(service.normal_unit_price) || 0,
                },
                {
                  label: "Difficult",
                  price: Number(service.difficult_unit_price) || 0,
                },
              ].filter((tier) => tier.price > 0);

              return (
                <Card
                  key={service.id}
                  className={`service-library-card ${
                    service.is_active
                      ? ""
                      : "opacity-50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm uppercase tracking-[0.2em] text-orange-400">
                          {service.category ||
                            "Uncategorized"}
                        </p>
                        <span
                          data-tone={readinessTone}
                          className="service-readiness-badge rounded-full border px-3 py-1 text-xs font-black"
                        >
                          {readinessScore}% ready
                        </span>
                      </div>

                      <h2 className="mt-2 text-2xl font-semibold">
                        {service.name}
                      </h2>

                      <p className="mt-2 text-zinc-400">
                        {service.description ||
                          "No description."}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="service-line-signal rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-zinc-300">
                          Qty {Number(service.default_quantity) || 1}
                        </span>
                        <span className="service-line-signal rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100">
                          {formatCurrency(service.default_unit_price)}
                        </span>
                        <span
                          data-tone={priceBand}
                          className="service-price-band rounded-full border px-3 py-1 text-xs font-black"
                        >
                          {priceBandLabel}
                        </span>
                        <span
                          className={`service-line-signal rounded-full border px-3 py-1 text-xs font-black ${
                            service.category?.trim()
                              ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                          }`}
                        >
                          {service.category?.trim()
                            ? "Categorized"
                            : "Needs category"}
                        </span>
                        <span
                          className={`service-line-signal rounded-full border px-3 py-1 text-xs font-black ${
                            service.description?.trim()
                              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                          }`}
                        >
                          {service.description?.trim()
                            ? "Estimate-ready"
                            : "Needs detail"}
                        </span>
                        {isPossibleDuplicate && (
                          <span className="service-line-signal rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100">
                            Similar name
                          </span>
                        )}
                        {servicePricingTiers.map((tier) => (
                          <span
                            key={tier.label}
                            className="service-line-signal rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-100"
                          >
                            {tier.label} {formatCurrency(tier.price)}
                          </span>
                        ))}
                      </div>

                      <div className="service-quality-strip mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                            Bid Polish
                          </p>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black ${
                              qualitySignals.length === 0
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                                : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            }`}
                          >
                            {qualitySignals.length === 0
                              ? "Ready to sell"
                              : `${qualitySignals.length} signal${
                                  qualitySignals.length === 1 ? "" : "s"
                                }`}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {(qualitySignals.length > 0
                            ? qualitySignals
                            : ["Clean catalog item"]
                          ).map((signal) => (
                            <span
                              key={signal}
                              className="service-quality-chip rounded-full border border-white/10 bg-zinc-950/50 px-3 py-1 text-xs font-black text-zinc-300"
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      </div>
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
              );
            })}
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
