/**
 * Tower Crane — single server, multi-front, simple Poisson + service DES
 *
 * Per front:
 *  - Request arrivals: Poisson process → inter-arrival Exponential(mean_request_interval)
 *  - Service time when crane serves that front: mean + DurationDist
 *  - Priority 1 = highest (preempt? no — non-preemptive priority queue)
 *
 * Crane: one (or two) server(s). Stop by max operation time (default 8h).
 */

import { Rng } from "./rng";
import {
  fromMeanCv,
  type SimulationConfig,
  type SimulationResult,
  type CycleLog,
  type ActivityLog,
  type DurationDist,
  sampleDuration,
  resolveDist,
  type DistKind,
} from "./engine";

export function isTowerCraneOperation(op: string | undefined): boolean {
  return op === "tower_crane";
}

export type CraneFront = {
  id: number;
  name: string;
  /** 1 = prioritas tertinggi */
  priority: number;
  /** volume/unit kerja per lift */
  volume_per_lift: number;
  /**
   * Mean inter-arrival permintaan (menit).
   * Poisson process → Exp(mean). Rate λ = 1/mean.
   */
  request_interval_mean: number;
  /** Mean durasi service crane untuk front ini (menit, full trip yard↔front) */
  service_mean: number;
  /**
   * Tarif crew di front (Rp/jam) untuk biaya waste tunggu.
   * Default upah regu lapangan mid-ID.
   */
  crew_cost_per_hour: number;
  /** Distribusi inter-arrival (default exponential = Poisson process) */
  request_dist?: DurationDist | null;
  /** Distribusi service */
  service_dist?: DurationDist | null;
  enabled: boolean;
};

export type TowerCraneFields = {
  num_cranes: number;
  fronts: CraneFront[];
};

export function defaultFronts(): CraneFront[] {
  const exp = (mean: number): DurationDist =>
    fromMeanCv(mean, 1, "exponential"); // CV≈1 for exponential
  const svc = (mean: number): DurationDist => fromMeanCv(mean, 0.2, "normal");

  return [
    {
      id: 0,
      name: "Front A · formwork",
      priority: 1,
      volume_per_lift: 1.2,
      request_interval_mean: 12,
      service_mean: 7.5,
      crew_cost_per_hour: 120_000, // regu formwork
      request_dist: exp(12),
      service_dist: svc(7.5),
      enabled: true,
    },
    {
      id: 1,
      name: "Front B · rebar",
      priority: 2,
      volume_per_lift: 0.8,
      request_interval_mean: 10,
      service_mean: 6.4,
      crew_cost_per_hour: 100_000,
      request_dist: exp(10),
      service_dist: svc(6.4),
      enabled: true,
    },
    {
      id: 2,
      name: "Front C · concrete bucket",
      priority: 3,
      volume_per_lift: 1.0,
      request_interval_mean: 8,
      service_mean: 9.2,
      crew_cost_per_hour: 130_000,
      request_dist: exp(8),
      service_dist: svc(9.2),
      enabled: true,
    },
    {
      id: 3,
      name: "Front D · MEP",
      priority: 4,
      volume_per_lift: 0.5,
      request_interval_mean: 15,
      service_mean: 5.4,
      crew_cost_per_hour: 90_000,
      request_dist: exp(15),
      service_dist: svc(5.4),
      enabled: false,
    },
    {
      id: 4,
      name: "Front E · finishing",
      priority: 5,
      volume_per_lift: 0.4,
      request_interval_mean: 18,
      service_mean: 4.7,
      crew_cost_per_hour: 80_000,
      request_dist: exp(18),
      service_dist: svc(4.7),
      enabled: false,
    },
  ];
}

export function towerCraneDefaults(): TowerCraneFields {
  return {
    num_cranes: 1,
    fronts: defaultFronts(),
  };
}

