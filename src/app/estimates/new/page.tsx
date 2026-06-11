"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import Button from "../../components/Button";
import InputField from "../../components/InputField";
import TaxModeSelect from "../../components/TaxModeSelect";
import Card from "../../components/Card";
import Toast from "../../components/Toast";
import { captureServicesFromLineItems } from "../../lib/captureServicesFromLineItems";
import { getNextDocumentDisplayId } from "../../lib/documentNumbers";
import { logActivity } from "../../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../../lib/maintenanceMode";
import { buildSplitInvoicePlan } from "../../lib/splitInvoices";
import { supabase } from "../../lib/supabase";
import { looksLikeApartmentUnitPaintJob } from "../../utils/jobWorkflow";
import {
  formatTaxSummaryLabel,
  getEffectiveTaxRate,
  getTaxSuggestionForAddress,
  type TaxMode,
} from "../../utils/tax";
import { maybeCanonicalApartmentUnitLabel } from "../../utils/unitLabels";

type Business = {
  id: string;
  name: string;
  slug: string;
  split_warning_amount: number | string | null;
};

type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  service_address: string | null;
};

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  default_quantity: number | string | null;
  default_unit_price: number | string | null;
  category: string | null;
};

type LineItem = {
  serviceItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type QueueItem = {
  id: string;
  business_id: string | null;
  property: string | null;
  unit: string | null;
  paint_type: string | null;
  unit_layout: string | null;
  wall_paint_color: string | null;
  flooring: string | null;
  move_out_date: string | null;
  ready_date: string | null;
  notes: string | null;
  smoked_in: boolean | null;
  primer_requested: boolean | null;
  prior_renovation: boolean | null;
  prior_renovation_details: string | null;
  renovation_needed: boolean | null;
  renovation_needed_details: string | null;
};

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function getLineTotal(item: LineItem) {
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;

  return quantity * unitPrice;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value) || 0;
}

function normalizeMatchText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(apartments|apartment|apts|apt|property|properties)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMatchingClient(
  clients: Client[],
  propertyName: string | null
) {
  const normalizedProperty = normalizeMatchText(propertyName);

  if (!normalizedProperty) {
    return null;
  }

  return (
    clients.find(
      (client) => normalizeMatchText(client.name) === normalizedProperty
    ) ??
    clients.find((client) => {
      const normalizedClient = normalizeMatchText(client.name);

      return (
        normalizedClient.includes(normalizedProperty) ||
        normalizedProperty.includes(normalizedClient)
      );
    }) ??
    null
  );
}

