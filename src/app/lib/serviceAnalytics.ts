export type ServiceAnalyticsService = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  default_quantity?: number | string | null;
  default_unit_price?: number | string | null;
  easy_unit_price?: number | string | null;
  normal_unit_price?: number | string | null;
  difficult_unit_price?: number | string | null;
};

export type ServiceAnalyticsLineItem = {
  description: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total?: number | string | null;
  created_at?: string | null;
  source?: "estimate" | "invoice" | "service";
};

export type ServiceAnalyticsRow = {
  serviceName: string;
  category: string;
  unitType: string;
  usageCount: number;
  averageUnitPrice: number;
  medianUnitPrice: number;
  lowestUnitPrice: number;
  highestUnitPrice: number;
  mostRecentUnitPrice: number;
  sourceCount: {
    estimates: number;
    invoices: number;
    savedService: number;
  };
};

function moneyNumber(value: number | string | null | undefined) {
  const parsed =
    typeof value === "string"
      ? Number(value.replace(/[^0-9.-]/g, ""))
      : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeServiceText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(unit\s+[a-z]?\d{1,3}|apt\s+[a-z]?\d{1,3})\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanServiceName(value: string | null | undefined) {
  const trimmed = (value || "").trim();

  return (
    trimmed
      .replace(/^.*?\bunit\s+[a-z]?\d{1,3}\s*[-:]\s*/i, "")
      .replace(/^[a-z]?\d{1,3}\s*[-:]\s*/i, "")
      .replace(/^freshbooks\s+line\s+item\s*[-:]\s*/i, "")
      .trim() || "Uncategorized Service"
  );
}

function inferUnitType(description: string) {
  const text = description.toLowerCase();

  if (/\b(sq\.?\s*ft|square\s+feet|sqft|sf)\b/.test(text)) {
    return "sq ft";
  }

  if (/\b(linear\s+feet|linear\s+foot|lin\.?\s*ft|lf)\b/.test(text)) {
    return "linear ft";
  }

  if (/\b(hours?|hrs?)\b/.test(text)) {
    return "hour";
  }

  if (/\b(each|ea|outlets?|doors?|windows?|rooms?|units?)\b/.test(text)) {
    return "each";
  }

  if (/\b(days?)\b/.test(text)) {
    return "day";
  }

  return "unit";
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function serviceKeyFromService(service: ServiceAnalyticsService) {
  return (
    normalizeServiceText(service.name) ||
    normalizeServiceText(service.description) ||
    service.id
  );
}

function findMatchingService(
  lineDescription: string,
  services: ServiceAnalyticsService[],
  serviceKeys: Map<string, ServiceAnalyticsService>
) {
  const normalizedLine = normalizeServiceText(lineDescription);

  if (serviceKeys.has(normalizedLine)) {
    return serviceKeys.get(normalizedLine) ?? null;
  }

  return (
    services.find((service) => {
      const name = normalizeServiceText(service.name);
      const description = normalizeServiceText(service.description);

      return (
        (name && (normalizedLine.includes(name) || name.includes(normalizedLine))) ||
        (description &&
          (normalizedLine.includes(description) ||
            description.includes(normalizedLine)))
      );
    }) ?? null
  );
}

export function buildServiceAnalyticsRows({
  services,
  estimateLineItems,
  invoiceLineItems,
}: {
  services: ServiceAnalyticsService[];
  estimateLineItems: ServiceAnalyticsLineItem[];
  invoiceLineItems: ServiceAnalyticsLineItem[];
}) {
  const serviceKeys = new Map(
    services.map((service) => [serviceKeyFromService(service), service])
  );
  const groups = new Map<
    string,
    {
      serviceName: string;
      category: string;
      unitType: string;
      prices: number[];
      mostRecentUnitPrice: number;
      mostRecentDate: string;
      sourceCount: ServiceAnalyticsRow["sourceCount"];
    }
  >();

  function ensureGroup({
    key,
    serviceName,
    category,
    unitType,
  }: {
    key: string;
    serviceName: string;
    category: string;
    unitType: string;
  }) {
    const existing = groups.get(key);

    if (existing) {
      return existing;
    }

    const created = {
      serviceName,
      category,
      unitType,
      prices: [] as number[],
      mostRecentUnitPrice: 0,
      mostRecentDate: "",
      sourceCount: {
        estimates: 0,
        invoices: 0,
        savedService: 0,
      },
    };

    groups.set(key, created);

    return created;
  }

  services.forEach((service) => {
    const defaultPrice = moneyNumber(service.default_unit_price);
    const key = serviceKeyFromService(service);
    const group = ensureGroup({
      key,
      serviceName: cleanServiceName(service.name),
      category: service.category?.trim() || "Uncategorized",
      unitType: inferUnitType(
        `${service.name} ${service.description ?? ""}`
      ),
    });

    group.sourceCount.savedService = 1;

    if (defaultPrice > 0) {
      group.prices.push(defaultPrice);
      group.mostRecentUnitPrice = defaultPrice;
      group.mostRecentDate = "service";
    }
  });

  function addLineItem(
    lineItem: ServiceAnalyticsLineItem,
    source: "estimate" | "invoice"
  ) {
    const description = cleanServiceName(lineItem.description);
    const unitPrice = moneyNumber(lineItem.unit_price);

    if (!description || unitPrice <= 0) {
      return;
    }

    const matchingService = findMatchingService(
      description,
      services,
      serviceKeys
    );
    const key = matchingService
      ? serviceKeyFromService(matchingService)
      : normalizeServiceText(description);
    const group = ensureGroup({
      key,
      serviceName: matchingService
        ? cleanServiceName(matchingService.name)
        : description,
      category:
        matchingService?.category?.trim() ||
        (source === "invoice" ? "Imported / Invoiced" : "Estimated"),
      unitType: inferUnitType(description),
    });

    group.prices.push(unitPrice);

    if (source === "estimate") {
      group.sourceCount.estimates += 1;
    } else {
      group.sourceCount.invoices += 1;
    }

    const createdAt = lineItem.created_at ?? "";

    if (!group.mostRecentDate || createdAt >= group.mostRecentDate) {
      group.mostRecentDate = createdAt || group.mostRecentDate;
      group.mostRecentUnitPrice = unitPrice;
    }
  }

  estimateLineItems.forEach((lineItem) => addLineItem(lineItem, "estimate"));
  invoiceLineItems.forEach((lineItem) => addLineItem(lineItem, "invoice"));

  return Array.from(groups.values())
    .map<ServiceAnalyticsRow>((group) => {
      const usageCount =
        group.sourceCount.estimates + group.sourceCount.invoices;
      const prices = group.prices;
      const total = prices.reduce((sum, price) => sum + price, 0);

      return {
        serviceName: group.serviceName,
        category: group.category,
        unitType: group.unitType,
        usageCount,
        averageUnitPrice: prices.length > 0 ? total / prices.length : 0,
        medianUnitPrice: median(prices),
        lowestUnitPrice: prices.length > 0 ? Math.min(...prices) : 0,
        highestUnitPrice: prices.length > 0 ? Math.max(...prices) : 0,
        mostRecentUnitPrice: group.mostRecentUnitPrice,
        sourceCount: group.sourceCount,
      };
    })
    .sort((first, second) => {
      if (second.usageCount !== first.usageCount) {
        return second.usageCount - first.usageCount;
      }

      return first.serviceName.localeCompare(second.serviceName);
    });
}
