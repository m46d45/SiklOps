/**
 * Emisi CO₂e berbasis jam mesin (model edukatif earthmoving).
 *
 * - Kerja: busy time × EF kerja
 * - Idle: (kapasitas waktu − busy − wait) × EF idle
 * - Waiting waste (hauler): wait time × EF idle truck
 */

import type { SimulationConfig, SimulationResult } from "./engine";

export type EmissionBreakdown = {
  hours: number;
  loader_busy_h: number;
  loader_idle_h: number;
  hauler_busy_h: number;
  hauler_wait_h: number;
  hauler_idle_h: number;
  emission_loader: number;
  emission_hauler: number;
  emission_wait: number;
  emission_idle_total: number;
  emission_total: number;
  /** kg CO₂e per unit volume */
  unit_emission: number;
  wait_unit_emission: number;
  ef_loader_work: number;
  ef_loader_idle: number;
  ef_hauler_work: number;
  ef_hauler_idle: number;
};

/** Default EF (kg CO₂e / jam) — orde besar mesin konstruksi medium. */
/**
 * Default EF (kg CO₂e/jam) untuk excavator ~0.5 m³ & dump truck ~4 m³.
 * Basis: konsumsi solar tipikal × 2.68 kg CO₂/L (orde ISO/IPCC tank-to-wheel).
 * Idle ≈ 30–40% laju kerja.
 */
export function defaultEmissionFactors() {
  return {
    emission_loader_work_kg_per_h: 11, // ≈ 4.1 L/j
    emission_loader_idle_kg_per_h: 4, // ≈ 1.5 L/j
    emission_hauler_work_kg_per_h: 19, // ≈ 7.1 L/j
    emission_hauler_idle_kg_per_h: 4, // ≈ 1.5 L/j
  };
}

export function computeEmissions(
  result: Pick<
    SimulationResult,
    | "simulated_minutes"
    | "total_volume"
    | "total_wait_time"
    | "loader_busy_minutes"
    | "hauler_busy_minutes"
    | "config"
  >,
): EmissionBreakdown {
  const cfg = result.config;
  const d = defaultEmissionFactors();
  const efLW = Math.max(0, cfg.emission_loader_work_kg_per_h ?? d.emission_loader_work_kg_per_h);
  const efLI = Math.max(0, cfg.emission_loader_idle_kg_per_h ?? d.emission_loader_idle_kg_per_h);
  const efHW = Math.max(0, cfg.emission_hauler_work_kg_per_h ?? d.emission_hauler_work_kg_per_h);
  const efHI = Math.max(0, cfg.emission_hauler_idle_kg_per_h ?? d.emission_hauler_idle_kg_per_h);

  const hours = Math.max(0, result.simulated_minutes / 60);
  const nL = Math.max(1, cfg.num_loaders);
  const nH = Math.max(1, cfg.num_haulers);

  const loader_busy_h = Math.max(0, result.loader_busy_minutes / 60);
  const hauler_busy_h = Math.max(0, result.hauler_busy_minutes / 60);
  const hauler_wait_h = Math.max(0, result.total_wait_time / 60);

  const loaderCap = nL * hours;
  const haulerCap = nH * hours;
  const loader_idle_h = Math.max(0, loaderCap - loader_busy_h);
  const hauler_idle_h = Math.max(0, haulerCap - hauler_busy_h - hauler_wait_h);

  const emission_loader = loader_busy_h * efLW + loader_idle_h * efLI;
  const emission_hauler =
    hauler_busy_h * efHW + hauler_wait_h * efHI + hauler_idle_h * efHI;
  const emission_wait = hauler_wait_h * efHI;
  const emission_idle_total = loader_idle_h * efLI + hauler_idle_h * efHI;
  const emission_total = emission_loader + emission_hauler;
  const vol = Math.max(0, result.total_volume);
  const unit_emission = vol > 1e-9 ? emission_total / vol : 0;
  const wait_unit_emission = vol > 1e-9 ? emission_wait / vol : 0;

  return {
    hours,
    loader_busy_h,
    loader_idle_h,
    hauler_busy_h,
    hauler_wait_h,
    hauler_idle_h,
    emission_loader,
    emission_hauler,
    emission_wait,
    emission_idle_total,
    emission_total,
    unit_emission,
    wait_unit_emission,
    ef_loader_work: efLW,
    ef_loader_idle: efLI,
    ef_hauler_work: efHW,
    ef_hauler_idle: efHI,
  };
}

export function formatKg(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })} kg`;
}
