/**
 * Asphalt paving DES (Halpin Ch.11 simplified)
 *
 * Cycles:
 *  A Truck: plant load → haul → dump to paver hopper → return
 *  B Paver: spread when hopper has material
 *  C Breakdown roller: compact section after N spreads
 *  D Finish roller: finish after breakdown
 *
 * Production (m³) counted when paver finishes spread (asphalt placed).
 * Finish completes "quality" sections (tracked in trips for finish count).
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

export function isAsphaltOperation(op: string | undefined): boolean {
  return op === "asphalt_paving";
}

export type AsphaltFields = {
  num_trucks: number;
  num_pavers: number;
  num_breakdown: number;
  num_finish: number;
  plant_bays: number;
  hopper_loads: number;
  truck_capacity_m3: number;
  spreads_per_breakdown: number;
  plant_load_mean: number;
  haul_mean: number;
  dump_mean: number;
  return_mean: number;
  spread_mean: number;
  breakdown_mean: number;
  finish_mean: number;
  plant_load_dist?: DurationDist | null;
  haul_dist?: DurationDist | null;
  dump_dist?: DurationDist | null;
  return_dist?: DurationDist | null;
  spread_dist?: DurationDist | null;
  breakdown_dist?: DurationDist | null;
  finish_dist?: DurationDist | null;
  cost_truck_per_hour: number;
  cost_paver_per_hour: number;
  cost_breakdown_per_hour: number;
  cost_finish_per_hour: number;
  cost_plant_per_hour: number;
  fuel_truck_work: number;
  fuel_truck_idle: number;
  fuel_paver_work: number;
  fuel_paver_idle: number;
};

export function asphaltDefaults(): AsphaltFields {
  return {
    num_trucks: 6,
    num_pavers: 1,
    num_breakdown: 1,
    num_finish: 1,
    plant_bays: 1,
    hopper_loads: 2,
    truck_capacity_m3: 8,
    spreads_per_breakdown: 5,
    plant_load_mean: 4,
    haul_mean: 12,
    dump_mean: 1.5,
    return_mean: 11,
    spread_mean: 3.5,
    breakdown_mean: 8,
    finish_mean: 10,
    cost_truck_per_hour: 350_000,
    cost_paver_per_hour: 1_200_000,
    cost_breakdown_per_hour: 450_000,
    cost_finish_per_hour: 400_000,
    cost_plant_per_hour: 800_000,
    fuel_truck_work: 12,
    fuel_truck_idle: 2.5,
    fuel_paver_work: 18,
    fuel_paver_idle: 5,
  };
}

export function readAsphaltFields(cfg: SimulationConfig): AsphaltFields {
  const d = asphaltDefaults();
  const c = cfg as SimulationConfig & Partial<AsphaltFields>;
  return {
    num_trucks: Math.max(1, Math.floor(cfg.num_haulers ?? c.num_trucks ?? d.num_trucks)),
    num_pavers: Math.max(1, Math.floor(cfg.num_loaders ?? c.num_pavers ?? d.num_pavers)),
    num_breakdown: Math.max(0, Math.floor(c.num_breakdown ?? d.num_breakdown)),
    num_finish: Math.max(0, Math.floor(c.num_finish ?? d.num_finish)),
    plant_bays: Math.max(1, Math.floor(c.plant_bays ?? d.plant_bays)),
    hopper_loads: Math.max(1, Math.floor(c.hopper_loads ?? d.hopper_loads)),
    truck_capacity_m3: Math.max(0.5, c.truck_capacity_m3 ?? cfg.hauler_capacity_m3 ?? d.truck_capacity_m3),
    spreads_per_breakdown: Math.max(1, Math.floor(c.spreads_per_breakdown ?? d.spreads_per_breakdown)),
    plant_load_mean: Math.max(0.2, c.plant_load_mean ?? cfg.load_time_mean ?? d.plant_load_mean),
    haul_mean: Math.max(0.2, c.haul_mean ?? cfg.haul_time_mean ?? d.haul_mean),
    dump_mean: Math.max(0.1, c.dump_mean ?? cfg.dump_time_mean ?? d.dump_mean),
    return_mean: Math.max(0.2, c.return_mean ?? cfg.return_time_mean ?? d.return_mean),
    spread_mean: Math.max(0.2, c.spread_mean ?? d.spread_mean),
    breakdown_mean: Math.max(0.2, c.breakdown_mean ?? d.breakdown_mean),
    finish_mean: Math.max(0.2, c.finish_mean ?? d.finish_mean),
    plant_load_dist: c.plant_load_dist ?? cfg.load_dist ?? null,
    haul_dist: c.haul_dist ?? cfg.haul_dist ?? null,
    dump_dist: c.dump_dist ?? cfg.dump_dist ?? null,
    return_dist: c.return_dist ?? cfg.return_dist ?? null,
    spread_dist: c.spread_dist ?? null,
    breakdown_dist: c.breakdown_dist ?? null,
    finish_dist: c.finish_dist ?? null,
    cost_truck_per_hour: c.cost_truck_per_hour ?? cfg.cost_hauler_per_hour ?? d.cost_truck_per_hour,
    cost_paver_per_hour: c.cost_paver_per_hour ?? cfg.cost_loader_per_hour ?? d.cost_paver_per_hour,
    cost_breakdown_per_hour: c.cost_breakdown_per_hour ?? d.cost_breakdown_per_hour,
    cost_finish_per_hour: c.cost_finish_per_hour ?? d.cost_finish_per_hour,
    cost_plant_per_hour: c.cost_plant_per_hour ?? d.cost_plant_per_hour,
    fuel_truck_work: c.fuel_truck_work ?? cfg.fuel_hauler_work_lph ?? d.fuel_truck_work,
    fuel_truck_idle: c.fuel_truck_idle ?? cfg.fuel_hauler_idle_lph ?? d.fuel_truck_idle,
    fuel_paver_work: c.fuel_paver_work ?? cfg.fuel_loader_work_lph ?? d.fuel_paver_work,
    fuel_paver_idle: c.fuel_paver_idle ?? cfg.fuel_loader_idle_lph ?? d.fuel_paver_idle,
  };
}

export function applyAsphaltToConfig(
  base: SimulationConfig,
  fields?: Partial<AsphaltFields>,
): SimulationConfig {
  const d = asphaltDefaults();
  const f = { ...d, ...readAsphaltFields(base), ...fields };
  return {
    ...base,
    operation: "asphalt_paving",
    num_loaders: f.num_pavers,
    num_haulers: f.num_trucks,
    loader_bucket_m3: f.truck_capacity_m3,
    hauler_capacity_m3: f.truck_capacity_m3,
    payload_per_trip: f.truck_capacity_m3,
    load_time_mean: f.plant_load_mean,
    haul_time_mean: f.haul_mean,
    dump_time_mean: f.dump_mean,
    return_time_mean: f.return_mean,
    load_dist: f.plant_load_dist ?? fromMeanCv(f.plant_load_mean, 0.2, "normal"),
    haul_dist: f.haul_dist ?? fromMeanCv(f.haul_mean, 0.2, "normal"),
    dump_dist: f.dump_dist ?? fromMeanCv(f.dump_mean, 0.15, "normal"),
    return_dist: f.return_dist ?? fromMeanCv(f.return_mean, 0.2, "normal"),
    cost_loader_per_hour: f.cost_paver_per_hour,
    cost_hauler_per_hour: f.cost_truck_per_hour,
    fuel_loader_work_lph: f.fuel_paver_work,
    fuel_loader_idle_lph: f.fuel_paver_idle,
    fuel_hauler_work_lph: f.fuel_truck_work,
    fuel_hauler_idle_lph: f.fuel_truck_idle,
    // domain extras
    num_trucks: f.num_trucks,
    num_pavers: f.num_pavers,
    num_breakdown: f.num_breakdown,
    num_finish: f.num_finish,
    plant_bays: f.plant_bays,
    hopper_loads: f.hopper_loads,
    truck_capacity_m3: f.truck_capacity_m3,
    spreads_per_breakdown: f.spreads_per_breakdown,
    plant_load_mean: f.plant_load_mean,
    haul_mean: f.haul_mean,
    dump_mean: f.dump_mean,
    return_mean: f.return_mean,
    spread_mean: f.spread_mean,
    breakdown_mean: f.breakdown_mean,
    finish_mean: f.finish_mean,
    plant_load_dist: f.plant_load_dist,
    spread_dist: f.spread_dist,
    breakdown_dist: f.breakdown_dist,
    finish_dist: f.finish_dist,
    cost_truck_per_hour: f.cost_truck_per_hour,
    cost_paver_per_hour: f.cost_paver_per_hour,
    cost_breakdown_per_hour: f.cost_breakdown_per_hour,
    cost_finish_per_hour: f.cost_finish_per_hour,
    cost_plant_per_hour: f.cost_plant_per_hour,
  } as SimulationConfig;
}

type EvKind =
  | "plant_done"
  | "haul_done"
  | "dump_done"
  | "return_done"
  | "spread_done"
  | "breakdown_done"
  | "finish_done";

type Ev = { t: number; kind: EvKind; id: number; seq: number };

function sample(
  rng: Rng,
  config: SimulationConfig,
  mean: number,
  dist?: DurationDist | null,
): number {
  return Math.max(0.05, sampleDuration(resolveDist(config, dist ?? null, mean), rng));
}

export function runAsphaltSimulation(configIn: SimulationConfig): SimulationResult {
  const f = readAsphaltFields(configIn);
  const config = applyAsphaltToConfig(configIn, f);
  const rng = new Rng(config.seed);
  const payload = f.truck_capacity_m3;

  let maxHorizon = config.simulation_duration > 0 ? config.simulation_duration : 7 * 24 * 60;
  const targetCycles = config.target_cycles ?? 0;
  const targetVolume = config.target_volume ?? 0;

  const nTrucks = f.num_trucks;
  const nPavers = f.num_pavers;
  const nBD = f.num_breakdown;
  const nFin = f.num_finish;
  const plantBays = f.plant_bays;
  const hopperCap = f.hopper_loads;

  // plant queue: truck ids waiting to load
  const plantQ: number[] = [];
  let plantBusy = 0;
  // hopper: loads available for spread
  let hopper = 0;
  let dumpBusy = 0;
  // trucks waiting to dump (need hopper space)
  const dumpQ: number[] = [];
  // paver
  let paverBusy = 0;
  let spreadsSinceBD = 0;
  // roller queues (section counts)
  let bdQueue = 0;
  let finQueue = 0;
  let bdBusy = 0;
  let finBusy = 0;

  type TruckPh = "to_plant" | "loading" | "hauling" | "wait_dump" | "dumping" | "returning";
  const truckPh: TruckPh[] = Array(nTrucks).fill("to_plant");
  const truckWaitStart: number[] = Array(nTrucks).fill(0);
  const truckCyc = Array.from({ length: nTrucks }, () => ({
    wait: 0,
    load: 0,
    haul: 0,
    waitDump: 0,
    dump: 0,
    ret: 0,
  }));

  let plantBusyMin = 0;
  let plantBusySince = -1;
  let paverBusyMin = 0;
  let paverBusySince = -1;
  let truckBusyMin = 0;
  const truckBusySince: number[] = Array(nTrucks).fill(-1);
  let bdBusyMin = 0;
  let bdBusySince = -1;
  let finBusyMin = 0;
  let finBusySince = -1;

  let totalTrips = 0;
  let totalVolume = 0;
  let finishSections = 0;
  let seq = 0;
  const events: Ev[] = [];
  const push = (t: number, kind: EvKind, id: number) => {
    events.push({ t, kind, id, seq: seq++ });
  };

  const activityLog: ActivityLog[] = [];
  const cycleLog: CycleLog[] = [];
  const waitSamples: number[] = [];
  const arrivalTimes: number[] = [];
  const serviceTimes: number[] = [];
  const timelineVolume: [number, number][] = [[0, 0]];
  const queueOverTime: [number, number][] = [[0, 0]];
  let qIntegral = 0;
  let lastQTlog = 0;
  let maxQueue = 0;
  let lastQt = 0;

  const queueLen = () => plantQ.length + dumpQ.length;
  const logQ = (t: number) => {
    const q = queueLen();
    qIntegral += q * Math.max(0, t - lastQTlog);
    lastQTlog = t;
    if (q !== lastQt) {
      queueOverTime.push([t, q]);
      lastQt = q;
      maxQueue = Math.max(maxQueue, q);
    }
  };

  const setTruckBusy = (id: number, t: number, busy: boolean) => {
    if (busy) {
      if (truckBusySince[id] < 0) truckBusySince[id] = t;
    } else if (truckBusySince[id] >= 0) {
      truckBusyMin += t - truckBusySince[id];
      truckBusySince[id] = -1;
    }
  };
  const setPlantBusy = (t: number, n: number) => {
    if (plantBusy > 0 && plantBusySince >= 0) plantBusyMin += (t - plantBusySince) * plantBusy;
    plantBusy = n;
    plantBusySince = n > 0 ? t : -1;
  };
  const setPaverBusy = (t: number, n: number) => {
    if (paverBusy > 0 && paverBusySince >= 0) paverBusyMin += (t - paverBusySince) * paverBusy;
    paverBusy = n;
    paverBusySince = n > 0 ? t : -1;
  };
  const setBdBusy = (t: number, n: number) => {
    if (bdBusy > 0 && bdBusySince >= 0) bdBusyMin += (t - bdBusySince) * bdBusy;
    bdBusy = n;
    bdBusySince = n > 0 ? t : -1;
  };
  const setFinBusy = (t: number, n: number) => {
    if (finBusy > 0 && finBusySince >= 0) finBusyMin += (t - finBusySince) * finBusy;
    finBusy = n;
    finBusySince = n > 0 ? t : -1;
  };

  const tryStartPlant = (t: number) => {
    while (plantBusy < plantBays && plantQ.length) {
      const id = plantQ.shift()!;
      truckPh[id] = "loading";
      setTruckBusy(id, t, true);
      const w = Math.max(0, t - truckWaitStart[id]);
      truckCyc[id].wait = w;
      waitSamples.push(w);
      arrivalTimes.push(t);
      const dur = sample(rng, config, f.plant_load_mean, f.plant_load_dist);
      truckCyc[id].load = dur;
      serviceTimes.push(dur);
      activityLog.push({ hauler_id: id, phase: "load", start: t, end: t + dur, duration: dur });
      push(t + dur, "plant_done", id);
      setPlantBusy(t, plantBusy + 1);
      logQ(t);
    }
  };

  const tryStartDump = (t: number) => {
    // Satu dump per paver; hopper+in-flight dump tidak boleh melebihi kapasitas
    while (dumpQ.length && dumpBusy < nPavers && hopper + dumpBusy < hopperCap) {
      const id = dumpQ.shift()!;
      truckPh[id] = "dumping";
      dumpBusy += 1;
      setTruckBusy(id, t, true);
      truckCyc[id].waitDump = Math.max(0, t - truckWaitStart[id]);
      const dur = sample(rng, config, f.dump_mean, f.dump_dist);
      truckCyc[id].dump = dur;
      activityLog.push({ hauler_id: id, phase: "dump", start: t, end: t + dur, duration: dur });
      push(t + dur, "dump_done", id);
      logQ(t);
    }
  };

  const tryStartSpread = (t: number) => {
    while (paverBusy < nPavers && hopper > 0) {
      hopper--;
      setPaverBusy(t, paverBusy + 1);
      const dur = sample(rng, config, f.spread_mean, f.spread_dist);
      activityLog.push({
        hauler_id: 1000 + paverBusy,
        phase: "haul", // reuse phase slot for "spread" in logs
        start: t,
        end: t + dur,
        duration: dur,
      });
      push(t + dur, "spread_done", 0);
    }
  };

  const tryStartBD = (t: number) => {
    if (nBD <= 0) return;
    while (bdBusy < nBD && bdQueue > 0) {
      bdQueue--;
      setBdBusy(t, bdBusy + 1);
      const dur = sample(rng, config, f.breakdown_mean, f.breakdown_dist);
      push(t + dur, "breakdown_done", 0);
    }
  };

  const tryStartFin = (t: number) => {
    if (nFin <= 0) return;
    while (finBusy < nFin && finQueue > 0) {
      finQueue--;
      setFinBusy(t, finBusy + 1);
      const dur = sample(rng, config, f.finish_mean, f.finish_dist);
      push(t + dur, "finish_done", 0);
    }
  };

  // init trucks → arrive plant at t=0
  for (let i = 0; i < nTrucks; i++) {
    truckPh[i] = "to_plant";
    truckWaitStart[i] = 0;
    plantQ.push(i);
  }
  tryStartPlant(0);

  let t = 0;
  let stopReason = "duration";
  const maxEvents = 500_000;
  let nEv = 0;

  while (events.length && nEv < maxEvents) {
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
    const ev = events.shift()!;
    if (ev.t > maxHorizon + 1e-9) {
      stopReason = "duration";
      break;
    }
    t = ev.t;
    nEv++;

    if (targetVolume > 0 && totalVolume >= targetVolume - 1e-9) {
      stopReason = "volume";
      break;
    }
    if (targetCycles > 0 && totalTrips >= targetCycles) {
      stopReason = "cycles";
      break;
    }

    switch (ev.kind) {
      case "plant_done": {
        setPlantBusy(t, Math.max(0, plantBusy - 1));
        const id = ev.id;
        truckPh[id] = "hauling";
        const dur = sample(rng, config, f.haul_mean, f.haul_dist);
        truckCyc[id].haul = dur;
        activityLog.push({ hauler_id: id, phase: "haul", start: t, end: t + dur, duration: dur });
        push(t + dur, "haul_done", id);
        tryStartPlant(t);
        break;
      }
      case "haul_done": {
        const id = ev.id;
        truckPh[id] = "wait_dump";
        truckWaitStart[id] = t;
        setTruckBusy(id, t, false);
        dumpQ.push(id);
        logQ(t);
        tryStartDump(t);
        break;
      }
      case "dump_done": {
        const id = ev.id;
        dumpBusy = Math.max(0, dumpBusy - 1);
        hopper = Math.min(hopperCap, hopper + 1);
        totalTrips++;
        // truck returns
        truckPh[id] = "returning";
        const ret = sample(rng, config, f.return_mean, f.return_dist);
        truckCyc[id].ret = ret;
        activityLog.push({ hauler_id: id, phase: "return", start: t, end: t + ret, duration: ret });
        push(t + ret, "return_done", id);
        const wait = truckCyc[id].wait + truckCyc[id].waitDump;
        const productive =
          truckCyc[id].load + truckCyc[id].haul + truckCyc[id].dump + truckCyc[id].ret;
        const cycle = wait + productive;
        cycleLog.push({
          hauler_id: id,
          trip: totalTrips,
          wait,
          load: truckCyc[id].load,
          haul: truckCyc[id].haul,
          dump: truckCyc[id].dump,
          return: truckCyc[id].ret,
          cycle_time: cycle,
          productive_time: productive,
          finish_time: t,
          return_finish: t + ret,
          volume: payload,
          productivity: (payload / Math.max(cycle, 0.05)) * 60,
        });
        tryStartSpread(t);
        tryStartDump(t);
        break;
      }
      case "return_done": {
        const id = ev.id;
        truckPh[id] = "to_plant";
        truckWaitStart[id] = t;
        setTruckBusy(id, t, false);
        plantQ.push(id);
        logQ(t);
        tryStartPlant(t);
        break;
      }
      case "spread_done": {
        setPaverBusy(t, Math.max(0, paverBusy - 1));
        totalVolume += payload;
        timelineVolume.push([t, totalVolume]);
        spreadsSinceBD++;
        if (spreadsSinceBD >= f.spreads_per_breakdown) {
          spreadsSinceBD = 0;
          if (nBD > 0) {
            bdQueue++;
            tryStartBD(t);
          } else if (nFin > 0) {
            finQueue++;
            tryStartFin(t);
          } else {
            finishSections++;
          }
        }
        tryStartSpread(t);
        tryStartDump(t);
        break;
      }
      case "breakdown_done": {
        setBdBusy(t, Math.max(0, bdBusy - 1));
        if (nFin > 0) {
          finQueue++;
          tryStartFin(t);
        } else {
          finishSections++;
        }
        tryStartBD(t);
        break;
      }
      case "finish_done": {
        setFinBusy(t, Math.max(0, finBusy - 1));
        finishSections++;
        tryStartFin(t);
        break;
      }
    }
  }

  // close busy intervals
  const horizon = Math.min(t, maxHorizon) || maxHorizon;
  for (let i = 0; i < nTrucks; i++) setTruckBusy(i, horizon, false);
  if (plantBusy > 0) setPlantBusy(horizon, 0);
  if (paverBusy > 0) setPaverBusy(horizon, 0);
  if (bdBusy > 0) setBdBusy(horizon, 0);
  if (finBusy > 0) setFinBusy(horizon, 0);
  logQ(horizon);

  // Roller + plant cost folded into loader cost rate for ResultsPanel:
  // effective loader rate = paver + breakdown + finish + plant (per hour total fleet)
  const hours = horizon / 60;
  const extraLoaderRate =
    f.cost_breakdown_per_hour * f.num_breakdown +
    f.cost_finish_per_hour * f.num_finish +
    f.cost_plant_per_hour * f.plant_bays;
  // Store blended: cost_loader = paver only; extra in config fields for transparency
  // ResultsPanel uses num_loaders * cost_loader — so set cost_loader to paver + share of extras
  const blendedLoaderRate =
    f.cost_paver_per_hour + (nPavers > 0 ? extraLoaderRate / nPavers : extraLoaderRate);

  const loaderUtil = Math.min(1, paverBusyMin / (nPavers * horizon + 1e-9));
  const haulerUtil = Math.min(1, truckBusyMin / (nTrucks * horizon + 1e-9));
  const avgWait = waitSamples.length
    ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length
    : 0;
  const avgFromLog = (key: "load" | "haul" | "dump" | "return" | "wait") =>
    cycleLog.length
      ? cycleLog.reduce((s, c) => s + c[key], 0) / cycleLog.length
      : key === "wait"
        ? avgWait
        : key === "load"
          ? f.plant_load_mean
          : key === "haul"
            ? f.haul_mean
            : key === "dump"
              ? f.dump_mean
              : f.return_mean;
  const avgQ = qIntegral / Math.max(horizon, 1e-9);
  const thr = (totalVolume / Math.max(horizon, 1e-9)) * 60;

  let bottleneck = "Seimbang";
  let bottleneck_reason = "Plant, truck, paver, dan roller relatif seimbang.";
  if (loaderUtil > 0.9 && avgWait > 0.5) {
    bottleneck = "Paver / hopper";
    bottleneck_reason = "Paver jenuh — truck antri dump; tambah paver atau percepat spread.";
  } else if (haulerUtil > 0.9 && loaderUtil < 0.7) {
    bottleneck = "Dump truck";
    bottleneck_reason = "Truck sibuk penuh — tambah truck atau perpendek haul.";
  } else if (plantBusyMin / (plantBays * horizon + 1e-9) > 0.9) {
    bottleneck = "Asphalt plant";
    bottleneck_reason = "Bay plant jenuh — tambah plant bay atau percepat load.";
  } else if (nBD > 0 && bdBusyMin / (nBD * horizon + 1e-9) > 0.9) {
    bottleneck = "Breakdown roller";
    bottleneck_reason = "Roller breakdown tertinggal — tambah unit atau percepat compact.";
  }

  const finalConfig = {
    ...config,
    cost_loader_per_hour: blendedLoaderRate,
    cost_hauler_per_hour: f.cost_truck_per_hour,
    finish_sections: finishSections,
    bd_utilization: nBD > 0 ? bdBusyMin / (nBD * horizon) : 0,
    fin_utilization: nFin > 0 ? finBusyMin / (nFin * horizon) : 0,
    plant_utilization: plantBusyMin / (plantBays * horizon + 1e-9),
  } as SimulationConfig;

  return {
    operation: "asphalt_paving",
    config: finalConfig,
    total_trips: totalTrips,
    total_volume: totalVolume,
    throughput_per_hour: thr,
    simulated_minutes: horizon,
    stop_reason: stopReason,
    target_cycles: targetCycles,
    target_volume: targetVolume,
    loader_utilization: loaderUtil,
    hauler_utilization: haulerUtil,
    loader_busy_minutes: paverBusyMin,
    hauler_busy_minutes: truckBusyMin,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQ,
    max_queue_length: maxQueue,
    total_wait_time: waitSamples.reduce((a, b) => a + b, 0),
    hauler_wait_ratio: waitSamples.length
      ? waitSamples.reduce((a, b) => a + b, 0) / (nTrucks * horizon + 1e-9)
      : 0,
    completed_load_requests: totalTrips,
    censored_waits: 0,
    bottleneck,
    bottleneck_reason,
    timeline_volume: timelineVolume,
    queue_over_time: queueOverTime,
    activity_log: activityLog.slice(0, 2000),
    cycle_log: cycleLog,
    avg_cycle_components: {
      wait: avgFromLog("wait"),
      load: avgFromLog("load"),
      haul: avgFromLog("haul"),
      dump: avgFromLog("dump"),
      return: avgFromLog("return"),
    },
    hauler_trips: Array(nTrucks).fill(0).map((_, i) =>
      cycleLog.filter((c) => c.hauler_id === i).length,
    ),
    hauler_busy_per_unit: Array(nTrucks).fill(truckBusyMin / nTrucks),
    hauler_wait_per_unit: Array(nTrucks).fill(
      waitSamples.reduce((a, b) => a + b, 0) / Math.max(nTrucks, 1),
    ),
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
  };
}

export function asphaltTheoreticalThroughput(f: AsphaltFields): number {
  const truckCycle =
    f.plant_load_mean + f.haul_mean + f.dump_mean + f.return_mean;
  const truckThr = (f.num_trucks * 60) / Math.max(truckCycle, 0.1) * f.truck_capacity_m3;
  const paverThr = (f.num_pavers * 60) / Math.max(f.spread_mean, 0.1) * f.truck_capacity_m3;
  const plantThr = (f.plant_bays * 60) / Math.max(f.plant_load_mean, 0.1) * f.truck_capacity_m3;
  return Math.min(truckThr, paverThr, plantThr);
}
