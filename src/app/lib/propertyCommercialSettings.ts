import type { TaxMode } from "../utils/tax";

export type ClientCommercialSettings = {
  tax_mode?: TaxMode | string | null;
  tax_label?: string | null;
  tax_rate?: number | string | null;
  tax_number?: string | null;
  auto_split_enabled?: boolean | null;
  split_target_amount?: number | string | null;
};

export type ServicePriceOverride = {
  client_id: string | null;
  service_item_id: string | null;
  unit_price: number | string | null;
  description?: string | null;
  is_active?: boolean | null;
};

export type ServicePricingSource = "client_override" | "normal_tier" | "default";

export type ServicePricingResolution = {
  unitPrice: number;
  description: string | null;
  source: ServicePricingSource;
};

export function toCommercialNumber(
  value: number | string | null | undefined
) {
  return Number(value) || 0;
}

export function normalizeClientTaxMode(
  taxMode: TaxMode | string | null | undefined
): TaxMode {
  return taxMode === "no_tax" || taxMode === "tax_exempt"
    ? taxMode
    : "taxable";
}

export function hasClientTaxProfile(client: ClientCommercialSettings | null) {
  if (!client) {
    return false;
  }

  return Boolean(
    client.tax_mode === "no_tax" || client.tax_mode === "tax_exempt" ||
      client.tax_label?.trim() ||
      toCommercialNumber(client.tax_rate) > 0 ||
      client.tax_number?.trim()
  );
}

export function getClientTaxSettings(client: ClientCommercialSettings) {
  const taxMode = normalizeClientTaxMode(client.tax_mode);

  return {
    taxMode,
    taxLabel:
      taxMode === "taxable" ? client.tax_label?.trim() ?? "" : "",
    taxRate:
      taxMode === "taxable" && client.tax_rate != null && (toCommercialNumber(client.tax_rate) > 0 || Boolean(client.tax_label?.trim()))
        ? String(toCommercialNumber(client.tax_rate))
        : "",
    taxNumber:
      taxMode === "taxable" ? client.tax_number?.trim() ?? "" : "",
  };
}

export function getClientSplitPolicy(
  client: ClientCommercialSettings | null,
  fallbackSplitTargetAmount: number | string | null | undefined
) {
  const clientTarget = toCommercialNumber(client?.split_target_amount);
  const fallbackTarget = toCommercialNumber(fallbackSplitTargetAmount);

  return {
    autoSplitEnabled: Boolean(client?.auto_split_enabled),
    splitTargetAmount:
      clientTarget > 0 ? clientTarget : fallbackTarget > 0 ? fallbackTarget : 0,
  };
}

export function findServicePriceOverride({
  overrides,
  clientId,
  serviceItemId,
}: {
  overrides: ServicePriceOverride[];
  clientId: string | null | undefined;
  serviceItemId: string | null | undefined;
}) {
  if (!clientId || !serviceItemId) {
    return null;
  }

  return (
    overrides.find(
      (override) =>
        override.client_id === clientId &&
        override.service_item_id === serviceItemId &&
        override.is_active !== false &&
        toCommercialNumber(override.unit_price) > 0
    ) ?? null
  );
}

export function resolveServicePricing({
  service,
  overrides,
  clientId,
  normalTierPrice,
}: {
  service: {
    id: string;
    description: string | null;
    name: string;
    default_unit_price: number | string | null;
  };
  overrides: ServicePriceOverride[];
  clientId: string | null | undefined;
  normalTierPrice?: number | null;
}): ServicePricingResolution {
  const override = findServicePriceOverride({
    overrides,
    clientId,
    serviceItemId: service.id,
  });

  if (override) {
    return {
      unitPrice: toCommercialNumber(override.unit_price),
      description: override.description?.trim() || service.description || service.name,
      source: "client_override",
    };
  }

  const tierPrice = toCommercialNumber(normalTierPrice);

  if (tierPrice > 0) {
    return {
      unitPrice: tierPrice,
      description: service.description || service.name,
      source: "normal_tier",
    };
  }

  return {
    unitPrice: toCommercialNumber(service.default_unit_price),
    description: service.description || service.name,
    source: "default",
  };
}
