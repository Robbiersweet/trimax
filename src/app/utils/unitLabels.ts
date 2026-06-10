export function canonicalApartmentUnitLabel(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/\s+/g, "").toUpperCase();
  const match = normalized.match(/^([A-Z])0*([1-9]\d?)$/);

  if (!match) {
    return normalized;
  }

  const [, buildingLetter, unitNumber] = match;
  const parsedUnitNumber = Number(unitNumber);

  if (!Number.isInteger(parsedUnitNumber) || parsedUnitNumber < 1) {
    return normalized;
  }

  return `${buildingLetter}${String(parsedUnitNumber).padStart(2, "0")}`;
}

export function maybeCanonicalApartmentUnitLabel(
  value: string | null | undefined
) {
  const trimmed = (value || "").trim();
  const normalized = canonicalApartmentUnitLabel(trimmed);

  return normalized || trimmed;
}
