/**
 * Bricklaying DES — discrete batches + mortar
 *
 * 4 tugas sederhana (masing-masing 1 durasi + distribusi):
 *  A fetch_mean   — helper ambil batch dari pile jauh → temp
 *  B lift_mean    — helper angkat 1 batch bata temp → slot scaffold
 *  B′ mortar_mean — helper angkat 1 ember mortar → scaffold
 *  C lay_mean     — tukang pasang (butuh bata + mortar di scaffold)
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
} from "./engine";

export function isBrickOperation(op: string | undefined): boolean {
  return op === "bricklaying";
}

export type BrickConfigFields = {
  num_helpers: number;
  num_masons: number;
  batch_bricks: number;
  scaffold_slots: number;
  temp_slots: number;
  temp_refill_threshold: number;
  mortar_buckets_max: number;
  mortar_covers_bricks: number;
  bricks_per_m2: number;
  lay_bricks_per_cycle: number;
  /** A · Helper fetch pile jauh (menit, full trip) */
  fetch_mean: number;
  /** B · Helper lift bata ke scaffold (menit, full trip) */
  lift_mean: number;
  /** B′ · Helper supply mortar (menit, full trip) */
  mortar_mean: number;
  /** C · Tukang pasang (menit per siklus) */
  lay_mean: number;
  fetch_dist?: DurationDist | null;
  lift_dist?: DurationDist | null;
  mortar_dist?: DurationDist | null;
  lay_dist?: DurationDist | null;
};

export function brickDefaults(): BrickConfigFields {
  return {
    num_helpers: 1,
    num_masons: 2,
    batch_bricks: 20,
    scaffold_slots: 3,
    temp_slots: 10,
    temp_refill_threshold: 60,
    mortar_buckets_max: 3,
    mortar_covers_bricks: 20,
    bricks_per_m2: 50,
    lay_bricks_per_cycle: 1,
    // full-cycle means (sum of former sub-phases)
    fetch_mean: 8.5, // ~ far travel+load+return+unload
    lift_mean: 5.4, // ~ take+climb+unload+return
    mortar_mean: 4.7, // ~ take+climb+place+return
    lay_mean: 1.2, // ~ take+place+finish per brick
  };
}

