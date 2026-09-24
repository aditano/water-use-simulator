export type MenuId = "model" | "datacenter";

export type Evidence =
  | "derived_estimate"
  | "academic_estimate"
  | "company_measurement"
  | "company_claim"
  | "lifecycle_assessment"
  | "journalism_estimate"
  | "company_disclosure"
  | "utility_meter"
  | "contract_peak"
  | "requested_cap"
  | "design_capacity"
  | "gap";

export interface Figure {
  id: string;
  menu: MenuId;
  interactive: boolean;
  name: string;
  subtitle: string;
  group: string;
  value: number | null;
  unit: "mL" | "gal/day";
  rangeLow: number | null;
  rangeHigh: number | null;
  onsiteMl?: number;
  offsiteMl?: number;
  annualGallons?: number;
  annualMetric?: "consumption" | "withdrawal";
  evidence: Evidence;
  boundary: string;
  sourceTitle: string;
  sourceUrl: string;
  published: string;
  dataYear: string | null;
  notes: string;
  assumptions?: string;
}

export interface ContextNote {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  evidence: Evidence;
  sourceTitle: string;
  sourceUrl: string;
  published: string;
  notes: string;
}

export interface Catalog {
  meta: {
    researched: string;
    modelCupMl: number;
    campusCupGalPerDay: number;
    dropReferenceId: string;
    dropDefinition: string;
  };
  figures: Figure[];
  contextOnly: ContextNote[];
}
