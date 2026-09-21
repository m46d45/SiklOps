/**
 * Model biaya fleet (sewa/operasional per jam) + waste waiting.
 *
 * - Biaya resource: n × tarif/jam × durasi sim (jam)
 * - Biaya waiting (waste): jam·unit tunggu hauler × tarif hauler/jam
 * - Biaya satuan: total fleet / volume
 */

import type { SimulationConfig, SimulationResult } from "./engine";

export type CostBreakdown = {
  currency: string;
  hours: number;
  cost_loader: number;
  cost_hauler: number;
  cost_wait: number;
  cost_total: number;
  /** Biaya satuan pekerjaan (per unit volume) */
  unit_cost: number;
  /** Waste waiting per unit volume */
  wait_unit_cost: number;
  loader_rate: number;
  hauler_rate: number;
};

export function computeCosts(
  result: Pick<
    SimulationResult,
    | "simulated_minutes"
    | "total_volume"
    | "total_wait_time"
    | "config"
  >,
): CostBreakdown {
  const cfg = result.config;
  const currency = cfg.cost_currency || "Rp";
  const dryL = Math.max(0, cfg.cost_loader_per_hour ?? 0);
  const dryH = Math.max(0, cfg.cost_hauler_per_hour ?? 0);
  const opL = Math.max(0, cfg.cost_loader_operator_per_hour ?? 0);
  const opH = Math.max(0, cfg.cost_hauler_operator_per_hour ?? 0);
  const allIn = !!cfg.cost_all_in;
  const loaderRate = dryL + (allIn ? opL : 0);
  const haulerRate = dryH + (allIn ? opH : 0);
  const hours = Math.max(0, result.simulated_minutes / 60);
  const nL = Math.max(1, cfg.num_loaders);
  const nH = Math.max(1, cfg.num_haulers);

  const cost_loader = nL * loaderRate * hours;
  const cost_hauler = nH * haulerRate * hours;
  // total_wait_time = menit·unit hauler menunggu
  const waitHours = Math.max(0, result.total_wait_time / 60);
  const cost_wait = waitHours * haulerRate;
  const cost_total = cost_loader + cost_hauler;
  const vol = Math.max(0, result.total_volume);
  const unit_cost = vol > 1e-9 ? cost_total / vol : 0;
  const wait_unit_cost = vol > 1e-9 ? cost_wait / vol : 0;

  return {
    currency,
    hours,
    cost_loader,
    cost_hauler,
    cost_wait,
    cost_total,
    unit_cost,
    wait_unit_cost,
    loader_rate: loaderRate,
    hauler_rate: haulerRate,
  };
}

export function formatMoney(n: number, currency = "Rp", digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : abs >= 100 ? 1 : digits;
  const body = n.toLocaleString("id-ID", {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  });
  return `${currency} ${body}`;
}

/** Default tarif edukatif (Rp/jam) — bisa diubah di parameter. */
export function defaultCostRates() {
  return {
    cost_loader_per_hour: 160_000,
    cost_hauler_per_hour: 125_000,
    cost_currency: "Rp",
    cost_loader_operator_per_hour: 80_000,
    cost_hauler_operator_per_hour: 60_000,
    cost_all_in: false,
  };
}

export function costRatesFromConfig(cfg: SimulationConfig) {
  return {
    cost_loader_per_hour: cfg.cost_loader_per_hour ?? defaultCostRates().cost_loader_per_hour,
    cost_hauler_per_hour: cfg.cost_hauler_per_hour ?? defaultCostRates().cost_hauler_per_hour,
    cost_currency: cfg.cost_currency ?? "Rp",
  };
}