export function readTowerCraneFields(cfg: SimulationConfig): TowerCraneFields {
  const d = towerCraneDefaults();
  const c = cfg as SimulationConfig & Partial<TowerCraneFields> & {
    crane_fronts_json?: string;
  };
  let fronts = d.fronts;
  if (Array.isArray(c.fronts) && c.fronts.length) fronts = c.fronts as CraneFront[];
  else if (typeof c.crane_fronts_json === "string") {
    try {
      const parsed = JSON.parse(c.crane_fronts_json) as CraneFront[];
      if (Array.isArray(parsed) && parsed.length) fronts = parsed;
    } catch {
      /* keep */
    }
  }

  const defs = defaultFronts();
  return {
    num_cranes: Math.max(1, Math.min(2, Math.floor(c.num_cranes ?? 1))),
    fronts: fronts.map((f, i) => {
      const base = defs[i] ?? defs[0];
      // legacy multi-phase → sum service
      const legacy = f as CraneFront & {
        hook_mean?: number;
        hoist_mean?: number;
        swing_mean?: number;
        lower_mean?: number;
        unhook_mean?: number;
        return_empty_mean?: number;
        local_work_mean?: number;
      };
      const legacySvc =
        legacy.hook_mean != null
          ? (legacy.hook_mean ?? 0) +
            (legacy.hoist_mean ?? 0) +
            (legacy.swing_mean ?? 0) +
            (legacy.lower_mean ?? 0) +
            (legacy.unhook_mean ?? 0) +
            (legacy.return_empty_mean ?? 0)
          : null;
      const reqMean = Math.max(
        0.5,
        legacy.request_interval_mean ?? legacy.local_work_mean ?? base.request_interval_mean,
      );
      const svcMean = Math.max(0.5, legacy.service_mean ?? legacySvc ?? base.service_mean);
      return {
        id: i,
        name: f.name || base.name,
        priority: Math.max(1, Math.min(9, Math.floor(f.priority || i + 1))),
        volume_per_lift: Math.max(0.05, f.volume_per_lift ?? base.volume_per_lift),
        request_interval_mean: reqMean,
        service_mean: svcMean,
        crew_cost_per_hour: Math.max(
          0,
          f.crew_cost_per_hour ?? base.crew_cost_per_hour ?? 100_000,
        ),
        request_dist:
          f.request_dist ??
          fromMeanCv(reqMean, 1, "exponential" as DistKind),
        service_dist: f.service_dist ?? fromMeanCv(svcMean, 0.2, "normal"),
        enabled: f.enabled !== false,
      };
    }),
  };
}

export function applyTowerCraneToConfig(
  base: SimulationConfig,
  fields?: Partial<TowerCraneFields>,
): SimulationConfig {
  const f = { ...readTowerCraneFields(base), ...fields };
  const fronts = f.fronts;
  const avgSvc =
    fronts.filter((x) => x.enabled).reduce((s, x) => s + x.service_mean, 0) /
      Math.max(1, fronts.filter((x) => x.enabled).length) || 8;
  const avgReq =
    fronts.filter((x) => x.enabled).reduce((s, x) => s + x.request_interval_mean, 0) /
      Math.max(1, fronts.filter((x) => x.enabled).length) || 10;

  return {
    ...base,
    operation: "tower_crane",
    num_loaders: f.num_cranes,
    num_haulers: fronts.filter((x) => x.enabled).length || 1,
    loader_bucket_m3: 1,
    hauler_capacity_m3: 1,
    payload_per_trip: 1,
    load_time_mean: avgSvc,
    haul_time_mean: avgReq,
    dump_time_mean: 0.1,
    return_time_mean: 0.1,
    load_dist: fromMeanCv(avgSvc, 0.2, "normal"),
    haul_dist: fromMeanCv(avgReq, 1, "exponential"),
    dump_dist: fromMeanCv(0.1, 0, "constant"),
    return_dist: fromMeanCv(0.1, 0, "constant"),
    num_cranes: f.num_cranes,
    fronts: f.fronts,
    crane_fronts_json: JSON.stringify(f.fronts),
    cost_loader_per_hour: base.cost_loader_per_hour || 500_000,
    cost_hauler_per_hour: 0,
    fuel_loader_work_lph: base.fuel_loader_work_lph || 8,
    fuel_loader_idle_lph: base.fuel_loader_idle_lph || 2,
    fuel_hauler_work_lph: 0,
    fuel_hauler_idle_lph: 0,
    emission_loader_work_kg_per_h: base.emission_loader_work_kg_per_h || 21,
    emission_loader_idle_kg_per_h: base.emission_loader_idle_kg_per_h || 5.3,
    emission_hauler_work_kg_per_h: 0,
    emission_hauler_idle_kg_per_h: 0,
  } as SimulationConfig;
}

