/**
 * SiklOps DES engine — template 2-resource cyclic operations
 * (earthmoving · bricklaying · ready-mixed concrete delivery).
 */

import { Rng } from "./rng";
import { getOperation, type OperationId } from "./operations";
import {
  applyRmcToConfig,
  isRmcOperation,
  placementMethodOf,
  rmcDualDefaults,
  runRmcDualSimulation,
} from "./rmcEngine";
import {
  applyBrickToConfig,
  isBrickOperation,
  runBrickTripleSimulation,
} from "./brickEngine";
import {
  applyTowerCraneToConfig,
  isTowerCraneOperation,
  runTowerCraneSimulation,
} from "./towerCraneEngine";
import {
  applyAsphaltToConfig,
  isAsphaltOperation,
  runAsphaltSimulation,
} from "./asphaltEngine";
import {
  applyPrecastToConfig,
  isPrecastOperation,
  runPrecastSimulation,
} from "./precastEngine";
import {
  MAX_DES_EVENTS,
  clampTargetCycles,
  clampTargetVolume,
} from "./limits";

export const APP_VERSION = "1.4";
export const DIESEL_KG_CO2_PER_L = 2.68;

export type OperationType = OperationId;

export type DistKind = "constant" | "normal" | "lognormal" | "gamma" | "beta" | "exponential";

export const DIST_LABELS: Record<DistKind, string> = {
  constant: "Konstan",
  normal: "Normal",
  lognormal: "Log-normal",
  gamma: "Gamma",
  beta: "Beta",
  exponential: "Eksponensial (Poisson)",
};

export type DurationDist = {
  kind: DistKind;
  mean: number;
  cv: number;
  std?: number | null;
  min_bound: number;
  max_bound: number;
  alpha: number;
  beta_shape: number;
};

export function makeDist(partial: Partial<DurationDist> & { mean?: number }): DurationDist {
  return {
    kind: partial.kind ?? "normal",
    mean: partial.mean ?? 3,
    cv: partial.cv ?? 0.2,
    std: partial.std ?? null,
    min_bound: partial.min_bound ?? 0.5,
    max_bound: partial.max_bound ?? 10,
    alpha: partial.alpha ?? 2,
    beta_shape: partial.beta_shape ?? 5,
  };
}

export function expectedMean(dist: DurationDist): number {
  if (dist.kind === "constant") return Math.max(0.05, dist.mean);
  if (dist.kind === "beta") {
    const a = Math.max(1e-6, dist.alpha);
    const b = Math.max(1e-6, dist.beta_shape);
    let lo = dist.min_bound;
    let hi = dist.max_bound;
    if (hi <= lo) hi = lo + 0.1;
    return lo + (hi - lo) * (a / (a + b));
  }
  return Math.max(0.05, dist.mean);
}

export function distToDict(dist: DurationDist) {
  return {
    kind: dist.kind,
    label: DIST_LABELS[dist.kind],
    mean: dist.mean,
    cv: dist.cv,
    expected_mean: Math.round(expectedMean(dist) * 1000) / 1000,
    min_bound: dist.min_bound,
    max_bound: dist.max_bound,
    alpha: dist.alpha,
    beta_shape: dist.beta_shape,
  };
}

export function fromMeanCv(mean: number, cv = 0.2, kind: DistKind = "normal"): DurationDist {
  if (kind === "constant" || (cv <= 0 && kind !== "exponential")) {
    return makeDist({ kind: "constant", mean, cv: 0 });
  }
  if (kind === "exponential") {
    // Exp always CV = 1; mean = 1/λ
    return makeDist({ kind: "exponential", mean, cv: 1 });
  }
  if (kind === "beta") {
    const spread = mean > 0 ? Math.max(0.5, 2 * Math.abs(cv) * mean) : 1;
    return makeDist({
      kind: "beta",
      mean,
      cv,
      min_bound: Math.max(0.05, mean - spread),
      max_bound: mean + spread,
      alpha: 2,
      beta_shape: 5,
    });
  }
  return makeDist({ kind, mean, cv });
}

