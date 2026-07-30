export type SavedServiceLike = {
  id: string;
  name: string;
  description: string | null;
  default_quantity: number | string | null;
  default_unit_price: number | string | null;
  category: string | null;
};

function normalizeServiceText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePrice(value: string | number | null | undefined) {
  return Math.round((Number(value) || 0) * 100);
}

export function savedServiceDisplayKey(service: SavedServiceLike) {
  return [
    normalizeServiceText(service.category),
    normalizeServiceText(service.name),
    normalizeServiceText(service.description),
    normalizePrice(service.default_unit_price),
    Number(service.default_quantity) || 1,
  ].join("|");
}

export function uniqueSavedServices<T extends SavedServiceLike>(services: T[]) {
  const byKey = new Map<string, T>();

  services.forEach((service) => {
    const key = savedServiceDisplayKey(service);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, service);
      return;
    }

    if (service.category !== "Auto Captured" && existing.category === "Auto Captured") {
      byKey.set(key, service);
    }
  });

  return Array.from(byKey.values());
}

export function serviceSearchText(service: SavedServiceLike) {
  return [
    service.category,
    service.name,
    service.description,
    service.default_unit_price,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