type Req = {
  frontId: number;
  priority: number;
  arrive: number;
  seq: number;
};

type EvKind = "request" | "service_done";
type Ev = { t: number; kind: EvKind; frontId: number; craneId?: number; seq: number };

function sampleDist(
  rng: Rng,
  config: SimulationConfig,
  mean: number,
  dist?: DurationDist | null,
): number {
  return Math.max(0.05, sampleDuration(resolveDist(config, dist ?? null, mean), rng));
}

export type FrontStats = {
  id: number;
  name: string;
  priority: number;
  lifts: number;
  volume: number;
  /** mean wait request → mulai service (menit) */
  wait_avg: number;
  wait_max: number;
  wait_p50: number;
  wait_p90: number;
  wait_total: number;
  requests: number;
  /** request yang belum dilayani di akhir shift */
  unserved: number;
  /** unserved / requests (0–1) */
  starvation_rate: number;
  /** wait_avg / wait_avg_prio1 (≥1 berarti lebih lama dari front prio 1) */
  wait_ratio_vs_p1: number;
  /** tarif crew front (Rp/jam) */
  crew_cost_per_hour: number;
  /** waste = (wait_total/60) × crew_cost_per_hour */
  waste_cost: number;
};

export type TowerCraneExtra = {
  front_stats?: FrontStats[];
  /** total waste crew semua front */
  total_waste_cost?: number;
  /** biaya crane + waste */
  total_cost_with_waste?: number;
  /** wait avg front prioritas terbaik */
  p1_wait_avg?: number;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function runTowerCraneSimulation(configIn: SimulationConfig): SimulationResult &
  TowerCraneExtra {
  const f = readTowerCraneFields(configIn);
  const config = applyTowerCraneToConfig(configIn, f);
  const rng = new Rng(config.seed);

  const maxHorizon =
    config.simulation_duration > 0 ? config.simulation_duration : 8 * 60;

  const fronts = f.fronts.filter((x) => x.enabled);
  const nCrane = f.num_cranes;
  if (fronts.length === 0) {
    return emptyResult(config, maxHorizon);
  }

  const events: Ev[] = [];
  let seq = 0;
  const push = (e: Omit<Ev, "seq">) => {
    seq += 1;
    events.push({ ...e, seq });
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  };

  const queue: Req[] = [];
  let reqSeq = 0;
  const craneBusy = Array(nCrane).fill(false) as boolean[];
  const craneBusyInt: [number, number][][] = Array.from({ length: nCrane }, () => []);
  const activityLog: ActivityLog[] = [];
  const cycleLog: CycleLog[] = [];
  const arrivalTimes: number[] = [];
  const serviceTimes: number[] = [];
  const waitSamples: number[] = [];

  const stats = fronts.map((fr) => ({
    id: fr.id,
    name: fr.name,
    priority: fr.priority,
    lifts: 0,
    volume: 0,
    wait_total: 0,
    requests: 0,
    waits: [] as number[],
  }));
  const statById = new Map(stats.map((s) => [s.id, s]));
  const frontById = new Map(fronts.map((fr) => [fr.id, fr]));

  let totalTrips = 0;
  let totalVolume = 0;
  const timelineVolume: [number, number][] = [[0, 0]];
  const queueOverTime: [number, number][] = [[0, 0]];
  let lastChange = 0;
  let qIntegral = 0;
  let maxQueue = 0;
  let queueLen = 0;

  const integrateQ = (t: number) => {
    t = Math.min(t, maxHorizon);
    if (t > lastChange) {
      qIntegral += queueLen * (t - lastChange);
      lastChange = t;
    }
  };
  const snapQ = (t: number) => {
    maxQueue = Math.max(maxQueue, queueLen);
    const last = queueOverTime[queueOverTime.length - 1];
    if (!last || last[1] !== queueLen) {
      queueOverTime.push([Math.min(t, maxHorizon), queueLen]);
    }
  };

  const scheduleNextRequest = (frontId: number, from: number) => {
    const fr = frontById.get(frontId);
    if (!fr) return;
    const ia = sampleDist(rng, config, fr.request_interval_mean, fr.request_dist);
    const t = from + ia;
    if (t <= maxHorizon + 1e-9) {
      push({ t, kind: "request", frontId });
    }
  };

  const pickFromQueue = (): Req | null => {
    if (!queue.length) return null;
    // priority min first, then FIFO (seq)
    queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    return queue.shift()!;
  };

  const tryDispatch = (now: number) => {
    for (let c = 0; c < nCrane; c++) {
      if (craneBusy[c]) continue;
      const req = pickFromQueue();
      if (!req) return;
      queueLen = Math.max(0, queueLen - 1);
      integrateQ(now);
      snapQ(now);

      const fr = frontById.get(req.frontId);
      if (!fr) continue;
      const wait = Math.max(0, now - req.arrive);
      waitSamples.push(wait);
      const st = statById.get(req.frontId);
      if (st) {
        st.wait_total += wait;
        st.waits.push(wait);
      }

      const svc = sampleDist(rng, config, fr.service_mean, fr.service_dist);
      serviceTimes.push(svc);
      arrivalTimes.push(req.arrive);
      craneBusy[c] = true;
      const end = Math.min(maxHorizon, now + svc);
      if (end > now) craneBusyInt[c].push([now, end]);
      activityLog.push({
        hauler_id: req.frontId,
        phase: "service",
        start: now,
        end: now + svc,
        duration: svc,
      });
      push({ t: now + svc, kind: "service_done", frontId: req.frontId, craneId: c });
    }
  };

  // initial requests: first arrival after Exp from t=0
  for (const fr of fronts) {
    scheduleNextRequest(fr.id, 0);
  }

  let safety = 0;
  while (events.length > 0 && safety < 5_000_000) {
    safety += 1;
    const ev = events.shift()!;
    const now = ev.t;
    if (now > maxHorizon + 1e-9) break;

    if (ev.kind === "request") {
      const fr = frontById.get(ev.frontId);
      if (!fr) continue;
      const st = statById.get(ev.frontId);
      if (st) st.requests += 1;

      reqSeq += 1;
      queue.push({
        frontId: ev.frontId,
        priority: fr.priority,
        arrive: now,
        seq: reqSeq,
      });
      queueLen += 1;
      integrateQ(now);
      snapQ(now);

      // next Poisson request for this front
      scheduleNextRequest(ev.frontId, now);
      tryDispatch(now);
    } else {
      // service done
      const c = ev.craneId ?? 0;
      craneBusy[c] = false;
      const fr = frontById.get(ev.frontId);
      const st = statById.get(ev.frontId);
      if (fr && st) {
        st.lifts += 1;
        st.volume += fr.volume_per_lift;
        totalTrips += 1;
        totalVolume += fr.volume_per_lift;
        timelineVolume.push([now, totalVolume]);
        cycleLog.push({
          hauler_id: ev.frontId,
          trip: totalTrips,
          wait: 0,
          load: fr.service_mean,
          haul: 0,
          dump: 0,
          return: 0,
          cycle_time: fr.service_mean,
          productive_time: fr.service_mean,
          finish_time: now,
          return_finish: now,
          volume: fr.volume_per_lift,
          productivity:
            fr.volume_per_lift > 0
              ? fr.volume_per_lift / Math.max(1e-9, fr.service_mean / 60)
              : 0,
        });
      }
      tryDispatch(now);
    }
  }

  integrateQ(maxHorizon);
  snapQ(maxHorizon);

  // censored waits: request still in queue at end of shift
  for (const req of queue) {
    const wait = Math.max(0, maxHorizon - req.arrive);
    waitSamples.push(wait);
    const st = statById.get(req.frontId);
    if (st) {
      st.wait_total += wait;
      st.waits.push(wait);
    }
  }

  const horizon = maxHorizon;
  const craneBusyMin = craneBusyInt.reduce(
    (s, rows) =>
      s + rows.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, horizon) - Math.max(x, 0)), 0),
    0,
  );
  const loaderUtil = Math.min(1, craneBusyMin / (nCrane * horizon));
  const avgWait = waitSamples.length
    ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length
    : 0;
  const avgQ = qIntegral / Math.max(horizon, 1e-9);
  const throughput = (totalVolume / horizon) * 60;

  const front_stats_raw = stats.map((s) => {
    const sorted = [...s.waits].sort((a, b) => a - b);
    const fr = frontById.get(s.id);
    const unserved = Math.max(0, s.requests - s.lifts);
    const wait_avg = sorted.length ? s.wait_total / sorted.length : 0;
    const crew = fr?.crew_cost_per_hour ?? 0;
    const waste_cost = (s.wait_total / 60) * crew;
    return {
      id: s.id,
      name: s.name,
      priority: s.priority,
      lifts: s.lifts,
      volume: s.volume,
      wait_avg,
      wait_max: sorted.length ? sorted[sorted.length - 1] : 0,
      wait_p50: percentile(sorted, 0.5),
      wait_p90: percentile(sorted, 0.9),
      wait_total: s.wait_total,
      requests: s.requests,
      unserved,
      starvation_rate: s.requests > 0 ? unserved / s.requests : 0,
      wait_ratio_vs_p1: 1, // filled below
      crew_cost_per_hour: crew,
      waste_cost,
    };
  });

  // reference: best priority among active (min priority number)
  const bestPrio = Math.min(...front_stats_raw.map((s) => s.priority));
  const p1Waits = front_stats_raw.filter((s) => s.priority === bestPrio);
  const p1_wait_avg =
    p1Waits.length > 0
      ? p1Waits.reduce((a, s) => a + s.wait_avg, 0) / p1Waits.length
      : 0;
  const front_stats: FrontStats[] = front_stats_raw.map((s) => ({
    ...s,
    wait_ratio_vs_p1:
      p1_wait_avg > 1e-6
        ? s.wait_avg / p1_wait_avg
        : s.wait_avg > 0
          ? 99
          : 1,
  }));

  const totalWait = front_stats.reduce((s, x) => s + x.wait_total, 0);
  const total_waste_cost = front_stats.reduce((s, x) => s + x.waste_cost, 0);

  // crane cost (sewa) for total_with_waste
  const hours = horizon / 60;
  const craneRate =
    (config.cost_loader_per_hour || 0) +
    (config.cost_all_in ? config.cost_loader_operator_per_hour || 0 : 0);
  const crane_cost = nCrane * craneRate * hours;
  const total_cost_with_waste = crane_cost + total_waste_cost;

  let bottleneck = "Seimbang";
  let bottleneck_reason = "Crane dan frekuensi request relatif seimbang.";
  if (loaderUtil > 0.9 && avgWait > 1) {
    bottleneck = "Tower crane";
    bottleneck_reason =
      "Crane jenuh + antrian panjang — kurangi front, naikkan prioritas, atau tambah crane.";
  } else if (loaderUtil < 0.5 && avgWait < 0.5) {
    bottleneck = "Front (request rendah)";
    bottleneck_reason =
      "Crane sering idle — front jarang minta (interval Poisson panjang) atau service cepat.";
  } else if (avgWait > 2) {
    bottleneck = "Antrian prioritas";
    bottleneck_reason =
      "Wait tinggi — front prioritas rendah menanti; periksa distribusi request vs service.";
  }

  return {
    operation: "tower_crane",
    config: { ...config, num_loaders: nCrane, num_haulers: fronts.length },
    total_trips: totalTrips,
    total_volume: totalVolume,
    throughput_per_hour: throughput,
    simulated_minutes: horizon,
    stop_reason: "duration",
    target_cycles: 0,
    target_volume: 0,
    loader_utilization: loaderUtil,
    hauler_utilization: Math.min(1, totalWait / (fronts.length * horizon + 1e-9)),
    loader_busy_minutes: craneBusyMin,
    hauler_busy_minutes: totalWait,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQ,
    max_queue_length: maxQueue,
    total_wait_time: totalWait,
    hauler_wait_ratio: 0,
    completed_load_requests: totalTrips,
    censored_waits: 0,
    bottleneck,
    bottleneck_reason,
    timeline_volume: timelineVolume,
    queue_over_time: queueOverTime,
    activity_log: activityLog,
    cycle_log: cycleLog,
    avg_cycle_components: {
      wait: avgWait,
      load: fronts.reduce((s, x) => s + x.service_mean, 0) / fronts.length,
      haul: fronts.reduce((s, x) => s + x.request_interval_mean, 0) / fronts.length,
      dump: 0,
      return: 0,
    },
    hauler_trips: front_stats.map((s) => s.lifts),
    hauler_busy_per_unit: front_stats.map((s) => s.lifts * (frontById.get(s.id)?.service_mean ?? 0)),
    hauler_wait_per_unit: front_stats.map((s) => s.wait_total),
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
    front_stats,
    total_waste_cost,
    total_cost_with_waste,
    p1_wait_avg,
  };
}