export function sampleDuration(dist: DurationDist, rng: Rng): number {
  const minT = 0.05;
  const kind = dist.kind;

  if (kind === "constant") return Math.max(minT, dist.mean);

  if (kind === "exponential") {
    // X ~ Exp(λ), E[X]=mean → X = -mean * ln(U)
    const mean = Math.max(minT, dist.mean);
    const u = Math.max(1e-12, Math.min(1 - 1e-12, rng.random()));
    return Math.max(minT, -mean * Math.log(u));
  }

  if (kind === "normal") {
    const mean = dist.mean;
    if (mean <= 0) return minT;
    let sigma: number;
    if (dist.std != null && dist.std > 0) sigma = dist.std;
    else {
      const cv = Math.max(0, dist.cv);
      if (cv <= 0) return Math.max(minT, mean);
      sigma = mean * cv;
    }
    for (let i = 0; i < 50; i++) {
      const x = rng.gauss(mean, sigma);
      if (x >= minT) return x;
    }
    return Math.max(minT, mean);
  }

  if (kind === "lognormal") {
    const mean = dist.mean;
    const cv = Math.max(0, dist.cv);
    if (mean <= 0) return minT;
    if (cv <= 0) return Math.max(minT, mean);
    const sigma2 = Math.log(1 + cv * cv);
    const sigma = Math.sqrt(sigma2);
    const mu = Math.log(mean) - 0.5 * sigma2;
    return Math.max(minT, Math.exp(rng.gauss(mu, sigma)));
  }

  if (kind === "gamma") {
    const mean = dist.mean;
    const cv = Math.max(0, dist.cv);
    if (mean <= 0) return minT;
    if (cv <= 1e-9) return Math.max(minT, mean);
    const shape = 1 / (cv * cv);
    const scale = mean * cv * cv;
    if (shape <= 0 || scale <= 0) return Math.max(minT, mean);
    return Math.max(minT, rng.gammavariate(shape, scale));
  }

  if (kind === "beta") {
    const a = Math.max(1e-6, dist.alpha);
    const b = Math.max(1e-6, dist.beta_shape);
    let lo = dist.min_bound;
    let hi = dist.max_bound;
    if (hi <= lo) hi = lo + Math.max(0.1, Math.abs(lo) * 0.1 + 0.1);
    const u = rng.betavariate(a, b);
    return Math.max(minT, lo + (hi - lo) * u);
  }

  return Math.max(minT, dist.mean);
}

export type SimulationConfig = {
  operation: OperationType;
  num_loaders: number;
  num_haulers: number;
  /** Kapasitas excavator per bucket (m³) */
  loader_bucket_m3: number;
  /** Kapasitas dump truck (m³) — juga volume per trip */
  hauler_capacity_m3: number;
  load_time_mean: number;
  haul_time_mean: number;
  dump_time_mean: number;
  return_time_mean: number;
  load_dist: DurationDist | null;
  haul_dist: DurationDist | null;
  dump_dist: DurationDist | null;
  return_dist: DurationDist | null;
  /** Volume material per trip selesai dump (= kapasitas truck) */
  payload_per_trip: number;
  /** Batas waktu pengaman (menit) agar sim tak infinite */
  simulation_duration: number;
  target_cycles: number;
  /** Target volume pekerjaan (m³). 0 = tidak dipakai. */
  target_volume: number;
  stop_mode: "duration" | "cycles" | "volume" | "either";
  cv: number;
  default_dist_kind: DistKind;
  seed: number | null;
  /** Biaya excavator per jam (sewa/ops) */
  cost_loader_per_hour: number;
  /** Biaya dump truck per jam (sewa/ops) */
  cost_hauler_per_hour: number;
  /** Label mata uang (tampil UI) */
  cost_currency: string;
  /** Emisi CO₂e excavator saat kerja (kg/jam) */
  emission_loader_work_kg_per_h: number;
  /** Emisi CO₂e excavator saat idle (kg/jam) */
  emission_loader_idle_kg_per_h: number;
  /** Emisi CO₂e dump truck saat kerja (kg/jam) */
  emission_hauler_work_kg_per_h: number;
  /** Emisi CO₂e dump truck saat idle / antri (kg/jam) */
  emission_hauler_idle_kg_per_h: number;
  /** Solar L/jam — EF dihitung × DIESEL_KG_CO2_PER_L */
  fuel_loader_work_lph: number;
  fuel_loader_idle_lph: number;
  fuel_hauler_work_lph: number;
  fuel_hauler_idle_lph: number;
  /** Biaya operator per jam (ditambah jika all_in) */
  cost_loader_operator_per_hour: number;
  cost_hauler_operator_per_hour: number;
  /** true = sewa + operator */
  cost_all_in: boolean;
  /* Dual-cycle RMC (opsional) */
  truck_batch_mean?: number;
  truck_haul_mean?: number;
  truck_discharge_mean?: number;
  truck_return_mean?: number;
  truck_capacity_m3?: number;
  buffer_capacity_m3?: number;
  place_fill_mean?: number;
  place_travel_mean?: number;
  place_place_mean?: number;
  place_return_mean?: number;
  place_capacity_m3?: number;
  num_trucks?: number;
  num_place?: number;
  num_pavers?: number;
  num_forms?: number;
  num_crews?: number;
  placement_method?: "dolly" | "crane" | "pump";
  place_distance_m?: number;
  place_height_m?: number;
  truck_batch_dist?: DurationDist | null;
  truck_haul_dist?: DurationDist | null;
  truck_discharge_dist?: DurationDist | null;
  truck_return_dist?: DurationDist | null;
  place_fill_dist?: DurationDist | null;
  place_travel_dist?: DurationDist | null;
  place_place_dist?: DurationDist | null;
  place_return_dist?: DurationDist | null;
  /* Triple-cycle bricklaying (opsional) */
  num_helpers?: number;
  num_masons?: number;
  fetch_payload_m2?: number;
  lift_payload_m2?: number;
  lay_payload_m2?: number;
  temp_buffer_m2?: number;
  scaffold_buffer_m2?: number;
  fetch_travel_mean?: number;
  fetch_load_mean?: number;
  fetch_unload_mean?: number;
  fetch_return_mean?: number;
  lift_take_mean?: number;
  lift_climb_mean?: number;
  lift_unload_mean?: number;
  lift_return_mean?: number;
  lay_take_mean?: number;
  lay_place_mean?: number;
  lay_finish_mean?: number;
  /* Tower crane multi-front */
  num_cranes?: number;
  capacity_ton?: number;
  heavy_load_factor?: number;
  fronts?: unknown;
  crane_fronts_json?: string;
};


