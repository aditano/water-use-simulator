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

export function legendFor(menu: MenuId, dropMl: number): string {
  if (menu === "model") {
    return `The glass is etched at 20 mL. One drop is one short GPT-4o query on the derived scale (${dropMl.toFixed(2)} mL). Fill follows the cited milliliters. Past 20 mL, water spills to the drain. Published rows use different boundaries than the short-prompt rows.`;
  }
  return "The glass is etched at 4 million gallons per day. Fill follows the cited daily figure for that campus or fleet. Read the badge: consumption, withdrawal, a contract peak, and a requested cap are not the same kind of number.";
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