function findMatchingService(
  serviceItems: ServiceItem[],
  queueItem: QueueItem
) {
  const searchText = normalizeMatchText(
    [
      queueItem.paint_type,
      queueItem.flooring,
      queueItem.notes,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (!searchText) {
    return null;
  }

  return (
    serviceItems.find((serviceItem) => {
      const serviceText = normalizeMatchText(
        [
          serviceItem.category,
          serviceItem.name,
          serviceItem.description,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        serviceText.includes(searchText) ||
        searchText.includes(serviceText)
      );
    }) ??
    serviceItems.find((serviceItem) => {
      const serviceText = normalizeMatchText(
        [
          serviceItem.category,
          serviceItem.name,
          serviceItem.description,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        Boolean(queueItem.paint_type) &&
        serviceText.includes(normalizeMatchText(queueItem.paint_type))
      );
    }) ??
    null
  );
}

function findPrimerService(serviceItems: ServiceItem[]) {
  return (
    serviceItems.find((serviceItem) => {
      const serviceText = normalizeMatchText(
        [
          serviceItem.category,
          serviceItem.name,
          serviceItem.description,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        serviceText.includes("full primer") ||
        serviceText.includes("primer")
      );
    }) ?? null
  );
}

function findRenovationService(serviceItems: ServiceItem[]) {
  return (
    serviceItems.find((serviceItem) => {
      const serviceText = normalizeMatchText(
        [
          serviceItem.category,
          serviceItem.name,
          serviceItem.description,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return (
        serviceText.includes("renovation and cabinet paint") ||
        serviceText.includes("renovation cabinet paint") ||
        (serviceText.includes("renovation") &&
          serviceText.includes("cabinet"))
      );
    }) ?? null
  );
}

async function ensureRenovationService(
  businessId: string,
  serviceItems: ServiceItem[]
) {
  const existingService = findRenovationService(serviceItems);

  if (existingService) {
    return existingService;
  }

  const { data, error } = await supabase
    .from("service_items")
    .insert({
      business_id: businessId,
      name: "Renovation and Cabinet Paint",
      description: "Renovation and Cabinet Paint",
      default_quantity: 1,
      default_unit_price: 0,
      category: "Renovation",
      is_active: true,
    })
    .select(
      "id, name, description, default_quantity, default_unit_price, category"
    )
    .single();

  if (error || !data) {
    if (error) {
      console.warn("Renovation service could not be created:", error.message);
    }
    return null;
  }

  return data as ServiceItem;
}

function serviceToLineItem(serviceItem: ServiceItem): LineItem {
  return {
    serviceItemId: serviceItem.id,
    description: serviceItem.description || serviceItem.name,
    quantity: String(Number(serviceItem.default_quantity) || 1),
    unitPrice:
      serviceItem.default_unit_price === null ||
      serviceItem.default_unit_price === undefined
        ? ""
        : String(Number(serviceItem.default_unit_price) || 0),
  };
}

function stripApartmentUnitPrefix(description: string | null | undefined) {
  const trimmed = (description || "").trim();
  const withoutUnitPrefix = trimmed
    .replace(/^.*?\bunit\s+[a-z]\d{1,2}\s*[-:]\s*/i, "")
    .replace(/^[a-z]\d{1,2}\s*[-:]\s*/i, "")
    .trim();

  return withoutUnitPrefix || trimmed;
}

function serviceDisplayLabel(serviceItem: ServiceItem) {
  const cleanName = stripApartmentUnitPrefix(serviceItem.name);

  return serviceItem.category
    ? `${serviceItem.category} - ${cleanName}`
    : cleanName;
}

function serviceLineDescription(serviceItem: ServiceItem) {
  return stripApartmentUnitPrefix(
    serviceItem.description || serviceItem.name
  );
}

function queueLineDescription(
  queueItem: QueueItem,
  serviceItem: ServiceItem | null,
  fallbackParts: Array<string | null>
) {
  const unitLabel = maybeCanonicalApartmentUnitLabel(queueItem.unit);
  const serviceDescription = serviceItem
    ? serviceLineDescription(serviceItem)
    : "";
  const fallbackDescription = fallbackParts.filter(Boolean).join(" - ");
  const baseDescription =
    serviceDescription || stripApartmentUnitPrefix(fallbackDescription);

  if (!unitLabel) {
    return baseDescription || "Apartment Turn";
  }

  if (
    !baseDescription ||
    normalizeMatchText(baseDescription) === normalizeMatchText(unitLabel)
  ) {
    return `Unit ${unitLabel}`;
  }

  return `Unit ${unitLabel} - ${baseDescription}`;
}

function isUuid(value: string | null) {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  );
}

function NewEstimatePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const queueId = searchParams.get("queueId");

  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";
  const clientIdFromUrl = searchParams.get("clientId");

  const [business, setBusiness] =
    useState<Business | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [serviceItems, setServiceItems] =
    useState<ServiceItem[]>([]);
  const [queueItem, setQueueItem] =
    useState<QueueItem | null>(null);

  const [selectedClientId, setSelectedClientId] =
    useState("");

  const [customerName, setCustomerName] =
    useState("");
  const [projectTitle, setProjectTitle] =
    useState("");
  const [serviceAddress, setServiceAddress] =
    useState("");
  const [reference, setReference] = useState("");
  const [taxMode, setTaxMode] = useState<TaxMode>("taxable");
  const [taxLabel, setTaxLabel] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxManuallyChanged, setTaxManuallyChanged] =
    useState(false);
  const [splitWarningEnabled, setSplitWarningEnabled] =
    useState(false);
  const [splitTargetAmount, setSplitTargetAmount] =
    useState("");
  const [
    splitWarningManuallyChanged,
    setSplitWarningManuallyChanged,
  ] = useState(false);
  const [terms, setTerms] = useState(
    "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."
  );
  const [notes, setNotes] = useState("");

  const [lineItems, setLineItems] =
    useState<LineItem[]>([
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);

  const subtotal = useMemo(() => {
    return lineItems.reduce(
      (total, item) => total + getLineTotal(item),
      0
    );
  }, [lineItems]);

  const taxAmount = useMemo(() => {
    const effectiveTaxRate = getEffectiveTaxRate({
      taxMode,
      taxRate,
    });

    return subtotal * (effectiveTaxRate / 100);
  }, [subtotal, taxMode, taxRate]);

  const estimateTotal = subtotal + taxAmount;
  const splitWarningAmount = toNumber(
    business?.split_warning_amount
  );
  const effectiveSplitTargetAmount =
    toNumber(splitTargetAmount) || splitWarningAmount;
  const shouldAutoEnableSplitWarning = useMemo(() => {
    return looksLikeApartmentUnitPaintJob(
      customerName,
      projectTitle,
      lineItems
    );
  }, [customerName, projectTitle, lineItems]);
  const effectiveSplitWarningEnabled =
    splitWarningManuallyChanged
      ? splitWarningEnabled
      : shouldAutoEnableSplitWarning;
  const showSplitWarning =
    effectiveSplitWarningEnabled &&
    effectiveSplitTargetAmount > 0 &&
    buildSplitInvoicePlan({
      subtotalAmount: subtotal,
      targetAmount: effectiveSplitTargetAmount,
      taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
    }).length > 0;
  const splitPreview = showSplitWarning
    ? buildSplitInvoicePlan({
        subtotalAmount: subtotal,
        targetAmount: effectiveSplitTargetAmount,
        taxRate: getEffectiveTaxRate({ taxMode, taxRate }),
      })
    : null;
  const taxSuggestion =
    getTaxSuggestionForAddress(serviceAddress);
  const showTaxSuggestionNote =
    Boolean(taxSuggestion) && !taxManuallyChanged;

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const applyTaxSuggestion = useCallback(
    (address: string) => {
      if (taxManuallyChanged) {
        return;
      }

      const suggestion =
        getTaxSuggestionForAddress(address);

      if (!suggestion) {
        setTaxLabel("");
        setTaxRate("");
        return;
      }

      setTaxLabel(suggestion.label);
      setTaxRate(suggestion.rate);
    },
    [taxManuallyChanged]
  );

  useEffect(() => {
    async function loadBusiness() {
      const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("slug", businessSlug)
        .single();

      if (error || !data) {
        console.error(error);

        setToast({
          type: "error",
          message: "Unable to load selected business.",
        });

        return;
      }

      const businessData = data as Business;

      setBusiness(businessData);

      const { data: clientData } =
        await supabase
          .from("clients")
          .select("*")
          .eq("business_id", businessData.id)
          .order("name", {
            ascending: true,
          });

      const loadedClients = (clientData ?? []) as Client[];

      setClients(loadedClients);

      if (clientIdFromUrl && !queueId) {
        const clientFromUrl = loadedClients.find(
          (client) => client.id === clientIdFromUrl
        );

        if (clientFromUrl) {
          const clientServiceAddress =
            clientFromUrl.service_address ||
            clientFromUrl.billing_address ||
            "";

          setSelectedClientId(clientFromUrl.id);
          setCustomerName(clientFromUrl.name);
          setServiceAddress(clientServiceAddress);

          if (clientServiceAddress) {
            applyTaxSuggestion(clientServiceAddress);
          }
        }
      }

      const { data: serviceData } =
        await supabase
          .from("service_items")
          .select("*")
          .eq("business_id", businessData.id)
          .eq("is_active", true)
          .order("category", {
            ascending: true,
          })
          .order("name", {
            ascending: true,
          });

      setServiceItems(
        (serviceData ?? []) as ServiceItem[]
      );
    }

    loadBusiness();
  }, [applyTaxSuggestion, businessSlug, clientIdFromUrl, queueId]);

  useEffect(() => {
    async function loadQueueItem() {
      if (!queueId || !business) {
        return;
      }

      if (!isUuid(queueId)) {
        setToast({
          type: "error",
          message:
            "This estimate link points to an old sample queue item. Open a real queue item from the Queue page and create the estimate from there.",
        });

        return;
      }

      const { data, error } = await supabase
        .from("queue_items")
        .select("*")
        .eq("id", queueId)
        .eq("business_id", business.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(error);

        setToast({
          type: "error",
          message:
            "Unable to load queue item details for this estimate.",
        });

        return;
      }

      if (!data) {
        setToast({
          type: "error",
          message:
            "That queue item was not found. Open the queue item again and create the estimate from there.",
        });

        return;
      }

      const loadedQueueItem = data as QueueItem;
      const canonicalUnit = maybeCanonicalApartmentUnitLabel(
        loadedQueueItem.unit
      );
      const unitLabel = canonicalUnit
        ? `Unit ${canonicalUnit}`
        : "Apartment Turn";
      const titleParts = [
        loadedQueueItem.property,
        unitLabel,
      ].filter(Boolean);
      const descriptionParts = [
        unitLabel,
        loadedQueueItem.unit_layout,
        loadedQueueItem.paint_type,
        loadedQueueItem.wall_paint_color,
        loadedQueueItem.flooring,
      ].filter(Boolean);
      const matchingClient = findMatchingClient(
        clients,
        loadedQueueItem.property
      );
      const matchingService = findMatchingService(
        serviceItems,
        loadedQueueItem
      );
      const shouldAddPrimer =
        Boolean(loadedQueueItem.smoked_in) &&
        loadedQueueItem.primer_requested !== false;
      const primerService = shouldAddPrimer
        ? findPrimerService(serviceItems)
        : null;
      const renovationService = loadedQueueItem.renovation_needed
        ? await ensureRenovationService(business.id, serviceItems)
        : null;
      if (
        renovationService &&
        !serviceItems.some(
          (serviceItem) => serviceItem.id === renovationService.id
        )
      ) {
        setServiceItems((currentItems) => [...currentItems, renovationService]);
      }
      const lineDescription = queueLineDescription(
        loadedQueueItem,
        matchingService,
        descriptionParts
      );
      const startingLineItems: LineItem[] = [
        matchingService
          ? {
              ...serviceToLineItem(matchingService),
              description: lineDescription,
            }
          : {
              serviceItemId: "",
              description: lineDescription,
              quantity: "1",
              unitPrice: "",
            },
      ];

      if (
        shouldAddPrimer &&
        !startingLineItems.some((item) =>
          normalizeMatchText(item.description).includes("primer")
        )
      ) {
        startingLineItems.push(
          primerService
            ? serviceToLineItem(primerService)
            : {
                serviceItemId: "",
                description: "Full Primer",
                quantity: "1",
                unitPrice: "",
              }
        );
      }

      if (
        loadedQueueItem.renovation_needed &&
        !startingLineItems.some((item) => {
          const description = normalizeMatchText(item.description);

          return (
            description.includes("renovation") &&
            description.includes("cabinet")
          );
        })
      ) {
        const renovationDescription =
          loadedQueueItem.renovation_needed_details?.trim()
            ? `Renovation and Cabinet Paint - ${loadedQueueItem.renovation_needed_details.trim()}`
            : "Renovation and Cabinet Paint";

        startingLineItems.push(
          renovationService
            ? {
                ...serviceToLineItem(renovationService),
                description: renovationDescription,
              }
            : {
                serviceItemId: "",
                description: renovationDescription,
                quantity: "1",
                unitPrice: "",
              }
        );
      }

      setQueueItem(loadedQueueItem);
      setSelectedClientId(matchingClient?.id ?? "");
      setCustomerName(
        matchingClient?.name ?? loadedQueueItem.property ?? ""
      );
      setProjectTitle(titleParts.join(" - "));
      setReference(maybeCanonicalApartmentUnitLabel(loadedQueueItem.unit));
      setNotes(
        [
          loadedQueueItem.wall_paint_color
            ? `Wall paint color: ${loadedQueueItem.wall_paint_color}`
            : null,
          loadedQueueItem.unit_layout
            ? `Unit layout: ${loadedQueueItem.unit_layout}`
            : null,
          loadedQueueItem.notes,
        ]
          .filter(Boolean)
          .join("\n")
      );
      setLineItems(startingLineItems);

      if (matchingClient) {
        const clientServiceAddress =
          matchingClient.service_address ||
          matchingClient.billing_address ||
          "";

        if (clientServiceAddress) {
          setServiceAddress(clientServiceAddress);
          applyTaxSuggestion(clientServiceAddress);
        }
      }
    }

    loadQueueItem();
  }, [applyTaxSuggestion, business, clients, queueId, serviceItems]);

  function handleServiceAddressChange(address: string) {
    setServiceAddress(address);
    applyTaxSuggestion(address);
  }

  function handleClientChange(clientId: string) {
    setSelectedClientId(clientId);

    const client = clients.find(
      (clientItem) => clientItem.id === clientId
    );

    if (!client) {
      setCustomerName("");
      setServiceAddress("");
      setTaxLabel("");
      setTaxRate("");
      setTaxManuallyChanged(false);
      return;
    }

    setCustomerName(client.name);

    const clientServiceAddress =
      client.service_address ||
      client.billing_address ||
      "";

    if (clientServiceAddress) {
      setServiceAddress(clientServiceAddress);
      applyTaxSuggestion(clientServiceAddress);
    }
  }

  function resetForm() {
    setSelectedClientId("");
    setCustomerName("");
    setProjectTitle("");
    setServiceAddress("");
    setReference("");
    setTaxMode("taxable");
    setTaxLabel("");
    setTaxRate("");
    setTaxNumber("");
    setTaxManuallyChanged(false);
    setSplitWarningEnabled(false);
    setSplitTargetAmount("");
    setSplitWarningManuallyChanged(false);
    setTerms(
      "This estimate is provided for review and approval. Final pricing may vary if scope, materials, or site conditions change."
    );
    setNotes("");
    setLineItems([
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  }

  function updateLineItem(
    index: number,
    field: keyof LineItem,
    value: string
  ) {
    setLineItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function handleServiceChange(
    index: number,
    serviceItemId: string
  ) {
    const selectedService = serviceItems.find(
      (serviceItem) => serviceItem.id === serviceItemId
    );

    if (!selectedService) {
      updateLineItem(index, "serviceItemId", "");
      return;
    }

    setLineItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              serviceItemId,
              description: serviceLineDescription(selectedService),
              quantity: String(
                Number(
                  selectedService.default_quantity
                ) || 1
              ),
              unitPrice: String(
                Number(
                  selectedService.default_unit_price
                ) || 0
              ),
            }
          : item
      )
    );
  }

  function addLineItem() {
    setLineItems((currentItems) => [
      ...currentItems,
      {
        serviceItemId: "",
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems((currentItems) =>
      currentItems.length === 1
        ? currentItems
        : currentItems.filter(
            (_item, itemIndex) => itemIndex !== index
          )
    );
  }

  async function handleCreateEstimate() {
    setToast(null);

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Trimax is being updated. Try again in a few minutes.",
      });
      return;
    }

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });

      return;
    }

    const validLineItems = lineItems.filter(
      (item) =>
        item.description.trim() &&
        getLineTotal(item) > 0
    );

    if (
      !customerName ||
      !projectTitle ||
      validLineItems.length === 0
    ) {
      setToast({
        type: "error",
        message:
          "Please fill out customer, project title, and at least one line item.",
      });

      return;
    }

    let displayId = "";

    try {
      displayId = await getNextDocumentDisplayId({
        table: "estimates",
        prefix: "EST",
        businessId: business.id,
      });
    } catch (error) {
      console.error(error);

      setToast({
        type: "error",
        message:
          "Unable to reserve the next estimate number. Refresh the page, then try again.",
      });

      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let finalClientId =
      selectedClientId || null;

    if (!selectedClientId) {
      const {
        data: newClient,
        error: clientError,
      } = await supabase
        .from("clients")
        .insert({
          business_id: business.id,
          created_by_user_id:
            user?.id ?? null,
          name: customerName,
          billing_address: serviceAddress,
        })
        .select()
        .single();

      if (clientError || !newClient) {
        console.error(clientError);

        setToast({
          type: "error",
          message:
            "Unable to create client record.",
        });

        return;
      }

      finalClientId = newClient.id;
    }

    const { data, error } = await supabase
      .from("estimates")
      .insert({
        business_id: business.id,
        client_id: finalClientId,
        created_by_user_id:
          user?.id ?? null,
        display_id: displayId,
        queue_item_id: queueId,
        customer_name: customerName,
        project_title: projectTitle,
        project_address: serviceAddress,
        service_address: serviceAddress,
        reference: maybeCanonicalApartmentUnitLabel(reference),
        estimate_amount:
          formatCurrency(estimateTotal),
        tax_mode: taxMode,
        tax_label: taxLabel.trim() || null,
        tax_rate: getEffectiveTaxRate({ taxMode, taxRate }),
        tax_number:
          taxMode === "taxable" ? taxNumber.trim() || null : null,
        split_warning_enabled: effectiveSplitWarningEnabled,
        split_target_amount:
          effectiveSplitWarningEnabled &&
          effectiveSplitTargetAmount > 0
            ? effectiveSplitTargetAmount
            : null,
        terms,
        notes,
        status: "Draft",
      })
      .select()
      .single();

    if (error || !data) {
      console.error(error);

      setToast({
        type: "error",
        message: "Failed to create estimate.",
      });

      return;
    }

    const { error: lineItemError } =
      await supabase
        .from("estimate_line_items")
        .insert(
          validLineItems.map((item, index) => ({
            estimate_id: data.id,
            business_id: business.id,
            description: item.description.trim(),
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unitPrice) || 0,
            line_total: getLineTotal(item),
            sort_order: index,
          }))
        );

    if (lineItemError) {
      console.error(lineItemError);

      setToast({
        type: "error",
        message:
          "Estimate was created, but line items failed to save.",
      });

      return;
    }

    await captureServicesFromLineItems({
      businessId: business.id,
      lineItems: validLineItems,
    });

    if (queueId) {
      const { error: queueUpdateError } = await supabase
        .from("queue_items")
        .update({
          linked_estimate_id: data.id,
          status: "Estimate Created",
        })
        .eq("id", queueId)
        .eq("business_id", business.id);

      if (queueUpdateError) {
        console.error(queueUpdateError);
      }
    }

    await logActivity({
      businessId: business.id,
      action: "estimate.created",
      entityType: "estimate",
      entityId: data.id,
      entityLabel: displayId,
      details: {
        customerName,
        projectTitle,
        amount: formatCurrency(estimateTotal),
        lineItemCount: validLineItems.length,
        queueItemId: queueId,
        splitWarningEnabled: effectiveSplitWarningEnabled,
      },
    });

    router.push(
      `/estimates/${data.id}?business=${business.slug}`
    );
  }

  return (
    <AppShell>
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      )}

      <div className="mx-auto max-w-4xl">
        <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
          Trimax
        </p>

        <h1 className="mt-3 text-5xl font-bold">
          New Estimate
        </h1>

        {business && (
          <Card className="mt-6 border-orange-500/40">
            <p className="text-sm uppercase tracking-[0.25em] text-orange-400">
              Selected Business
            </p>

            <p className="mt-2 text-lg font-semibold">
              {business.name}
            </p>
          </Card>
        )}

        {queueItem ? (
          <Card className="mt-6 border-purple-500/40 bg-purple-500/10">
            <p className="text-sm uppercase tracking-[0.25em] text-purple-300">
              Queue Item Loaded
            </p>

            <p className="mt-2 text-lg font-semibold text-purple-100">
              {queueItem.property} - Unit {queueItem.unit}
            </p>

            <p className="mt-2 text-sm leading-6 text-purple-100/80">
              Trimax copied the property, unit, paint type, flooring, reference,
              notes, matching client address, tax suggestion, and saved service
              when available. Smoker/remediation units add Full Primer only
              when that option was requested on the queue item. Units marked
              for renovation also add Renovation and Cabinet Paint for pricing
              review. Adjust any details before saving.
            </p>
          </Card>
        ) : null}

        <Card className="mt-8">
          <div className="grid gap-5">
            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Select Existing Client
              </label>

              <select
                value={selectedClientId}
                onChange={(event) =>
                  handleClientChange(
                    event.target.value
                  )
                }
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              >
                <option value="">
                  -- Select Client --
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <InputField
              label="Customer Name"
              placeholder="Enter customer name"
              value={customerName}
              onChange={setCustomerName}
            />

            <InputField
              label="Project Title"
              placeholder="Example: Unit 204 Turn"
              value={projectTitle}
              onChange={setProjectTitle}
            />

            <InputField
              label="Service Address"
              placeholder="Job location"
              value={serviceAddress}
              onChange={handleServiceAddressChange}
            />

            <InputField
              label="Reference"
              placeholder="Example: Unit 204, PO #123, X4"
              value={reference}
              onChange={setReference}
            />

            <div className="grid gap-5 md:grid-cols-3">
              <TaxModeSelect value={taxMode} onChange={setTaxMode} />

              <InputField
                label="Tax Label"
                placeholder="Snohomish"
                value={taxLabel}
                onChange={(value) => {
                  setTaxManuallyChanged(true);
                  setTaxLabel(value);
                }}
              />

              <InputField
                label="Tax Rate (%)"
                type="number"
                placeholder="9.9"
                value={taxRate}
                onChange={(value) => {
                  setTaxManuallyChanged(true);
                  setTaxRate(value);
                }}
              />

              <InputField
                label="Tax Number"
                placeholder="Optional"
                value={taxNumber}
                onChange={setTaxNumber}
              />
            </div>

            {taxMode === "no_tax" ? (
              <p className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                No tax selected. Trimax will calculate this estimate with a
                $0.00 tax line.
              </p>
            ) : null}

            {taxMode === "tax_exempt" ? (
              <p className="rounded-2xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm leading-6 text-zinc-400">
                Tax exempt selected. Trimax will show Tax exempt with a $0.00
                tax line.
              </p>
            ) : null}

            {showTaxSuggestionNote ? (
              <p className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm leading-6 text-orange-100/80">
                Tax suggestion applied from service address. You can override
                the tax label or rate.
              </p>
            ) : null}

            {shouldAutoEnableSplitWarning &&
            !splitWarningManuallyChanged ? (
              <p className="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm leading-6 text-purple-100/80">
                Apartment unit paint billing detected. Split warning is on for
                this job only. Fence, tree, remodel, and other general project
                estimates stay normal unless you turn this on yourself.
              </p>
            ) : null}

            <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
              <input
                type="checkbox"
                checked={effectiveSplitWarningEnabled}
                onChange={(event) => {
                  setSplitWarningManuallyChanged(true);
                  setSplitWarningEnabled(event.target.checked);
                }}
                className="mt-1 h-5 w-5 accent-orange-500"
              />

              <span>
                <span className="block font-semibold text-white">
                  Use apartment split warning for this job
                </span>

                <span className="mt-1 block text-sm leading-6 text-zinc-400">
                  Turn this on only for unit paint work that should stay below
                  the approved invoice amount. Leave it off for normal jobs,
                  including North Creek fences, trees, repairs, or remodels.
                </span>
              </span>
            </label>

            <InputField
              label="Split Target Amount"
              type="number"
              placeholder={
                splitWarningAmount > 0
                  ? `Default: ${formatCurrency(splitWarningAmount)}`
                  : "Example: 1300"
              }
              value={splitTargetAmount}
              onChange={setSplitTargetAmount}
            />

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">
                  Line Items
                </h2>

                <Button
                  variant="secondary"
                  onClick={addLineItem}
                >
                  Add Line
                </Button>
              </div>

              <div className="mt-4 grid gap-4">
                {lineItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <div>
                      <label className="mb-2 block text-sm text-zinc-400">
                        Saved Service
                      </label>

                      <select
                        value={item.serviceItemId}
                        onChange={(event) =>
                          handleServiceChange(
                            index,
                            event.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                      >
                        <option value="">
                          -- Custom Line Item --
                        </option>

                        {serviceItems.map((serviceItem) => (
                          <option
                            key={serviceItem.id}
                            value={serviceItem.id}
                          >
                            {serviceDisplayLabel(serviceItem)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_120px_140px_120px_auto]">
                      <InputField
                        label="Description"
                        placeholder="Labor, materials, paint..."
                        value={item.description}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "description",
                            value
                          )
                        }
                      />

                      <InputField
                        label="Qty"
                        type="number"
                        value={item.quantity}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "quantity",
                            value
                          )
                        }
                      />

                      <InputField
                        label="Unit Price"
                        type="number"
                        value={item.unitPrice}
                        onChange={(value) =>
                          updateLineItem(
                            index,
                            "unitPrice",
                            value
                          )
                        }
                      />

                      <div>
                        <p className="mb-2 text-sm text-zinc-400">
                          Total
                        </p>

                        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-semibold text-orange-400">
                          {formatCurrency(
                            getLineTotal(item)
                          )}
                        </p>
                      </div>

                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            removeLineItem(index)
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ml-auto mt-6 grid max-w-sm gap-3 text-sm">
                <SummaryRow
                  label="Subtotal"
                  value={formatCurrency(subtotal)}
                />

                <SummaryRow
                  label={formatTaxSummaryLabel({
                    label: taxLabel,
                    rate: taxRate,
                    taxNumber,
                    taxMode,
                  })}
                  value={formatCurrency(taxAmount)}
                />

                <div className="border-t border-zinc-700 pt-3">
                  <SummaryRow
                    label="Estimate Total"
                    value={formatCurrency(estimateTotal)}
                    strong
                  />
                </div>
              </div>

              {showSplitWarning && (
                <div className="mt-6 rounded-2xl border border-yellow-500/60 bg-yellow-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-yellow-300">
                    Split Warning
                  </p>

                  <p className="mt-2 text-lg font-semibold text-yellow-100">
                    This estimate would be over{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} after tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                    Consider splitting this apartment work into smaller invoices
                    or estimates before sending.
                  </p>
                </div>
              )}

              {splitPreview && (
                <div className="mt-4 rounded-2xl border border-orange-500/50 bg-orange-500/10 p-4">
                  <p className="text-sm uppercase tracking-[0.25em] text-orange-300">
                    Split Preview
                  </p>

                  <p className="mt-2 text-lg font-semibold text-orange-100">
                    This would become {splitPreview.length} invoices after
                    conversion. No split invoice would exceed{" "}
                    {formatCurrency(effectiveSplitTargetAmount)} including tax.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-orange-100/80">
                    Save the estimate first. When it is converted, Trimax will
                    create the split invoice drafts automatically.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Scope of Work
              </label>

              <textarea
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value)
                }
                placeholder="Describe the project scope..."
                className="min-h-32 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Terms
              </label>

              <textarea
                value={terms}
                onChange={(event) =>
                  setTerms(event.target.value)
                }
                placeholder="Estimate terms..."
                className="min-h-32 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <Button onClick={handleCreateEstimate}>
                Create Estimate
              </Button>

              <Button
                variant="secondary"
                onClick={resetForm}
              >
                Start Over
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/estimates?business=${businessSlug}`
                  )
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        strong ? "text-lg font-bold text-orange-400" : ""
      }`}
    >
      <span className="text-zinc-400">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}

export default function NewEstimatePage() {
  return (
    <Suspense>
      <NewEstimatePageContent />
    </Suspense>
  );
}
