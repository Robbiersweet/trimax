export type ServiceCleanupItem = {
  id: string;
  business_id?: string | null;
  name: string;
  description: string | null;
  default_quantity: number | string | null;
  default_unit_price: number | string | null;
  category: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

export type ServiceCleanupGroup = {
  key: string;
  canonical: ServiceCleanupItem;
  services: ServiceCleanupItem[];
  redundantServices: ServiceCleanupItem[];
};

export type ServicePriceConflictGroup = {
  key: string;
  services: ServiceCleanupItem[];
  prices: number[];
};

export type ServiceCleanupAudit = {
  totalServices: number;
  exactDuplicateGroups: ServiceCleanupGroup[];
  priceConflictGroups: ServicePriceConflictGroup[];
  zeroPriceArtifactGroups: ServiceCleanupGroup[];
  incompleteServices: ServiceCleanupItem[];
};

function normalizeServiceText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(copy|duplicate|dup)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuantity(value: string | number | null | undefined) {
  return Number(value) || 1;
}

function normalizePriceCents(value: string | number | null | undefined) {
  return Math.round((Number(value) || 0) * 100);
}

export function serviceIdentityKey(service: ServiceCleanupItem) {
  return [
    normalizeServiceText(service.business_id),
    normalizeServiceText(service.name),
    normalizeServiceText(service.category),
    normalizeServiceText(service.description),
    normalizeQuantity(service.default_quantity),
  ].join("|");
}

export function serviceExactDuplicateKey(service: ServiceCleanupItem) {
  return [
    serviceIdentityKey(service),
    normalizePriceCents(service.default_unit_price),
  ].join("|");
}

export function serviceCompletenessScore(service: ServiceCleanupItem) {
  return [
    Boolean(service.name?.trim()),
    Boolean(service.category?.trim()),
    Boolean(service.description?.trim()),
    normalizePriceCents(service.default_unit_price) > 0,
  ].filter(Boolean).length;
}

function createdAtTime(service: ServiceCleanupItem) {
  const time = service.created_at ? Date.parse(service.created_at) : NaN;

  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

export function chooseCanonicalService(services: ServiceCleanupItem[]) {
  return [...services].sort((first, second) => {
    const activeScore =
      Number(Boolean(second.is_active)) - Number(Boolean(first.is_active));

    if (activeScore !== 0) {
      return activeScore;
    }

    const priceScore =
      Number(normalizePriceCents(second.default_unit_price) > 0) -
      Number(normalizePriceCents(first.default_unit_price) > 0);

    if (priceScore !== 0) {
      return priceScore;
    }

    const completenessScore =
      serviceCompletenessScore(second) - serviceCompletenessScore(first);

    if (completenessScore !== 0) {
      return completenessScore;
    }

    const createdCompare = createdAtTime(first) - createdAtTime(second);

    if (createdCompare !== 0) {
      return createdCompare;
    }

    return first.id.localeCompare(second.id);
  })[0];
}

function groupsByKey<T extends ServiceCleanupItem>(
  services: T[],
  keyFor: (service: T) => string
) {
  const groups = new Map<string, T[]>();

  services.forEach((service) => {
    const key = keyFor(service);

    if (!key.replace(/\|/g, "")) {
      return;
    }

    groups.set(key, [...(groups.get(key) ?? []), service]);
  });

  return groups;
}

function toCleanupGroup(key: string, services: ServiceCleanupItem[]) {
  const canonical = chooseCanonicalService(services);

  return {
    key,
    canonical,
    services,
    redundantServices: services.filter((service) => service.id !== canonical.id),
  };
}

export function buildServiceCleanupAudit(
  services: ServiceCleanupItem[]
): ServiceCleanupAudit {
  const exactDuplicateGroups = Array.from(
    groupsByKey(services, serviceExactDuplicateKey).entries()
  )
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => toCleanupGroup(key, group));

  const priceConflictGroups = Array.from(
    groupsByKey(services, serviceIdentityKey).entries()
  )
    .map(([key, group]) => ({
      key,
      services: group,
      prices: Array.from(
        new Set(group.map((service) => normalizePriceCents(service.default_unit_price)))
      ).sort((first, second) => first - second),
    }))
    .filter((group) => {
      const meaningfulPrices = group.prices.filter((price) => price > 0);

      return meaningfulPrices.length > 1;
    });

  const zeroPriceArtifactGroups = Array.from(
    groupsByKey(services, serviceIdentityKey).entries()
  )
    .filter(([, group]) => {
      const hasZero = group.some(
        (service) => normalizePriceCents(service.default_unit_price) === 0
      );
      const hasPriced = group.some(
        (service) => normalizePriceCents(service.default_unit_price) > 0
      );

      return hasZero && hasPriced;
    })
    .map(([key, group]) => toCleanupGroup(key, group));

  return {
    totalServices: services.length,
    exactDuplicateGroups,
    priceConflictGroups,
    zeroPriceArtifactGroups,
    incompleteServices: services.filter(
      (service) =>
        Boolean(service.is_active) &&
        (serviceCompletenessScore(service) < 4 ||
          normalizePriceCents(service.default_unit_price) <= 0)
    ),
  };
}

export function findCanonicalServiceForCapture({
  existingServices,
  businessId,
  name,
  description,
  category,
}: {
  existingServices: ServiceCleanupItem[];
  businessId: string;
  name: string;
  description: string | null;
  category: string | null;
}) {
  const incomingKey = serviceIdentityKey({
    id: "incoming",
    business_id: businessId,
    name,
    description,
    category,
    default_quantity: 1,
    default_unit_price: 0,
    is_active: true,
  });
  const candidates = existingServices.filter(
    (service) =>
      Boolean(service.is_active) && serviceIdentityKey(service) === incomingKey
  );

  return candidates.length > 0 ? chooseCanonicalService(candidates) : null;
}