export function resolveDist(
  config: SimulationConfig,
  explicit: DurationDist | null,
  mean: number,
): DurationDist {
  if (explicit) return explicit;
  const kind = config.default_dist_kind;
  const cv = config.cv;
  if (kind === "constant" || cv <= 0) {
    return makeDist({ kind: "constant", mean, cv: 0 });
  }
  return fromMeanCv(mean, cv, kind);
}

export function cycleTimeMean(config: SimulationConfig): number {
  return (
    expectedMean(resolveDist(config, config.load_dist, config.load_time_mean)) +
    expectedMean(resolveDist(config, config.haul_dist, config.haul_time_mean)) +
    expectedMean(resolveDist(config, config.dump_dist, config.dump_time_mean)) +
    expectedMean(resolveDist(config, config.return_dist, config.return_time_mean))
  );
}

export function distributionsSummary(config: SimulationConfig) {
  return {
    load: distToDict(resolveDist(config, config.load_dist, config.load_time_mean)),
    haul: distToDict(resolveDist(config, config.haul_dist, config.haul_time_mean)),
    dump: distToDict(resolveDist(config, config.dump_dist, config.dump_time_mean)),
    return: distToDict(resolveDist(config, config.return_dist, config.return_time_mean)),
  };
}

export type ActivityLog = {
  hauler_id: number;
  phase: string;
  start: number;
  end: number;
  duration: number;
};

export type CycleLog = {
  hauler_id: number;
  trip: number;
  wait: number;
  load: number;
  haul: number;
  dump: number;
  return: number;
  cycle_time: number;
  productive_time: number;
  finish_time: number;
  return_finish: number;
  volume: number;
  productivity: number;
  censored_return?: boolean;
};

export type SimulationResult = {
  operation: OperationType;
  config: SimulationConfig;
  total_trips: number;
  total_volume: number;
  throughput_per_hour: number;
  simulated_minutes: number;
  stop_reason: string;
  target_cycles: number;
  target_volume: number;
  loader_utilization: number;
  hauler_utilization: number;
  loader_busy_minutes: number;
  hauler_busy_minutes: number;
  avg_queue_wait: number;
  avg_queue_length: number;
  max_queue_length: number;
  total_wait_time: number;
  hauler_wait_ratio: number;
  completed_load_requests: number;
  censored_waits: number;
  bottleneck: string;
  bottleneck_reason: string;
  timeline_volume: [number, number][];
  queue_over_time: [number, number][];
  activity_log: ActivityLog[];
  cycle_log: CycleLog[];
  avg_cycle_components: Record<string, number>;
  hauler_trips: number[];
  hauler_busy_per_unit: number[];
  hauler_wait_per_unit: number[];
  arrival_times: number[];
  service_times: number[];
  wait_samples: number[];
};

