import type { Evidence, Figure, MenuId } from "./types";

export function evidenceLabel(evidence: Evidence): string {
  switch (evidence) {
    case "derived_estimate":
      return "Derived estimate";
    case "academic_estimate":
      return "Academic estimate";
    case "company_measurement":
      return "Company measurement";
    case "company_claim":
      return "Company claim";
    case "lifecycle_assessment":
      return "Lifecycle study";
    case "journalism_estimate":
      return "Reported estimate";
    case "company_disclosure":
      return "Company disclosure";
    case "utility_meter":
      return "Utility meter";
    case "contract_peak":
      return "Contract peak";
    case "requested_cap":
      return "Requested cap";
    case "design_capacity":
      return "Design only";
    case "gap":
      return "No figure";
    default: {
      const neverEvidence: never = evidence;
      return neverEvidence;
    }
  }
}

export function formatAmount(value: number | null, unit: string): string {
  if (value == null) {
    return "No cited figure";
  }
  if (unit === "mL") {
    if (value >= 100) {
      return `${Math.round(value).toLocaleString("en-US")} mL`;
    }
    if (value >= 10) {
      return `${value.toFixed(1)} mL`;
    }
    return `${value.toFixed(2)} mL`;
  }
  if (unit === "gal/day") {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)} million gal/day`;
    }
    return `${Math.round(value).toLocaleString("en-US")} gal/day`;
  }
  return `${value.toLocaleString("en-US")} ${unit}`;
}

export function formatRange(figure: Figure): string | null {
  if (figure.rangeLow == null || figure.rangeHigh == null) {
    return null;
  }
  return `${formatAmount(figure.rangeLow, figure.unit)} – ${formatAmount(figure.rangeHigh, figure.unit)}`;
}

export function campusLabel(gallons: number): string {
  if (gallons >= 1_000_000) {
    const millions = gallons / 1_000_000;
    const digits = gallons % 1_000_000 === 0 ? 0 : 2;
    return `${millions.toFixed(digits)} million gal/day`;
  }
  return `${Math.round(gallons).toLocaleString("en-US")} gal/day`;
}

export function legendFor(menu: MenuId, dropMl: number, modelCapacityMl: number, campusCapacityGal: number): string {
  switch (menu) {
    case "model":
      return `The model glass is etched at ${modelCapacityMl} mL. It is a tapered tumbler, so height is real volume and the marks sit closer together near the rim. The plaque prints the cited milliliters. One drop is one short GPT-4o query (${dropMl.toFixed(2)} mL). Amounts from under a milliliter through about 25 mL stay in the glass and pour as drops or a stream. Past ${modelCapacityMl} mL the tumbler spills and the plaque says Exceeds glass.`;
    case "datacenter":
      return `The campus glass is etched at ${campusLabel(campusCapacityGal)}. Fill is the cited daily figure on that scale. It does not use the ${modelCapacityMl} mL query etching. The badge says whether the number is consumption, withdrawal, a utility meter, a contract peak, or a requested cap.`;
    default: {
      const neverMenu: never = menu;
      return neverMenu;
    }
  }
}

export interface EtchMark {
  fraction: number;
  label: string;
}

export function etchMarks(menu: MenuId, capacity: number, dropMl: number): EtchMark[] {
  switch (menu) {
    case "datacenter":
      return [1, 2, 3, 4].map((millions) => ({
        fraction: (millions * 1_000_000) / capacity,
        label: `${millions}M`,
      }));
    case "model": {
      const marks: EtchMark[] = [0.25, 0.5, 0.75, 1].map((fraction) => ({
        fraction,
        label: fraction === 1 ? `${Math.round(capacity * fraction)} mL` : `${Math.round(capacity * fraction)}`,
      }));
      const dropFraction = dropMl / capacity;
      if (dropFraction > 0.02 && dropFraction < 0.2) {
        marks.unshift({ fraction: dropFraction, label: "1 drop" });
      }
      return marks.filter((mark) => mark.fraction > 0 && mark.fraction <= 1);
    }
    default: {
      const neverMenu: never = menu;
      return neverMenu;
    }
  }
}

export function scaleCaption(
  menu: MenuId,
  value: number | null,
  capacity: number,
  dropMl: number,
  modelCapacity: number,
  campusCapacity: number,
): { title: string | null; text: string } {
  if (value == null) {
    return { title: null, text: "No cited figure. The glass stays empty." };
  }
  switch (menu) {
    case "model":
      if (value > capacity) {
        return {
          title: "Exceeds glass",
          text: `Cited ${formatAmount(value, "mL")} is past the ${capacity} mL etching. The tumbler fills, then spills.`,
        };
      }
      return {
        title: null,
        text: `Etched at ${capacity} mL. One drop is a short GPT-4o query (${dropMl.toFixed(2)} mL).`,
      };
    case "datacenter": {
      const full = campusLabel(campusCapacity);
      if (value > capacity) {
        return {
          title: "Exceeds glass",
          text: `Cited ${formatAmount(value, "gal/day")} is past the ${full} etching.`,
        };
      }
      return {
        title: null,
        text: `Etched at ${full}. Separate from the ${modelCapacity} mL query glass.`,
      };
    }
    default: {
      const neverMenu: never = menu;
      return { title: null, text: neverMenu };
    }
  }
}

export function fillFraction(value: number | null, capacity: number): number {
  if (value == null || capacity <= 0) {
    return 0;
  }
  return Math.min(1, value / capacity);
}

export function dropUnits(value: number | null, dropMl: number): number | null {
  if (value == null || dropMl <= 0) {
    return null;
  }
  return value / dropMl;
}