function emptyResult(config: SimulationConfig, horizon: number): SimulationResult {
  return {
    operation: "tower_crane",
    config,
    total_trips: 0,
    total_volume: 0,
    throughput_per_hour: 0,
    simulated_minutes: horizon,
    stop_reason: "duration",
    target_cycles: 0,
    target_volume: 0,
    loader_utilization: 0,
    hauler_utilization: 0,
    loader_busy_minutes: 0,
    hauler_busy_minutes: 0,
    avg_queue_wait: 0,
    avg_queue_length: 0,
    max_queue_length: 0,
    total_wait_time: 0,
    hauler_wait_ratio: 0,
    completed_load_requests: 0,
    censored_waits: 0,
    bottleneck: "—",
    bottleneck_reason: "Tidak ada front aktif.",
    timeline_volume: [[0, 0]],
    queue_over_time: [[0, 0]],
    activity_log: [],
    cycle_log: [],
    avg_cycle_components: { wait: 0, load: 0, haul: 0, dump: 0, return: 0 },
    hauler_trips: [],
    hauler_busy_per_unit: [],
    hauler_wait_per_unit: [],
    arrival_times: [],
    service_times: [],
    wait_samples: [],
  };
}

export function towerCraneTheory(fields: TowerCraneFields): {
  demand: number;
  crane_cap: number;
  util_theory: number;
} {
  const active = fields.fronts.filter((x) => x.enabled);
  // demand unit/h = Σ (60 / E[interarrival]) * volume
  const demand = active.reduce((s, fr) => {
    const rate = fr.request_interval_mean > 0 ? 60 / fr.request_interval_mean : 0;
    return s + rate * fr.volume_per_lift;
  }, 0);
  // capacity: servers / mean service * avg volume
  const avgSvc =
    active.reduce((s, x) => s + x.service_mean, 0) / Math.max(1, active.length) || 1;
  const avgVol =
    active.reduce((s, x) => s + x.volume_per_lift, 0) / Math.max(1, active.length) || 1;
  const crane_cap = fields.num_cranes * (60 / avgSvc) * avgVol;
  return {
    demand,
    crane_cap,
    util_theory: crane_cap > 0 ? demand / crane_cap : 0,
  };
}
