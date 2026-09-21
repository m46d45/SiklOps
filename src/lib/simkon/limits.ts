/** Classroom-safe caps so a lecture hall of laptops stays responsive. */

export const MAX_TARGET_CYCLES = 400;
export const MAX_TARGET_VOLUME = 20_000;
export const MAX_DES_EVENTS = 500_000;

/** Fleet sweep width for the Comparison tab (button-triggered). */
export const COMPARE_HAULERS_MAX = 20;
export const COMPARE_HAULERS_MAX_RMC = 12;

export const MAX_MULTI_SEED = 10;

export function clampTargetCycles(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_TARGET_CYCLES, Math.max(0, Math.floor(n)));
}

export function clampTargetVolume(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_TARGET_VOLUME, Math.max(0, n));
}
