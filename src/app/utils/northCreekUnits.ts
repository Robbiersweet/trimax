import { canonicalApartmentUnitLabel } from "./unitLabels";

export type ConfirmedNorthCreekBuilding = {
  buildingLetter: string;
  unitCount: number;
  floorplan: "2x1" | "2x2" | "mixed";
};

export type ConfirmedNorthCreekUnit = {
  building_letter: string;
  unit_number: number;
  unit_label: string;
  floor: "bottom" | "top";
  floorplan: "2x1" | "2x2";
};

export const confirmedNorthCreekBuildings: ConfirmedNorthCreekBuilding[] = [
  { buildingLetter: "A", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "B", unitCount: 12, floorplan: "2x2" },
  { buildingLetter: "C", unitCount: 8, floorplan: "2x1" },
  { buildingLetter: "D", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "E", unitCount: 8, floorplan: "2x1" },
  { buildingLetter: "F", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "G", unitCount: 12, floorplan: "2x2" },
  { buildingLetter: "H", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "I", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "J", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "K", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "L", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "M", unitCount: 12, floorplan: "2x2" },
  { buildingLetter: "N", unitCount: 8, floorplan: "mixed" },
  { buildingLetter: "O", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "P", unitCount: 8, floorplan: "2x1" },
  { buildingLetter: "Q", unitCount: 8, floorplan: "2x1" },
  { buildingLetter: "R", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "S", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "T", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "U", unitCount: 12, floorplan: "2x2" },
  { buildingLetter: "V", unitCount: 12, floorplan: "2x2" },
  { buildingLetter: "W", unitCount: 8, floorplan: "2x2" },
  { buildingLetter: "X", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "Y", unitCount: 12, floorplan: "2x1" },
  { buildingLetter: "Z", unitCount: 12, floorplan: "2x2" },
];

export function northCreekFloorplan(
  buildingLetter: string,
  unitNumber: number
) {
  if (buildingLetter === "N") {
    return unitNumber <= 4 ? "2x1" : "2x2";
  }

  return confirmedNorthCreekBuildings.find(
    (building) => building.buildingLetter === buildingLetter
  )?.floorplan === "2x1"
    ? "2x1"
    : "2x2";
}

export const confirmedNorthCreekUnits = confirmedNorthCreekBuildings.flatMap(
  (building) =>
    Array.from({ length: building.unitCount }, (_, index) => {
      const unitNumber = index + 1;

      return {
        building_letter: building.buildingLetter,
        unit_number: unitNumber,
        unit_label: canonicalApartmentUnitLabel(
          `${building.buildingLetter}${unitNumber}`
        ),
        floor: unitNumber % 2 === 1 ? "bottom" : "top",
        floorplan: northCreekFloorplan(building.buildingLetter, unitNumber),
      } satisfies ConfirmedNorthCreekUnit;
    })
);

export const confirmedNorthCreekUnitCount = confirmedNorthCreekUnits.length;

export function getConfirmedNorthCreekUnit(
  value: string | null | undefined
) {
  const unitLabel = canonicalApartmentUnitLabel(value);

  if (!unitLabel) {
    return null;
  }

  return (
    confirmedNorthCreekUnits.find((unit) => unit.unit_label === unitLabel) ??
    null
  );
}