export function resourceLabels(
  op?: OperationType,
  method?: "dolly" | "crane" | "pump" | null,
) {
  const info = getOperation(op ?? "earthmoving");
  let loader = info.loaderLabel;
  let hauler = info.haulerLabel;
  if ((op ?? "earthmoving") === "concreting") {
    hauler = "Truck mixer";
    const m = method ?? undefined;
    if (m === "dolly") loader = "Concrete buggy";
    else if (m === "crane") loader = "Crane bucket";
    else if (m === "pump") loader = "Concrete pump";
    else loader = "Unit place";
  }
  return {
    loader,
    hauler,
    unit: info.unit,
  };
}

export function emissionsFromFuel(fuelLph: number): number {
  return Math.max(0, fuelLph) * DIESEL_KG_CO2_PER_L;
}


function clipInterval(start: number, end: number, horizon: number): number {
  const s = Math.max(0, start);
  const e = Math.min(horizon, end);
  return Math.max(0, e - s);
}

type EventType =
  | "request_load"
  | "load_finish"
  | "travel_to_dump"
  | "dump_finish"
  | "travel_to_load";

type SimEvent = { t: number; seq: number; etype: EventType; hid: number };

function identifyBottleneck(
  loaderUtil: number,
  haulerUtil: number,
  avgWait: number,
  maxQueue: number,
  waitRatio: number,
  avgQLen: number,
  loaderName: string,
  haulerName: string,
): [string, string] {

  if (loaderUtil >= 0.85 && (avgWait > 0.5 || maxQueue >= 2 || avgQLen >= 0.5)) {
    return [
      loaderName,
      `${loaderName} hampir penuh (${(loaderUtil * 100).toFixed(0)}% util) dan hauler menunggu rata-rata ${avgWait.toFixed(1)} menit (antrian rata-rata ${avgQLen.toFixed(1)}). Tambah excavator atau percepat cycle load.`,
    ];
  }
  if (haulerUtil >= 0.85 && loaderUtil < 0.7 && waitRatio < 0.15) {
    return [
      haulerName,
      `${haulerName} sangat sibuk (${(haulerUtil * 100).toFixed(0)}%) sementara ${loaderName} hanya ${(loaderUtil * 100).toFixed(0)}%. Tambah unit hauler atau perpendek jarak haul/return.`,
    ];
  }
  if (loaderUtil >= haulerUtil && loaderUtil >= 0.75) {
    return [
      loaderName,
      `Utilisasi ${loaderName} (${(loaderUtil * 100).toFixed(0)}%) lebih tinggi dari hauler (${(haulerUtil * 100).toFixed(0)}%). Kapasitas loading membatasi produksi.`,
    ];
  }
  if (haulerUtil >= 0.75) {
    return [
      haulerName,
      `Utilisasi ${haulerName} (${(haulerUtil * 100).toFixed(0)}%) tinggi. Armada hauling kemungkinan menjadi pembatas.`,
    ];
  }
  return [
    "Seimbang / under-utilized",
    `Kedua resource belum saturasi (loader ${(loaderUtil * 100).toFixed(0)}%, hauler ${(haulerUtil * 100).toFixed(0)}%, fraksi tunggu hauler ${(waitRatio * 100).toFixed(0)}%). Coba what-if: ubah fleet atau cycle time.`,
  ];
}

