/**
 * Sweep fleet size untuk tab Perbandingan.
 * Earthmoving: unit place 1–3 × dump truck 1–20.
 * Concreting (RMC): place units × truck mixer — crane = jumlah bucket 1–3 (crane fixed).
 */

import {
  cycleTimeMean,
  expectedMean,
  fromMeanCv,
  resolveDist,
  runSimulation,
  type SimulationConfig,
  type SimulationResult,
} from "./engine";
import { computeCosts } from "./costs";
import { computeEmissions } from "./emissions";
import { isRmcOperation, placementMethodOf } from "./rmcEngine";
import { isAsphaltOperation, readAsphaltFields } from "./asphaltEngine";
import { isPrecastOperation, readPrecastFields } from "./precastEngine";

import { COMPARE_HAULERS_MAX, COMPARE_HAULERS_MAX_RMC } from "./limits";

export const COMPARE_LOADERS = [1, 2, 3] as const;
export { COMPARE_HAULERS_MAX, COMPARE_HAULERS_MAX_RMC };

export type ComparisonCell = {
  num_loaders: number;
  num_haulers: number;
  throughput: number;
  /** Teoritis: min(kap. loading, kap. hauling) tanpa antrian/variasi */
  throughput_theory: number;
  loader_cap_theory: number;
  hauler_cap_theory: number;
  loader_util: number;
  hauler_util: number;
  avg_queue_wait: number;
  avg_queue_length: number;
  simulated_minutes: number;
  total_trips: number;
  total_volume: number;
  bottleneck: string;
  unit_cost: number;
  wait_cost: number;
  wait_unit_cost: number;
  cost_total: number;
  unit_emission: number;
  emission_wait: number;
  wait_unit_emission: number;
  emission_total: number;
};

export type ComparisonGrid = {
  cells: ComparisonCell[];
  /** baris chart: X = n_haulers, series per n_loaders */
  byHauler: Array<{
    haulers: number;
    [key: string]: number;
  }>;
  loaders: readonly number[];
  /** Kapasitas loading teoritis per n unit place (m³/jam), konstan vs n truck */
  loaderCeilings: Record<number, number>;
  cycleMeanMin: number;
};

/**
 * Kapasitas teoritis (tanpa antrian & tanpa variasi).
 *
 * Earthmoving (single cycle):
 * - Loading: n_L × (60 / t_load) × payload
 * - Hauling: n_H × (60 / t_cycle) × payload, t_cycle = load+haul+dump+return
 *
 * Concreting RMC (dual cycle):
 * - Place:  n_place × (60 / t_place_cycle) × place_cap
 * - Truck:  n_truck × (60 / t_truck_cycle) × truck_cap
 * - System: min(place, truck)
 */
export function theoreticalThroughput(
  base: SimulationConfig,
  numLoaders: number,
  numHaulers: number,
): { system: number; loader: number; hauler: number; cycleMin: number } {
  if (isRmcOperation(base.operation)) {
    const placeCycle =
      expectedMean(
        resolveDist(
          base,
          base.place_fill_dist ?? base.load_dist,
          base.place_fill_mean ?? base.load_time_mean,
        ),
      ) +
      expectedMean(
        resolveDist(
          base,
          base.place_travel_dist ?? base.haul_dist,
          base.place_travel_mean ?? base.haul_time_mean,
        ),
      ) +
      expectedMean(
        resolveDist(
          base,
          base.place_place_dist ?? base.dump_dist,
          base.place_place_mean ?? base.dump_time_mean,
        ),
      ) +
      expectedMean(
        resolveDist(
          base,
          base.place_return_dist ?? base.return_dist,
          base.place_return_mean ?? base.return_time_mean,
        ),
      );
    const truckCycle =
      Math.max(0.1, base.truck_batch_mean ?? 5) +
      Math.max(0.1, base.truck_haul_mean ?? 18) +
      Math.max(0.1, base.truck_discharge_mean ?? 4) +
      Math.max(0.1, base.truck_return_mean ?? 16);
    const placeCap = Math.max(
      0.01,
      base.place_capacity_m3 ?? base.payload_per_trip ?? 0.5,
    );
    const truckCap = Math.max(0.01, base.truck_capacity_m3 ?? 7);
    const nP = Math.max(1, numLoaders);
    const nT = Math.max(1, numHaulers);
    const loader = placeCycle > 0 ? (60 / placeCycle) * nP * placeCap : 0;
    const hauler = truckCycle > 0 ? (60 / truckCycle) * nT * truckCap : 0;
    return {
      system: Math.min(loader, hauler),
      loader,
      hauler,
      cycleMin: placeCycle,
    };
  }

  if (isAsphaltOperation(base.operation)) {
    const f = readAsphaltFields({
      ...base,
      num_loaders: numLoaders,
      num_haulers: numHaulers,
    });
    const payload = f.truck_capacity_m3;
    const truckCycle = Math.max(
      0.1,
      f.plant_load_mean + f.haul_mean + f.dump_mean + f.return_mean,
    );
    const hauler = (numHaulers * 60) / truckCycle * payload;
    const paver = (numLoaders * 60) / Math.max(0.1, f.spread_mean) * payload;
    const plant = (f.plant_bays * 60) / Math.max(0.1, f.plant_load_mean) * payload;
    return {
      system: Math.min(hauler, paver, plant),
      loader: paver,
      hauler,
      cycleMin: truckCycle,
    };
  }

  if (isPrecastOperation(base.operation)) {
    const f = readPrecastFields({
      ...base,
      num_loaders: numLoaders,
      num_haulers: numHaulers,
    });
    const vol = f.element_volume_m3;
    const formCycle = Math.max(
      1,
      f.prepare_mean + f.pour_mean + f.cure_mean + f.strip_mean + f.clean_mean,
    );
    const crewWork = Math.max(1, f.prepare_mean + f.pour_mean + f.strip_mean + f.clean_mean);
    const craneWork = Math.max(1, f.pour_mean + f.strip_mean);
    const formThr = (numHaulers * 60) / formCycle * vol;
    const crewThr = (numLoaders * 60) / crewWork * vol;
    const craneThr = (f.num_cranes * 60) / craneWork * vol;
    const cureThr = (f.num_cure_slots * 60) / Math.max(1, f.cure_mean) * vol;
    return {
      system: Math.min(formThr, crewThr, craneThr, cureThr),
      loader: crewThr,
      hauler: formThr,
      cycleMin: formCycle,
    };
  }

  const payload = Math.max(0.01, base.hauler_capacity_m3 ?? base.payload_per_trip ?? 1);
  const loadMean = expectedMean(
    resolveDist(base, base.load_dist, base.load_time_mean),
  );
  const cycleMin = cycleTimeMean({
    ...base,
    num_loaders: numLoaders,
    num_haulers: numHaulers,
  });
  const loader =
    loadMean > 0 ? (60 / loadMean) * Math.max(1, numLoaders) * payload : 0;
  const hauler =
    cycleMin > 0 ? (60 / cycleMin) * Math.max(1, numHaulers) * payload : 0;
  return {
    system: Math.min(loader, hauler),
    loader,
    hauler,
    cycleMin,
  };
}

