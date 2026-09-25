import type { MenuId } from "./types";

/**
 * Model etching is 40 mL, stored on the catalog. The tumbler is tapered, and the
 * water height is that frustum's real volume — not a log remap — so the plaque
 * can keep printing the cited milliliters. One GPT-4o drop stays a shallow pool.
 * Campus mode uses the same mesh with a gallons-per-day etching.
 */
export const TUMBLER = {
  innerBottomY: 0.02,
  innerHeight: 0.108,
  bottomRadius: 0.031,
  topRadius: 0.047,
} as const;

export type PourPlan =
  | { kind: "empty" }
  | { kind: "drops"; count: number; tiny: boolean; fallMs: number; gapMs: number }
  | { kind: "stream"; durationMs: number; spillMs: number };

const DROP_MAX_UNITS = 3.2;

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function radiusAtHeight(y: number): number {
  const t = (y - TUMBLER.innerBottomY) / TUMBLER.innerHeight;
  const clamped = Math.min(1, Math.max(0, t));
  return TUMBLER.bottomRadius + (TUMBLER.topRadius - TUMBLER.bottomRadius) * clamped;
}

export function heightForVolumeFraction(fraction: number): number {
  const target = Math.min(1, Math.max(0, fraction));
  if (target <= 0) {
    return 0;
  }
  if (target >= 1) {
    return TUMBLER.innerHeight;
  }
  let lo = 0;
  let hi: number = TUMBLER.innerHeight;
  for (let i = 0; i < 22; i += 1) {
    const mid = (lo + hi) / 2;
    if (containedFraction(mid) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

export function pourPlan(request: {
  menu: MenuId;
  fraction: number;
  capacity: number;
  value: number | null;
  dropUnits: number | null;
  overflow: boolean;
}): PourPlan {
  if (request.fraction <= 0) {
    return { kind: "empty" };
  }
  const units = request.dropUnits;
  if (request.menu === "model" && !request.overflow && units != null && units <= DROP_MAX_UNITS) {
    return {
      kind: "drops",
      count: Math.max(1, Math.round(units)),
      tiny: units < 0.75,
      fallMs: 680,
      gapMs: 260,
    };
  }
  const durationMs = request.menu === "datacenter"
    ? 1700 + request.fraction * 1900
    : 1800 + request.fraction * 2300;
  const ratio = request.capacity > 0 ? (request.value ?? 0) / request.capacity : 1;
  const spillMs = request.overflow
    ? Math.round(1200 + Math.min(1800, Math.max(0, ratio - 1) * 420))
    : 0;
  return { kind: "stream", durationMs, spillMs };
}

function containedFraction(height: number): number {
  const full = volumeOf(TUMBLER.innerHeight);
  if (full <= 0) {
    return 0;
  }
  return volumeOf(height) / full;
}

function volumeOf(height: number): number {
  const { innerHeight: total, bottomRadius: r0, topRadius: r1 } = TUMBLER;
  const dr = r1 - r0;
  const h = height;
  return r0 * r0 * h + (r0 * dr * h * h) / total + (dr * dr * h * h * h) / (3 * total * total);
}
