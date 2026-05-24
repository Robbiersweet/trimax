export type TaxSuggestion = {
  label: string;
  rate: string;
};

const snohomishZipCodes = [
  "98201",
  "98203",
  "98204",
  "98205",
  "98206",
  "98208",
  "98275",
  "98290",
  "98291",
  "98296",
];

export function getTaxSuggestionForAddress(
  address: string
): TaxSuggestion | null {
  const normalizedAddress = address.toLowerCase();

  const isSnohomishArea =
    normalizedAddress.includes("everett") ||
    normalizedAddress.includes("snohomish") ||
    snohomishZipCodes.some((zipCode) =>
      normalizedAddress.includes(zipCode)
    );

  if (isSnohomishArea) {
    return {
      label: "Snohomish",
      rate: "9.9",
    };
  }

  return null;
}
