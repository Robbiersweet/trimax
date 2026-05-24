export type TaxSuggestion = {
  label: string;
  rate: string;
};

type TaxArea = TaxSuggestion & {
  cities: string[];
  zipCodes: string[];
};

// Temporary helper. Replace with the official WA DOR address lookup later.
const taxAreas: TaxArea[] = [
  {
    label: "Tacoma",
    rate: "10.4",
    cities: ["tacoma"],
    zipCodes: [
      "98402",
      "98403",
      "98404",
      "98405",
      "98406",
      "98407",
      "98408",
      "98409",
      "98418",
      "98421",
      "98422",
      "98424",
      "98433",
      "98444",
      "98445",
      "98446",
      "98465",
      "98466",
      "98467",
    ],
  },
  {
    label: "Seattle",
    rate: "10.35",
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
    label: "Snohomish",
    rate: "9.9",
    cities: [
      "everett",
      "snohomish",
      "mill creek",
      "mukilteo",
    ],
    zipCodes: [
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
    ],
  },
  {
    label: "Lynnwood",
    rate: "10.6",
    cities: ["lynnwood"],
    zipCodes: ["98036", "98037", "98087"],
  },
  {
    label: "Marysville",
    rate: "9.4",
    cities: ["marysville"],
    zipCodes: ["98270", "98271"],
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