export function defaultConfig(operation: OperationType = "earthmoving"): SimulationConfig {
  const info = getOperation(operation);
  const d = info.defaults;
  const load = d.load;
  const haul = d.haul;
  const dump = d.dump;
  const ret = d.return;
  const haulerCap = d.hauler_capacity;
  const fuelLW = d.fuel_loader_work;
  const fuelLI = d.fuel_loader_idle;
  const fuelHW = d.fuel_hauler_work;
  const fuelHI = d.fuel_hauler_idle;
  const base: SimulationConfig = {
    operation,
    num_loaders: d.num_loaders,
    num_haulers: d.num_haulers,
    loader_bucket_m3: d.loader_bucket,
    hauler_capacity_m3: haulerCap,
    load_time_mean: load,
    haul_time_mean: haul,
    dump_time_mean: dump,
    return_time_mean: ret,
    load_dist: fromMeanCv(load, 0.2, "normal"),
    haul_dist: fromMeanCv(haul, 0.2, "normal"),
    dump_dist: fromMeanCv(dump, 0.2, "normal"),
    return_dist: fromMeanCv(ret, 0.2, "normal"),
    payload_per_trip: haulerCap,
    simulation_duration: isTowerCraneOperation(operation) ? 8 * 60 : 7 * 24 * 60,
    target_cycles: d.target_cycles,
    target_volume: d.target_volume,
    stop_mode: "either",
    cv: 0.2,
    default_dist_kind: "normal",
    seed: 12345,
    cost_loader_per_hour: d.cost_loader,
    cost_hauler_per_hour: d.cost_hauler,
    cost_currency: "Rp",
    fuel_loader_work_lph: fuelLW,
    fuel_loader_idle_lph: fuelLI,
    fuel_hauler_work_lph: fuelHW,
    fuel_hauler_idle_lph: fuelHI,
    emission_loader_work_kg_per_h: emissionsFromFuel(fuelLW),
    emission_loader_idle_kg_per_h: emissionsFromFuel(fuelLI),
    emission_hauler_work_kg_per_h: emissionsFromFuel(fuelHW),
    emission_hauler_idle_kg_per_h: emissionsFromFuel(fuelHI),
    cost_loader_operator_per_hour: d.cost_loader_operator,
    cost_hauler_operator_per_hour: d.cost_hauler_operator,
    cost_all_in: false,
  };
  if (isRmcOperation(operation)) {
    const method = placementMethodOf(operation);
    const rd = rmcDualDefaults(method);
    return applyRmcToConfig(base, {
      operation: operation as OperationId,
      num_trucks: rd.num_trucks,
      num_place: rd.num_place,
      truck_capacity_m3: rd.truck_capacity_m3,
      place_capacity_m3: rd.place_capacity_m3,
      buffer_capacity_m3: rd.buffer_capacity_m3,
      truck_batch_mean: rd.truck_batch,
      truck_haul_mean: rd.truck_haul,
      truck_discharge_mean: rd.truck_discharge,
      truck_return_mean: rd.truck_return,
      place_fill_mean: rd.place_fill,
      place_travel_mean: rd.place_travel,
      place_place_mean: rd.place_place,
      place_return_mean: rd.place_return,
    });
  }
  if (isBrickOperation(operation)) {
    return applyBrickToConfig(base);
  }
  if (isTowerCraneOperation(operation)) {
    return applyTowerCraneToConfig(base);
  }
  if (isAsphaltOperation(operation)) {
    return applyAsphaltToConfig(base);
  }
  if (isPrecastOperation(operation)) {
    return applyPrecastToConfig(base);
  }
  return base;
}


