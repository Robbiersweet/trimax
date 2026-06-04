export type TaxSuggestion = {
  label: string;
  rate: string;
};

type TaxArea = TaxSuggestion & {
  cities: string[];
  zipCodes: string[];
};

// Temporary Washington helper for the main R&L service area.
// Rates change and ZIP codes can cross tax boundaries, so this should be
// replaced with the official WA DOR address lookup before production billing.
const taxAreas: TaxArea[] = [
  {
    label: "Everett",
    rate: "9.9",
    cities: ["everett"],
    zipCodes: ["98201", "98203", "98204", "98205", "98206", "98208"],
  },
  {
    label: "Marysville",
    rate: "9.4",
    cities: ["marysville"],
    zipCodes: ["98270", "98271"],
  },
  {
    label: "Lake Stevens",
    rate: "9.3",
    cities: ["lake stevens"],
    zipCodes: ["98258"],
  },
  {
    label: "Snohomish",
    rate: "9.3",
    cities: ["snohomish"],
    zipCodes: ["98290", "98291", "98296"],
  },
  {
    label: "Monroe",
    rate: "9.4",
    cities: ["monroe"],
    zipCodes: ["98272"],
  },
  {
    label: "Mukilteo",
    rate: "10.6",
    cities: ["mukilteo"],
    zipCodes: ["98275"],
  },
  {
    label: "Mill Creek",
    rate: "10.6",
    cities: ["mill creek"],
    zipCodes: ["98012", "98082"],
  },
  {
    label: "Lynnwood",
    rate: "10.7",
    cities: ["lynnwood"],
    zipCodes: ["98036", "98037", "98046", "98087"],
  },
  {
    label: "Edmonds",
    rate: "10.7",
    cities: ["edmonds"],
    zipCodes: ["98020", "98026"],
  },
  {
    label: "Mountlake Terrace",
    rate: "10.5",
    cities: ["mountlake terrace"],
    zipCodes: ["98043"],
  },
  {
    label: "Bothell",
    rate: "10.5",
    cities: ["bothell"],
    zipCodes: ["98011", "98012", "98021", "98041"],
  },
  {
    label: "Arlington",
    rate: "9.3",
    cities: ["arlington"],
    zipCodes: ["98223"],
  },
  {
    label: "Stanwood",
    rate: "9.3",
    cities: ["stanwood"],
    zipCodes: ["98292"],
  },
  {
    label: "Granite Falls",
    rate: "9.1",
    cities: ["granite falls"],
    zipCodes: ["98252"],
  },
  {
    label: "Sultan",
    rate: "9.1",
    cities: ["sultan"],
    zipCodes: ["98294"],
  },
  {
    label: "Gold Bar",
    rate: "9.1",
    cities: ["gold bar"],
    zipCodes: ["98251"],
  },
  {
    label: "Mount Vernon",
    rate: "8.9",
    cities: ["mount vernon", "mt vernon"],
    zipCodes: ["98273", "98274"],
  },
  {
    label: "Burlington",
    rate: "8.9",
    cities: ["burlington"],
    zipCodes: ["98233"],
  },
  {
    label: "Sedro-Woolley",
    rate: "8.7",
    cities: ["sedro-woolley", "sedro woolley"],
    zipCodes: ["98284"],
  },
  {
    label: "Anacortes",
    rate: "8.9",
    cities: ["anacortes"],
    zipCodes: ["98221"],
  },
  {
    label: "La Conner",
    rate: "8.8",
    cities: ["la conner"],
    zipCodes: ["98257"],
  },
  {
    label: "Seattle",
    rate: "10.55",
    cities: ["seattle"],
    zipCodes: [
      "98101",
      "98102",
      "98103",
      "98104",
      "98105",
      "98106",
      "98107",
      "98108",
      "98109",
      "98112",
      "98115",
      "98116",
      "98117",
      "98118",
      "98119",
      "98121",
      "98122",
      "98125",
      "98126",
      "98133",
      "98134",
      "98136",
      "98144",
      "98146",
      "98177",
      "98178",
      "98199",
    ],
  },
  {
    label: "Shoreline",
    rate: "10.5",
    cities: ["shoreline"],
    zipCodes: ["98133", "98155", "98177"],
  },
  {
    label: "Kenmore",
    rate: "10.3",
    cities: ["kenmore"],
    zipCodes: ["98028"],
  },
  {
    label: "Woodinville",
    rate: "10.3",
    cities: ["woodinville"],
    zipCodes: ["98072"],
  },
];

export function getTaxSuggestionForAddress(
  address: string
): TaxSuggestion | null {
  const normalizedAddress = address.toLowerCase();

  const matchedArea = taxAreas.find((area) => {
    const cityMatches = area.cities.some((city) =>
      normalizedAddress.includes(city)
    );
    const zipMatches = area.zipCodes.some((zipCode) =>
      normalizedAddress.includes(zipCode)
    );

    return cityMatches || zipMatches;
  });

  return matchedArea
    ? {
        label: matchedArea.label,
        rate: matchedArea.rate,
      }
    : null;
}

export function formatTaxSummaryLabel({
  label,
  rate,
  taxNumber,
}: {
  label: string | null | undefined;
  rate: number | string | null | undefined;
  taxNumber?: string | null;
}) {
  const taxRate = Number(rate) || 0;
  const baseLabel = `${label || "Tax"} (${taxRate}%)`;
  const trimmedTaxNumber = taxNumber?.trim();

  return trimmedTaxNumber
    ? `${baseLabel} | Tax #${trimmedTaxNumber}`
    : baseLabel;
}