export function readBrickFields(cfg: SimulationConfig): BrickConfigFields {
  const d = brickDefaults();
  const c = cfg as SimulationConfig & Partial<BrickConfigFields> & {
    // legacy multi-phase → sum if present
    far_travel_mean?: number;
    far_load_mean?: number;
    far_return_mean?: number;
    far_unload_mean?: number;
    lift_take_mean?: number;
    lift_climb_mean?: number;
    lift_unload_mean?: number;
    lift_return_mean?: number;
    mortar_take_mean?: number;
    mortar_climb_mean?: number;
    mortar_place_mean?: number;
    mortar_return_mean?: number;
    lay_take_mean?: number;
    lay_place_mean?: number;
    lay_finish_mean?: number;
  };

  const legacyFetch =
    c.far_travel_mean != null
      ? (c.far_travel_mean ?? 0) +
        (c.far_load_mean ?? 0) +
        (c.far_return_mean ?? 0) +
        (c.far_unload_mean ?? 0)
      : null;
  const legacyLift =
    c.lift_take_mean != null
      ? (c.lift_take_mean ?? 0) +
        (c.lift_climb_mean ?? 0) +
        (c.lift_unload_mean ?? 0) +
        (c.lift_return_mean ?? 0)
      : null;
  const legacyMort =
    c.mortar_take_mean != null
      ? (c.mortar_take_mean ?? 0) +
        (c.mortar_climb_mean ?? 0) +
        (c.mortar_place_mean ?? 0) +
        (c.mortar_return_mean ?? 0)
      : null;
  const legacyLay =
    c.lay_take_mean != null
      ? (c.lay_take_mean ?? 0) + (c.lay_place_mean ?? 0) + (c.lay_finish_mean ?? 0)
      : null;

  return {
    num_helpers: Math.max(1, Math.floor(c.num_helpers ?? cfg.num_haulers ?? d.num_helpers)),
    num_masons: Math.max(1, Math.floor(c.num_masons ?? cfg.num_loaders ?? d.num_masons)),
    batch_bricks: Math.max(1, Math.floor(c.batch_bricks ?? d.batch_bricks)),
    scaffold_slots: Math.max(1, Math.floor(c.scaffold_slots ?? d.scaffold_slots)),
    temp_slots: Math.max(1, Math.floor(c.temp_slots ?? d.temp_slots)),
    temp_refill_threshold: Math.max(
      0,
      Math.floor(c.temp_refill_threshold ?? d.temp_refill_threshold),
    ),
    mortar_buckets_max: Math.max(1, Math.floor(c.mortar_buckets_max ?? d.mortar_buckets_max)),
    mortar_covers_bricks: Math.max(
      1,
      Math.floor(c.mortar_covers_bricks ?? d.mortar_covers_bricks),
    ),
    bricks_per_m2: Math.max(10, c.bricks_per_m2 ?? d.bricks_per_m2),
    lay_bricks_per_cycle: Math.max(1, Math.floor(c.lay_bricks_per_cycle ?? d.lay_bricks_per_cycle)),
    fetch_mean: Math.max(0.2, c.fetch_mean ?? legacyFetch ?? d.fetch_mean),
    lift_mean: Math.max(0.2, c.lift_mean ?? legacyLift ?? d.lift_mean),
    mortar_mean: Math.max(0.2, c.mortar_mean ?? legacyMort ?? d.mortar_mean),
    lay_mean: Math.max(0.1, c.lay_mean ?? legacyLay ?? d.lay_mean),
    fetch_dist: c.fetch_dist ?? null,
    lift_dist: c.lift_dist ?? null,
    mortar_dist: c.mortar_dist ?? null,
    lay_dist: c.lay_dist ?? null,
  };
}

export function applyBrickToConfig(
  base: SimulationConfig,
  fields?: Partial<BrickConfigFields>,
): SimulationConfig {
  const f = { ...readBrickFields(base), ...fields };
  const layM2 = f.lay_bricks_per_cycle / f.bricks_per_m2;
  const liftM2 = f.batch_bricks / f.bricks_per_m2;
  return {
    ...base,
    operation: "bricklaying",
    ...f,
    num_loaders: f.num_masons,
    num_haulers: f.num_helpers,
    loader_bucket_m3: layM2,
    hauler_capacity_m3: liftM2,
    payload_per_trip: layM2,
    load_time_mean: f.lay_mean,
    haul_time_mean: f.lift_mean,
    dump_time_mean: f.mortar_mean,
    return_time_mean: f.fetch_mean,
    load_dist: f.lay_dist ?? fromMeanCv(f.lay_mean, base.cv ?? 0.15, base.default_dist_kind ?? "normal"),
    haul_dist: f.lift_dist ?? fromMeanCv(f.lift_mean, base.cv ?? 0.15, base.default_dist_kind ?? "normal"),
    dump_dist: f.mortar_dist ?? fromMeanCv(f.mortar_mean, base.cv ?? 0.15, base.default_dist_kind ?? "normal"),
    return_dist: f.fetch_dist ?? fromMeanCv(f.fetch_mean, base.cv ?? 0.15, base.default_dist_kind ?? "normal"),
    cost_loader_per_hour: base.cost_loader_per_hour || 25_000,
    cost_hauler_per_hour: base.cost_hauler_per_hour || 18_000,
    fuel_loader_work_lph: 0,
    fuel_loader_idle_lph: 0,
    fuel_hauler_work_lph: 0,
    fuel_hauler_idle_lph: 0,
    emission_loader_work_kg_per_h: 0,
    emission_loader_idle_kg_per_h: 0,
    emission_hauler_work_kg_per_h: 0,
    emission_hauler_idle_kg_per_h: 0,
  } as SimulationConfig;
}

