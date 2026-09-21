/** Multi-seed runs untuk sebaran throughput / biaya / emisi. */

import { runSimulation, type SimulationConfig, type SimulationResult } from "./engine";
import { computeCosts } from "./costs";
import { computeEmissions } from "./emissions";
import { MAX_MULTI_SEED } from "./limits";

export type MultiRunSummary = {
  n: number;
  throughput: { mean: number; std: number; min: number; max: number };
  unit_cost: { mean: number; std: number; min: number; max: number };
  unit_emission: { mean: number; std: number; min: number; max: number };
  results: SimulationResult[];
};

function stats(vals: number[]) {
  const n = vals.length || 1;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const v = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return {
    mean,
    std: Math.sqrt(v),
    min: vals.length ? Math.min(...vals) : 0,
    max: vals.length ? Math.max(...vals) : 0,
  };
}

export function runMultiSeed(
  base: SimulationConfig,
  n = 5,
  seedStart?: number,
): MultiRunSummary {
  n = Math.min(MAX_MULTI_SEED, Math.max(1, Math.floor(n)));
  const start = seedStart ?? (base.seed ?? 12345);
  const results: SimulationResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(runSimulation({ ...base, seed: start + i }));
  }
  return {
    n,
    throughput: stats(results.map((r) => r.throughput_per_hour)),
    unit_cost: stats(results.map((r) => computeCosts(r).unit_cost)),
    unit_emission: stats(results.map((r) => computeEmissions(r).unit_emission)),
    results,
  };
}