function cellFromResult(
  nL: number,
  nH: number,
  r: SimulationResult,
  theory: ReturnType<typeof theoreticalThroughput>,
): ComparisonCell {
  const costs = computeCosts(r);
  const em = computeEmissions(r);
  return {
    num_loaders: nL,
    num_haulers: nH,
    throughput: r.throughput_per_hour,
    throughput_theory: theory.system,
    loader_cap_theory: theory.loader,
    hauler_cap_theory: theory.hauler,
    loader_util: r.loader_utilization * 100,
    hauler_util: r.hauler_utilization * 100,
    avg_queue_wait: r.avg_queue_wait,
    avg_queue_length: r.avg_queue_length,
    simulated_minutes: r.simulated_minutes,
    total_trips: r.total_trips,
    total_volume: r.total_volume,
    bottleneck: r.bottleneck,
    unit_cost: costs.unit_cost,
    wait_cost: costs.cost_wait,
    wait_unit_cost: costs.wait_unit_cost,
    cost_total: costs.cost_total,
    unit_emission: em.unit_emission,
    emission_wait: em.emission_wait,
    wait_unit_emission: em.wait_unit_emission,
    emission_total: em.emission_total,
  };
}

/**
 * Jalankan grid perbandingan. Seed digeser per sel agar tetap deterministic.
 */
/** Deret place-unit / loader untuk grid perbandingan per operasi */
export function compareLoaderSeries(base: SimulationConfig): number[] {
  if (isAsphaltOperation(base.operation)) return [1, 2, 3];
  if (isPrecastOperation(base.operation)) return [1, 2, 3];
  if (!isRmcOperation(base.operation)) return [...COMPARE_LOADERS];
  const method = placementMethodOf(
    base.operation,
    (base as SimulationConfig & { placement_method?: "dolly" | "crane" | "pump" })
      .placement_method,
  );
  // Buggy & pump: 1–3 unit place; crane: 1–3 bucket (crane fixed 1)
  if (method === "dolly") return [1, 2, 3, 4];
  if (method === "pump") return [1, 2, 3];
  return [1, 2, 3]; // crane buckets
}