type Job = "fetch" | "lift" | "mortar" | null;
type EvKind =
  | "helper_free"
  | "fetch_done"
  | "lift_done"
  | "mortar_done"
  | "mason_free"
  | "lay_done";

type Ev = { t: number; kind: EvKind; id: number; seq: number; n?: number };

function sample(
  rng: Rng,
  config: SimulationConfig,
  mean: number,
  dist?: DurationDist | null,
): number {
  return sampleDuration(resolveDist(config, dist ?? null, mean), rng);
}

export function runBrickTripleSimulation(configIn: SimulationConfig): SimulationResult {
  const f = readBrickFields(configIn);
  const config = applyBrickToConfig(configIn, f);
  const rng = new Rng(config.seed);

  let maxHorizon = config.simulation_duration > 0 ? config.simulation_duration : 7 * 24 * 60;
  let targetCycles = Math.max(0, Math.floor(config.target_cycles || 0));
  let targetVolume = Math.max(0, Number(config.target_volume) || 0);
  if (targetCycles <= 0 && targetVolume <= 0) {
    targetCycles = 200;
    targetVolume = 10;
  }

  const batch = f.batch_bricks;
  const tempMax = f.temp_slots * batch;
  const scafMax = f.scaffold_slots * batch;
  const mortarMax = f.mortar_buckets_max;
  const mortarCap = f.mortar_covers_bricks;
  const layN = f.lay_bricks_per_cycle;
  const bpm2 = f.bricks_per_m2;
  const nH = f.num_helpers;
  const nM = f.num_masons;

  let tempBricks = tempMax;
  let scafBricks = 0;
  let scafMortarBricks = 0;
  let scafBuckets = 0;

  const events: Ev[] = [];
  let seq = 0;
  const push = (e: Omit<Ev, "seq">) => {
    seq += 1;
    events.push({ ...e, seq });
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  };

  const helperBusy: boolean[] = Array(nH).fill(false);
  const masonBusy: boolean[] = Array(nM).fill(false);
  const helperBusyInt: [number, number][][] = Array.from({ length: nH }, () => []);
  const masonBusyInt: [number, number][][] = Array.from({ length: nM }, () => []);
  const masonWaitInt: [number, number][][] = Array.from({ length: nM }, () => []);
  const helperWaitInt: [number, number][][] = Array.from({ length: nH }, () => []);
  const masonWaitStart: number[] = Array(nM).fill(-1);

  const waitSamples: number[] = [];
  const arrivalTimes: number[] = [];
  const serviceTimes: number[] = [];
  let totalTrips = 0;
  let totalVolume = 0;
  let stopReason = "duration";
  let endTime = maxHorizon;
  let reached = false;
  let masonsWaiting = 0;

  const timelineVolume: [number, number][] = [[0, 0]];
  const queueOverTime: [number, number][] = [[0, 0]];
  const activityLog: ActivityLog[] = [];
  const cycleLog: CycleLog[] = [];

  let lastChange = 0;
  let qIntegral = 0;
  let maxQueue = 0;

  const integrateQ = (t: number) => {
    t = Math.min(t, maxHorizon);
    if (t > lastChange) {
      qIntegral += masonsWaiting * (t - lastChange);
      lastChange = t;
    }
  };
  const snapQ = (t: number) => {
    maxQueue = Math.max(maxQueue, masonsWaiting);
    const last = queueOverTime[queueOverTime.length - 1];
    if (!last || last[1] !== masonsWaiting) {
      queueOverTime.push([Math.min(t, maxHorizon), masonsWaiting]);
    }
  };
  const markBusy = (ints: [number, number][][], id: number, start: number, dur: number) => {
    const s = Math.max(0, start);
    const e = Math.min(maxHorizon, start + dur);
    if (e > s) ints[id].push([s, e]);
  };
  const recAct = (hid: number, phase: string, start: number, dur: number) => {
    const s = Math.max(0, start);
    const e = Math.min(maxHorizon, start + dur);
    if (e > s) activityLog.push({ hauler_id: hid, phase, start: s, end: e, duration: e - s });
  };

  const freeScafSlots = () => Math.floor((scafMax - scafBricks) / batch);
  const freeTempSlots = () => Math.floor((tempMax - tempBricks) / batch);
  const needFetch = () => tempBricks <= f.temp_refill_threshold && freeTempSlots() > 0;
  const canLiftBrick = () => tempBricks >= batch && freeScafSlots() > 0;
  const canLiftMortar = () => scafBuckets < mortarMax;
  const canLay = () => scafBricks >= layN && scafMortarBricks >= layN;

  const tryStartHelpers = (now: number) => {
    if (reached) return;
    for (let id = 0; id < nH; id++) {
      if (helperBusy[id]) continue;
      const mortarLow = scafMortarBricks < layN * nM || scafBuckets < 1;
      let job: Job = null;
      if (mortarLow && canLiftMortar()) job = "mortar";
      else if (canLiftBrick()) job = "lift";
      else if (needFetch()) job = "fetch";
      else if (canLiftMortar()) job = "mortar";
      if (!job) continue;

      helperBusy[id] = true;
      if (job === "fetch") {
        const d = sample(rng, config, f.fetch_mean, f.fetch_dist);
        markBusy(helperBusyInt, id, now, d);
        recAct(id, "fetch", now, d);
        push({ t: now + d, kind: "fetch_done", id, n: batch });
      } else if (job === "lift") {
        tempBricks -= batch;
        const d = sample(rng, config, f.lift_mean, f.lift_dist);
        markBusy(helperBusyInt, id, now, d);
        recAct(id, "lift", now, d);
        push({ t: now + d, kind: "lift_done", id, n: batch });
      } else {
        const d = sample(rng, config, f.mortar_mean, f.mortar_dist);
        markBusy(helperBusyInt, id, now, d);
        recAct(id, "mortar", now, d);
        push({ t: now + d, kind: "mortar_done", id, n: 1 });
      }
    }
  };

  const tryStartMasons = (now: number) => {
    if (reached) return;
    for (let id = 0; id < nM; id++) {
      if (masonBusy[id]) continue;
      if (!canLay()) {
        if (masonWaitStart[id] < 0) {
          masonWaitStart[id] = now;
          masonsWaiting += 1;
          integrateQ(now);
          snapQ(now);
        }
        continue;
      }
      if (masonWaitStart[id] >= 0) {
        const w = Math.max(0, now - masonWaitStart[id]);
        waitSamples.push(w);
        if (w > 1e-9) markBusy(masonWaitInt, id, masonWaitStart[id], w);
        masonWaitStart[id] = -1;
        masonsWaiting = Math.max(0, masonsWaiting - 1);
        integrateQ(now);
        snapQ(now);
      }
      scafBricks -= layN;
      scafMortarBricks -= layN;
      scafBuckets = Math.min(mortarMax, Math.ceil(scafMortarBricks / mortarCap));

      masonBusy[id] = true;
      arrivalTimes.push(now);
      const d = sample(rng, config, f.lay_mean, f.lay_dist);
      markBusy(masonBusyInt, id, now, d);
      recAct(1000 + id, "lay", now, d);
      serviceTimes.push(d);
      push({ t: now + d, kind: "lay_done", id, n: layN });
    }
  };

  for (let id = 0; id < nH; id++) push({ t: 0, kind: "helper_free", id });
  for (let id = 0; id < nM; id++) push({ t: 0, kind: "mason_free", id });

  let safety = 0;
  while (events.length > 0 && safety < 3_000_000) {
    safety += 1;
    const ev = events.shift()!;
    const now = ev.t;
    if (now > maxHorizon + 1e-9) break;

    switch (ev.kind) {
      case "helper_free":
        helperBusy[ev.id] = false;
        tryStartHelpers(now);
        tryStartMasons(now);
        break;

      case "fetch_done": {
        if (freeTempSlots() <= 0) {
          const wait = 0.25;
          markBusy(helperWaitInt, ev.id, now, wait);
          push({ t: now + wait, kind: "fetch_done", id: ev.id, n: batch });
          break;
        }
        tempBricks = Math.min(tempMax, tempBricks + (ev.n ?? batch));
        helperBusy[ev.id] = false;
        tryStartHelpers(now);
        tryStartMasons(now);
        break;
      }

      case "lift_done": {
        if (freeScafSlots() <= 0) {
          // rare: slot taken while en route — wait then retry deposit
          const wait = 0.25;
          markBusy(helperWaitInt, ev.id, now, wait);
          push({ t: now + wait, kind: "lift_done", id: ev.id, n: ev.n });
          break;
        }
        scafBricks = Math.min(scafMax, scafBricks + (ev.n ?? batch));
        helperBusy[ev.id] = false;
        tryStartHelpers(now);
        tryStartMasons(now);
        break;
      }

      case "mortar_done": {
        if (scafBuckets >= mortarMax) {
          const wait = 0.25;
          markBusy(helperWaitInt, ev.id, now, wait);
          push({ t: now + wait, kind: "mortar_done", id: ev.id, n: 1 });
          break;
        }
        scafBuckets = Math.min(mortarMax, scafBuckets + 1);
        scafMortarBricks = Math.min(mortarMax * mortarCap, scafMortarBricks + mortarCap);
        helperBusy[ev.id] = false;
        tryStartHelpers(now);
        tryStartMasons(now);
        break;
      }

      case "mason_free":
        masonBusy[ev.id] = false;
        tryStartMasons(now);
        tryStartHelpers(now);
        break;

      case "lay_done": {
        const bricks = ev.n ?? layN;
        const vol = bricks / bpm2;
        totalTrips += 1;
        totalVolume += vol;
        timelineVolume.push([now, totalVolume]);
        cycleLog.push({
          hauler_id: 1000 + ev.id,
          trip: totalTrips,
          wait: 0,
          load: f.lay_mean,
          haul: 0,
          dump: 0,
          return: 0,
          cycle_time: f.lay_mean,
          productive_time: f.lay_mean,
          finish_time: now,
          return_finish: now,
          volume: vol,
          productivity: vol > 0 ? vol / Math.max(1e-9, f.lay_mean / 60) : 0,
        });

        if (!reached) {
          const hitC = targetCycles > 0 && totalTrips >= targetCycles;
          const hitV = targetVolume > 0 && totalVolume >= targetVolume - 1e-9;
          const mode = config.stop_mode ?? "either";
          if (hitC && hitV) {
            reached = true;
            stopReason = "target_both";
            endTime = now;
          } else if (mode === "either" && (hitC || hitV)) {
            reached = true;
            stopReason = hitC ? "target_cycles" : "target_volume";
            endTime = now;
          } else if (mode === "cycles" && hitC) {
            reached = true;
            stopReason = "target_cycles";
            endTime = now;
          } else if (mode === "volume" && hitV) {
            reached = true;
            stopReason = "target_volume";
            endTime = now;
          }
        }
        masonBusy[ev.id] = false;
        if (!reached) {
          tryStartMasons(now);
          tryStartHelpers(now);
        }
        break;
      }
    }
    if (reached) break;
  }

  if (!reached) {
    endTime = maxHorizon;
    stopReason = targetCycles > 0 || targetVolume > 0 ? "duration_cap" : "duration";
  }
  integrateQ(endTime);
  snapQ(endTime);

  const horizon = Math.max(endTime, 1e-9);
  const sumBusy = (ints: [number, number][][]) =>
    ints.reduce(
      (s, rows) =>
        s + rows.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, horizon) - Math.max(x, 0)), 0),
      0,
    );
  const masonBusyMin = sumBusy(masonBusyInt);
  const helperBusyMin = sumBusy(helperBusyInt);
  const masonWaitMin = sumBusy(masonWaitInt);
  const helperWaitMin = sumBusy(helperWaitInt);
  const loaderUtil = Math.min(1, masonBusyMin / (nM * horizon));
  const haulerUtil = Math.min(1, helperBusyMin / (nH * horizon));
  const avgWait = waitSamples.length
    ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length
    : 0;
  const avgQ = qIntegral / horizon;
  const throughput = (totalVolume / horizon) * 60;

  let bottleneck = "Seimbang";
  let bottleneck_reason = "Supply bata/mortar dan tukang relatif seimbang.";
  if (loaderUtil > 0.85 && avgWait < 0.3) {
    bottleneck = "Tukang";
    bottleneck_reason = "Tukang jenuh — tambah tukang atau percepat pasang.";
  } else if (haulerUtil > 0.85 && loaderUtil < 0.7) {
    bottleneck = "Helper";
    bottleneck_reason =
      "Helper sibuk (fetch / lift / mortar). Tambah helper atau perbesar slot scaffold.";
  } else if (avgWait > 1 || avgQ > 0.4) {
    bottleneck = "Scaffold stock / mortar";
    bottleneck_reason =
      "Tukang menunggu bata atau mortar di scaffold — isi slot atau ember mortar.";
  }

  return {
    operation: "bricklaying",
    config: { ...config, num_loaders: nM, num_haulers: nH },
    total_trips: totalTrips,
    total_volume: totalVolume,
    throughput_per_hour: throughput,
    simulated_minutes: horizon,
    stop_reason: stopReason,
    target_cycles: targetCycles,
    target_volume: targetVolume,
    loader_utilization: loaderUtil,
    hauler_utilization: haulerUtil,
    loader_busy_minutes: masonBusyMin,
    hauler_busy_minutes: helperBusyMin,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQ,
    max_queue_length: maxQueue,
    total_wait_time: masonWaitMin + helperWaitMin,
    hauler_wait_ratio: helperBusyMin > 0 ? helperWaitMin / (helperBusyMin + helperWaitMin) : 0,
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
      load: f.lay_mean,
      haul: f.lift_mean,
      dump: f.mortar_mean,
      return: f.fetch_mean,
    },
    hauler_trips: Array(nH).fill(0),
    hauler_busy_per_unit: helperBusyInt.map((rows) =>
      rows.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, horizon) - Math.max(x, 0)), 0),
    ),
    hauler_wait_per_unit: helperWaitInt.map((rows) =>
      rows.reduce((a, [x, y]) => a + Math.max(0, Math.min(y, horizon) - Math.max(x, 0)), 0),
    ),
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
  };
}

export function brickTheoreticalThroughput(cfg: SimulationConfig): {
  fetch: number;
  lift: number;
  lay: number;
  mortar: number;
  system: number;
} {
  const f = readBrickFields(cfg);
  const batch = f.batch_bricks;
  const bpm2 = f.bricks_per_m2;
  const share = f.num_helpers / 3;
  const fetch = f.fetch_mean > 0 ? (60 / f.fetch_mean) * share * (batch / bpm2) : 0;
  const lift = f.lift_mean > 0 ? (60 / f.lift_mean) * share * (batch / bpm2) : 0;
  const mortar =
    f.mortar_mean > 0
      ? (60 / f.mortar_mean) * share * (f.mortar_covers_bricks / bpm2)
      : 0;
  const lay =
    f.lay_mean > 0
      ? (60 / f.lay_mean) * f.num_masons * (f.lay_bricks_per_cycle / bpm2)
      : 0;
  return { fetch, lift, lay, mortar, system: Math.min(fetch, lift, mortar, lay) };
}