export function runSimulation(configIn: SimulationConfig): SimulationResult {
  configIn = {
    ...configIn,
    target_cycles: clampTargetCycles(configIn.target_cycles),
    target_volume: clampTargetVolume(configIn.target_volume ?? 0),
  };
  if (isRmcOperation(configIn.operation)) {
    return runRmcDualSimulation(configIn);
  }
  if (isBrickOperation(configIn.operation)) {
    return runBrickTripleSimulation(configIn);
  }
  if (isTowerCraneOperation(configIn.operation)) {
    return runTowerCraneSimulation(configIn);
  }
  if (isAsphaltOperation(configIn.operation)) {
    return runAsphaltSimulation(configIn);
  }
  if (isPrecastOperation(configIn.operation)) {
    return runPrecastSimulation(configIn);
  }
  const haulerCap = Math.max(0.01, configIn.hauler_capacity_m3 ?? configIn.payload_per_trip ?? 4);
  const op = (configIn.operation || "earthmoving") as OperationType;
  const config: SimulationConfig = {
    ...configIn,
    operation: op,
    loader_bucket_m3: Math.max(0.01, configIn.loader_bucket_m3 ?? 0.5),
    hauler_capacity_m3: haulerCap,
    payload_per_trip: haulerCap,
  };


  const rng = new Rng(config.seed);
  let maxHorizon = config.simulation_duration;
  if (maxHorizon <= 0) maxHorizon = 1;

  let stopMode = (config.stop_mode || "either").toLowerCase() as
    | "duration"
    | "cycles"
    | "volume"
    | "either";
  if (!["duration", "cycles", "volume", "either"].includes(stopMode)) {
    stopMode = "either";
  }
  let targetCycles = Math.max(0, Math.floor(config.target_cycles || 0));
  let targetVolume = Math.max(0, Number(config.target_volume) || 0);
  if (stopMode === "cycles" && targetCycles <= 0) targetCycles = 1;
  if (stopMode === "volume" && targetVolume <= 0) targetVolume = 100;
  if (stopMode === "either") {
    if (targetCycles <= 0 && targetVolume <= 0) {
      targetCycles = 50;
      targetVolume = 100;
    }
  }

  const nLoaders = Math.max(1, Math.floor(config.num_loaders));
  const nHaulers = Math.max(1, Math.floor(config.num_haulers));
  config.num_loaders = nLoaders;
  config.num_haulers = nHaulers;

  const events: SimEvent[] = [];
  let seq = 0;

  const pushEvent = (t: number, etype: EventType, hid: number) => {
    seq += 1;
    events.push({ t, seq, etype, hid });
    // binary-heap-ish: keep sorted for small event counts is fine for educational sim
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  };

  let freeLoaders = nLoaders;
  const queue: [number, number][] = []; // [arrive_t, hid]

  const loaderIntervals: [number, number][] = [];
  const haulerIntervals: [number, number][][] = Array.from({ length: nHaulers }, () => []);
  const waitIntervals: [number, number][][] = Array.from({ length: nHaulers }, () => []);

  const haulerTrips = Array(nHaulers).fill(0) as number[];
  const waitSamples: number[] = [];
  const arrivalTimes: number[] = [];
  const serviceTimes: number[] = [];
  let completedLoads = 0;
  let censoredWaits = 0;

  let totalTrips = 0;
  let totalVolume = 0;
  let stopReason = "duration";
  let endTime = maxHorizon;

  const timelineVolume: [number, number][] = [[0, 0]];
  const queueOverTime: [number, number][] = [[0, 0]];
  let activityLog: ActivityLog[] = [];
  const cycleLog: CycleLog[] = [];
  const cycleState: Record<string, number>[] = Array.from({ length: nHaulers }, () => ({}));

  let lastChangeT = 0;
  let queueTimeIntegral = 0;
  let maxQueue = 0;
  let reachedCycleTarget = false;

  const loadDist = resolveDist(config, config.load_dist, config.load_time_mean);
  const haulDist = resolveDist(config, config.haul_dist, config.haul_time_mean);
  const dumpDist = resolveDist(config, config.dump_dist, config.dump_time_mean);
  const returnDist = resolveDist(config, config.return_dist, config.return_time_mean);

  const integrateQueueTo = (t: number) => {
    t = Math.min(t, maxHorizon);
    if (t > lastChangeT) {
      queueTimeIntegral += queue.length * (t - lastChangeT);
      lastChangeT = t;
    }
  };

  const recordQueueSnapshot = (t: number) => {
    const qlen = queue.length;
    maxQueue = Math.max(maxQueue, qlen);
    const last = queueOverTime[queueOverTime.length - 1];
    if (!last || last[1] !== qlen) {
      queueOverTime.push([Math.min(t, maxHorizon), qlen]);
    }
  };

  const recordActivity = (hid: number, phase: string, start: number, duration: number) => {
    const end = start + duration;
    const s = Math.max(0, start);
    const e = Math.min(maxHorizon, end);
    if (e <= s) return;
    activityLog.push({ hauler_id: hid, phase, start: s, end: e, duration: e - s });
  };

  const tryStartLoad = (now: number) => {
    if (now > maxHorizon || reachedCycleTarget) return;
    while (freeLoaders > 0 && queue.length > 0) {
      const [arriveT, hid] = queue.shift()!;
      integrateQueueTo(now);

      const wait = Math.max(0, now - arriveT);
      waitSamples.push(wait);
      if (wait > 1e-9) {
        waitIntervals[hid].push([arriveT, now]);
        recordActivity(hid, "wait", arriveT, wait);
      }
      completedLoads += 1;

      const st = cycleState[hid];
      st.arrive = arriveT;
      st.wait = wait;
      st.load_start = now;

      freeLoaders -= 1;
      const loadT = sampleDuration(loadDist, rng);
      st.load = loadT;
      serviceTimes.push(loadT);
      loaderIntervals.push([now, now + loadT]);
      haulerIntervals[hid].push([now, now + loadT]);
      recordActivity(hid, "load", now, loadT);
      pushEvent(now + loadT, "load_finish", hid);
      recordQueueSnapshot(now);
    }
  };

  for (let hid = 0; hid < nHaulers; hid++) {
    pushEvent(0, "request_load", hid);
  }

  let guard = 0;
  while (events.length > 0 && guard++ < MAX_DES_EVENTS) {
    const ev = events.shift()!;
    const { t, etype, hid } = ev;

    if (t > maxHorizon) {
      stopReason = "duration";
      break;
    }
    if (reachedCycleTarget) break;

    if (etype === "request_load") {
      if (reachedCycleTarget) continue;
      integrateQueueTo(t);
      arrivalTimes.push(t);
      queue.push([t, hid]);
      recordQueueSnapshot(t);
      tryStartLoad(t);
    } else if (etype === "load_finish") {
      freeLoaders += 1;
      tryStartLoad(t);
      if (reachedCycleTarget) continue;
      const haulT = sampleDuration(haulDist, rng);
      cycleState[hid].haul = haulT;
      haulerIntervals[hid].push([t, t + haulT]);
      recordActivity(hid, "haul", t, haulT);
      pushEvent(t + haulT, "travel_to_dump", hid);
    } else if (etype === "travel_to_dump") {
      const dumpT = sampleDuration(dumpDist, rng);
      cycleState[hid].dump = dumpT;
      haulerIntervals[hid].push([t, t + dumpT]);
      recordActivity(hid, "dump", t, dumpT);
      pushEvent(t + dumpT, "dump_finish", hid);
    } else if (etype === "dump_finish") {
      totalTrips += 1;
      haulerTrips[hid] += 1;
      totalVolume += config.payload_per_trip;
      timelineVolume.push([t, totalVolume]);

      const st = cycleState[hid];
      st.dump_finish = t;
      st.trip_no = totalTrips;

      const retT = sampleDuration(returnDist, rng);
      st.return = retT;
      haulerIntervals[hid].push([t, t + retT]);
      recordActivity(hid, "return", t, retT);
      pushEvent(t + retT, "travel_to_load", hid);
      st._partial_ready = 1;

      // Berhenti jika target siklus dan/atau target volume tercapai
      {
        const hitCycles =
          (stopMode === "cycles" || stopMode === "either") &&
          targetCycles > 0 &&
          totalTrips >= targetCycles;
        const hitVolume =
          (stopMode === "volume" || stopMode === "either") &&
          targetVolume > 0 &&
          totalVolume + 1e-9 >= targetVolume;
        if (hitCycles || hitVolume) {
          reachedCycleTarget = true;
          endTime = t;
          if (hitCycles && hitVolume) stopReason = "target_both";
          else if (hitCycles) stopReason = "target_cycles";
          else stopReason = "target_volume";
        }
      }
    } else if (etype === "travel_to_load") {
      const st = cycleState[hid];
      if (st._partial_ready) {
        const waitC = st.wait ?? 0;
        const loadC = st.load ?? 0;
        const haulC = st.haul ?? 0;
        const dumpC = st.dump ?? 0;
        const retC = st.return ?? 0;
        const productive = loadC + haulC + dumpC + retC;
        cycleLog.push({
          hauler_id: hid,
          trip: st.trip_no ?? 0,
          wait: waitC,
          load: loadC,
          haul: haulC,
          dump: dumpC,
          return: retC,
          cycle_time: waitC + productive,
          productive_time: productive,
          finish_time: st.dump_finish ?? t,
          return_finish: t,
          volume: config.payload_per_trip,
          productivity: (config.payload_per_trip / Math.max(waitC + productive, 0.05)) * 60,
        });
        cycleState[hid] = {};
      }
      if (!reachedCycleTarget) {
        pushEvent(t, "request_load", hid);
      }
    }
  }

  if (guard >= MAX_DES_EVENTS && !reachedCycleTarget) {
    endTime = maxHorizon;
    stopReason = "event_cap";
  } else if (!reachedCycleTarget) {
    endTime = maxHorizon;
    stopReason = "duration";
    const wantedCycles =
      (stopMode === "cycles" || stopMode === "either") && targetCycles > 0;
    const wantedVolume =
      (stopMode === "volume" || stopMode === "either") && targetVolume > 0;
    if (
      (wantedCycles && totalTrips < targetCycles) ||
      (wantedVolume && totalVolume + 1e-9 < targetVolume)
    ) {
      stopReason = "duration_cap";
    }
  }

  // Clip activity log
  activityLog = activityLog
    .map((a) => {
      const e = Math.min(a.end, endTime);
      if (e > a.start && a.start < endTime) {
        return { ...a, end: e, duration: e - a.start };
      }
      return null;
    })
    .filter((a): a is ActivityLog => a != null);

  integrateQueueTo(endTime);
  for (const [arriveT, hid] of queue) {
    const waitLeft = Math.max(0, endTime - arriveT);
    waitSamples.push(waitLeft);
    if (waitLeft > 1e-9) {
      waitIntervals[hid].push([arriveT, endTime]);
      recordActivity(hid, "wait", arriveT, waitLeft);
    }
    censoredWaits += 1;
  }
  if (queue.length > 0) recordQueueSnapshot(endTime);

  // Finalize partial cycles
  for (let hid = 0; hid < cycleState.length; hid++) {
    const st = cycleState[hid];
    if (!st._partial_ready) continue;
    const waitC = st.wait ?? 0;
    const loadC = st.load ?? 0;
    const haulC = st.haul ?? 0;
    const dumpC = st.dump ?? 0;
    const retC = st.return ?? 0;
    const productive = loadC + haulC + dumpC + retC;
    const cycleTime = waitC + productive;
    cycleLog.push({
      hauler_id: hid,
      trip: st.trip_no ?? 0,
      wait: waitC,
      load: loadC,
      haul: haulC,
      dump: dumpC,
      return: retC,
      cycle_time: cycleTime,
      productive_time: productive,
      finish_time: st.dump_finish ?? endTime,
      return_finish: (st.dump_finish ?? endTime) + retC,
      volume: config.payload_per_trip,
      productivity: (config.payload_per_trip / Math.max(cycleTime, 0.05)) * 60,
      censored_return: true,
    });
    cycleState[hid] = {};
  }

  cycleLog.sort((a, b) => a.trip - b.trip || a.finish_time - b.finish_time);

  const avgCycle: Record<string, number> = {};
  if (cycleLog.length > 0) {
    const keys = [
      "wait",
      "load",
      "haul",
      "dump",
      "return",
      "cycle_time",
      "productive_time",
      "productivity",
    ] as const;
    for (const k of keys) {
      avgCycle[k] = cycleLog.reduce((s, c) => s + (c[k] as number), 0) / cycleLog.length;
    }
  }

  const loaderBusy = loaderIntervals.reduce((s, [a, b]) => s + clipInterval(a, b, endTime), 0);
  const haulerBusy = haulerIntervals.map((ints) =>
    ints.reduce((s, [a, b]) => s + clipInterval(a, b, endTime), 0),
  );
  const haulerWait = waitIntervals.map((ints) =>
    ints.reduce((s, [a, b]) => s + clipInterval(a, b, endTime), 0),
  );

  const loaderCapacity = nLoaders * endTime || 1;
  const haulerCapacity = nHaulers * endTime || 1;
  const loaderUtil = Math.min(1, loaderBusy / loaderCapacity);
  const totalHaulerBusy = haulerBusy.reduce((a, b) => a + b, 0);
  const haulerUtil = Math.min(1, totalHaulerBusy / haulerCapacity);
  const totalWait = haulerWait.reduce((a, b) => a + b, 0);
  const avgWait = waitSamples.length ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length : 0;
  const avgQLen = endTime > 0 ? queueTimeIntegral / endTime : 0;
  const waitRatio = Math.min(1, totalWait / haulerCapacity);
  const hours = endTime / 60;
  const throughput = hours > 0 ? totalVolume / hours : 0;

  const labels = resourceLabels(config.operation);
  const [bottleneck, reason] = identifyBottleneck(
    loaderUtil,
    haulerUtil,
    avgWait,
    maxQueue,
    waitRatio,
    avgQLen,
    labels.loader,
    labels.hauler,
  );

  return {
    operation: config.operation,
    config,
    total_trips: totalTrips,
    total_volume: totalVolume,
    throughput_per_hour: throughput,
    simulated_minutes: endTime,
    stop_reason: stopReason,
    target_cycles: targetCycles,
    target_volume: targetVolume,
    loader_utilization: loaderUtil,
    hauler_utilization: haulerUtil,
    loader_busy_minutes: loaderBusy,
    hauler_busy_minutes: totalHaulerBusy,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQLen,
    max_queue_length: maxQueue,
    total_wait_time: totalWait,
    hauler_wait_ratio: waitRatio,
    completed_load_requests: completedLoads,
    censored_waits: censoredWaits,
    bottleneck,
    bottleneck_reason: reason,
    timeline_volume: timelineVolume,
    queue_over_time: queueOverTime,
    activity_log: activityLog,
    cycle_log: cycleLog,
    avg_cycle_components: avgCycle,
    hauler_trips: haulerTrips,
    hauler_busy_per_unit: haulerBusy,
    hauler_wait_per_unit: haulerWait,
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
  };
}