export function runComparisonGrid(base: SimulationConfig): ComparisonGrid {
  const loaders = compareLoaderSeries(base);
  const haulersMax = isRmcOperation(base.operation)
    ? COMPARE_HAULERS_MAX_RMC
    : isAsphaltOperation(base.operation)
      ? 20
      : isPrecastOperation(base.operation)
        ? 12
        : COMPARE_HAULERS_MAX;
  const cells: ComparisonCell[] = [];
  const loaderCeilings: Record<number, number> = {};
  const rmc = isRmcOperation(base.operation);

  for (const nL of loaders) {
    const t0 = theoreticalThroughput(base, nL, 1);
    loaderCeilings[nL] = Math.round(t0.loader * 10) / 10;

    for (let nH = 1; nH <= haulersMax; nH++) {
      const seedBase = base.seed ?? 12345;
      const cv = base.cv ?? 0.2;
      const kind = base.default_dist_kind ?? "normal";
      const cfg: SimulationConfig = {
        ...base,
        num_loaders: nL,
        num_haulers: nH,
        // RMC dual-cycle membaca num_place / num_trucks — wajib di-sync
        num_place: nL,
        num_trucks: nH,
        num_pavers: nL,
        num_forms: nH,
        num_crews: nL,
        cv,
        seed: seedBase + nL * 100 + nH,
        load_dist: fromMeanCv(base.load_time_mean, cv, kind),
        haul_dist: fromMeanCv(base.haul_time_mean, cv, kind),
        dump_dist: fromMeanCv(base.dump_time_mean, cv, kind),
        return_dist: fromMeanCv(base.return_time_mean, cv, kind),
        place_fill_dist: fromMeanCv(
          base.place_fill_mean ?? base.load_time_mean,
          cv,
          kind,
        ),
        place_travel_dist: fromMeanCv(
          base.place_travel_mean ?? base.haul_time_mean,
          cv,
          kind,
        ),
        place_place_dist: fromMeanCv(
          base.place_place_mean ?? base.dump_time_mean,
          cv,
          kind,
        ),
        place_return_dist: fromMeanCv(
          base.place_return_mean ?? base.return_time_mean,
          cv,
          kind,
        ),
      };
      const theory = theoreticalThroughput(base, nL, nH);
      const r = runSimulation(cfg);
      cells.push(cellFromResult(nL, nH, r, theory));
    }
  }

  const cycleMeanMin = cycleTimeMean(base);

  const byHauler: ComparisonGrid["byHauler"] = [];
  for (let nH = 1; nH <= haulersMax; nH++) {
    const row: ComparisonGrid["byHauler"][number] = { haulers: nH };
    for (const nL of loaders) {
      const c = cells.find((x) => x.num_loaders === nL && x.num_haulers === nH)!;
      row[`thr_${nL}`] = Math.round(c.throughput * 10) / 10;
      row[`thrT_${nL}`] = Math.round(c.throughput_theory * 10) / 10;
      row[`capL_${nL}`] = Math.round(c.loader_cap_theory * 10) / 10;
      row[`utilL_${nL}`] = Math.round(c.loader_util * 10) / 10;
      row[`utilH_${nL}`] = Math.round(c.hauler_util * 10) / 10;
      row[`wait_${nL}`] = Math.round(c.avg_queue_wait * 100) / 100;
      row[`qlen_${nL}`] = Math.round(c.avg_queue_length * 100) / 100;
      row[`ucost_${nL}`] = Math.round(c.unit_cost);
      row[`wcost_${nL}`] = Math.round(c.wait_cost);
      row[`wucost_${nL}`] = Math.round(c.wait_unit_cost);
      row[`uemi_${nL}`] = Math.round(c.unit_emission * 1000) / 1000;
      row[`wemi_${nL}`] = Math.round(c.emission_wait * 10) / 10;
      row[`wuemi_${nL}`] = Math.round(c.wait_unit_emission * 1000) / 1000;
    }
    byHauler.push(row);
  }

  return { cells, byHauler, loaders, loaderCeilings, cycleMeanMin };
}

/** Hint puncak throughput, min biaya satuan, min emisi satuan per n place/loader. */
export function bestFleetHints(grid: ComparisonGrid, loaderLabel = "unit place"): string[] {
  const tips: string[] = [];
  for (const nL of grid.loaders) {
    const subset = grid.cells.filter((c) => c.num_loaders === nL);
    if (!subset.length) continue;
    let bestThr = subset[0];
    let bestCost = subset[0];
    let bestEmi = subset[0];
    for (const c of subset) {
      if (c.throughput > bestThr.throughput) bestThr = c;
      if (c.unit_cost > 0 && (bestCost.unit_cost <= 0 || c.unit_cost < bestCost.unit_cost))
        bestCost = c;
      if (
        c.unit_emission > 0 &&
        (bestEmi.unit_emission <= 0 || c.unit_emission < bestEmi.unit_emission)
      )
        bestEmi = c;
    }
    const gap =
      bestThr.throughput_theory > 0
        ? (1 - bestThr.throughput / bestThr.throughput_theory) * 100
        : 0;
    tips.push(
      `${loaderLabel} ×${nL}: throughput puncak ≈ ${bestThr.throughput.toFixed(1)} m³/jam @ ${bestThr.num_haulers} hauler` +
        ` (teori ${bestThr.throughput_theory.toFixed(1)}${gap > 1 ? `, gap ~${gap.toFixed(0)}%` : ""}).` +
        ` Min biaya satuan @ ${bestCost.num_haulers} hauler` +
        ` (≈ ${Math.round(bestCost.unit_cost).toLocaleString("id-ID")}/m³).` +
        ` Min emisi satuan @ ${bestEmi.num_haulers} hauler` +
        ` (≈ ${bestEmi.unit_emission.toFixed(3)} kg CO₂e/m³).`,
    );
  }
  return tips;
}
