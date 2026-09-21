/**
 * Dual-cycle DES: Ready-mixed Concrete
 * Siklus A — Truck mixer: Batch (plant) → Haul ke site → Discharge ke buffer → Return plant
 * Siklus B — Pengecoran (dolly | crane bucket | pump): Fill dari buffer → Travel → Place → Return
 * Coupling: site buffer (m³). Truck antri jika buffer penuh; unit place antri jika buffer kosong.
 */

import { Rng } from "./rng";
import {
  emissionsFromFuel,
  fromMeanCv,
  type SimulationConfig,
  type SimulationResult,
  type CycleLog,
  type ActivityLog,
  type DurationDist,
  sampleDuration,
  resourceLabels,
  resolveDist,
} from "./engine";
import type { OperationId } from "./operations";

export type PlacementMethod = "dolly" | "crane" | "pump";

export function isRmcOperation(op: string | undefined): boolean {
  return (
    op === "concreting" ||
    op === "rmc_dolly" ||
    op === "rmc_crane" ||
    op === "rmc_pump"
  );
}

export function placementMethodOf(
  op: string | undefined,
  explicit?: PlacementMethod | string | null,
): PlacementMethod {
  if (explicit === "dolly" || explicit === "crane" || explicit === "pump") {
    return explicit;
  }
  if (op === "rmc_crane") return "crane";
  if (op === "rmc_pump") return "pump";
  if (op === "rmc_dolly") return "dolly";
  return "dolly"; // default for concreting
}

export function rmcMethodLabel(m: PlacementMethod): string {
  if (m === "crane") return "Tower crane + bucket";
  if (m === "pump") return "Concrete pump";
  return "Concrete buggy";
}

/** Defaults for dual-cycle fields merged into config */
export function rmcDualDefaults(method: PlacementMethod) {
  if (method === "crane") {
    return {
      num_trucks: 3,
      num_place: 2,
      truck_capacity_m3: 5,
      place_capacity_m3: 1,
      buffer_capacity_m3: 6,
      // truck cycle (menit)
      truck_batch: 5,
      truck_haul: 20,
      truck_discharge: 4,
      truck_return: 18,
      // place cycle
      place_fill: 2,
      place_travel: 4,
      place_place: 2,
      place_return: 3.5,
      cost_truck: 280_000,
      cost_place: 450_000,
      cost_truck_op: 80_000,
      cost_place_op: 120_000,
      fuel_truck_work: 10,
      fuel_truck_idle: 2,
      fuel_place_work: 12,
      fuel_place_idle: 4,
    };
  }
  if (method === "pump") {
    return {
      num_trucks: 3,
      num_place: 1,
      truck_capacity_m3: 5,
      place_capacity_m3: 0.5,
      buffer_capacity_m3: 8,
      truck_batch: 5,
      truck_haul: 20,
      truck_discharge: 5,
      truck_return: 18,
      place_fill: 1,
      place_travel: 2,
      place_place: 1.5,
      place_return: 0.5,
      cost_truck: 280_000,
      cost_place: 550_000,
      cost_truck_op: 80_000,
      cost_place_op: 120_000,
      fuel_truck_work: 10,
      fuel_truck_idle: 2,
      fuel_place_work: 18,
      fuel_place_idle: 5,
    };
  }
  // dolly
  return {
    num_trucks: 2,
    num_place: 4,
    truck_capacity_m3: 5,
    place_capacity_m3: 0.2,
    buffer_capacity_m3: 4,
    truck_batch: 5,
    truck_haul: 20,
    truck_discharge: 3,
    truck_return: 18,
    place_fill: 1.5,
    place_travel: 3,
    place_place: 1.5,
    place_return: 2.5,
    cost_truck: 280_000,
    cost_place: 15_000,
    cost_truck_op: 80_000,
    cost_place_op: 50_000,
    fuel_truck_work: 10,
    fuel_truck_idle: 2,
    fuel_place_work: 0,
    fuel_place_idle: 0,
  };
}

export type RmcConfigFields = {
  truck_batch_mean: number;
  truck_haul_mean: number;
  truck_discharge_mean: number;
  truck_return_mean: number;
  truck_capacity_m3: number;
  buffer_capacity_m3: number;
  place_fill_mean: number;
  place_travel_mean: number;
  place_place_mean: number;
  place_return_mean: number;
  place_capacity_m3: number;
  num_trucks: number;
  num_place: number;
  placement_method: PlacementMethod;
};

export function readRmcFields(cfg: SimulationConfig): RmcConfigFields {
  const c = cfg as SimulationConfig & Partial<RmcConfigFields> & { placement_method?: PlacementMethod };
  const method = placementMethodOf(cfg.operation, c.placement_method);
  const d = rmcDualDefaults(method);
  return {
    placement_method: method,
    num_trucks: Math.max(1, Math.floor(c.num_trucks ?? cfg.num_haulers ?? d.num_trucks)),
    num_place: Math.max(1, Math.floor(c.num_place ?? cfg.num_loaders ?? d.num_place)),
    truck_capacity_m3: Math.max(0.05, c.truck_capacity_m3 ?? d.truck_capacity_m3),
    place_capacity_m3: Math.max(
      0.05,
      c.place_capacity_m3 ?? cfg.hauler_capacity_m3 ?? d.place_capacity_m3,
    ),
    buffer_capacity_m3: Math.max(0.1, c.buffer_capacity_m3 ?? d.buffer_capacity_m3),
    truck_batch_mean: Math.max(0.1, c.truck_batch_mean ?? d.truck_batch),
    truck_haul_mean: Math.max(0.1, c.truck_haul_mean ?? d.truck_haul),
    truck_discharge_mean: Math.max(0.1, c.truck_discharge_mean ?? d.truck_discharge),
    truck_return_mean: Math.max(0.1, c.truck_return_mean ?? d.truck_return),
    place_fill_mean: Math.max(0.1, c.place_fill_mean ?? cfg.load_time_mean ?? d.place_fill),
    place_travel_mean: Math.max(0.1, c.place_travel_mean ?? cfg.haul_time_mean ?? d.place_travel),
    place_place_mean: Math.max(0.1, c.place_place_mean ?? cfg.dump_time_mean ?? d.place_place),
    place_return_mean: Math.max(
      0.1,
      c.place_return_mean ?? cfg.return_time_mean ?? d.place_return,
    ),
  };
}

export function applyRmcToConfig(
  base: SimulationConfig,
  fields: Partial<RmcConfigFields> & { operation?: OperationId },
): SimulationConfig {
  const op = (fields.operation ?? base.operation) as OperationId;
  const method = placementMethodOf(
    op,
    fields.placement_method ?? (base as SimulationConfig & { placement_method?: PlacementMethod }).placement_method,
  );
  const d = rmcDualDefaults(method);
  const merged: RmcConfigFields = {
    ...readRmcFields({ ...base, operation: op, placement_method: method } as SimulationConfig),
    ...fields,
    placement_method: method,
  };
  const fuelTW = d.fuel_truck_work;
  const fuelTI = d.fuel_truck_idle;
  const fuelPW = d.fuel_place_work;
  const fuelPI = d.fuel_place_idle;

  return {
    ...base,
    operation: op,
    // map place → loader, truck → hauler for costs/util display
    num_loaders: merged.num_place,
    num_haulers: merged.num_trucks,
    loader_bucket_m3: merged.place_capacity_m3,
    hauler_capacity_m3: merged.place_capacity_m3,
    payload_per_trip: merged.place_capacity_m3,
    load_time_mean: merged.place_fill_mean,
    haul_time_mean: merged.place_travel_mean,
    dump_time_mean: merged.place_place_mean,
    return_time_mean: merged.place_return_mean,
    load_dist:
      base.place_fill_dist ??
      fromMeanCv(merged.place_fill_mean, base.cv ?? 0.2, base.default_dist_kind ?? "normal"),
    haul_dist:
      base.place_travel_dist ??
      fromMeanCv(merged.place_travel_mean, base.cv ?? 0.2, base.default_dist_kind ?? "normal"),
    dump_dist:
      base.place_place_dist ??
      fromMeanCv(merged.place_place_mean, base.cv ?? 0.2, base.default_dist_kind ?? "normal"),
    return_dist:
      base.place_return_dist ??
      fromMeanCv(merged.place_return_mean, base.cv ?? 0.2, base.default_dist_kind ?? "normal"),
    place_fill_dist: base.place_fill_dist ?? null,
    place_travel_dist: base.place_travel_dist ?? null,
    place_place_dist: base.place_place_dist ?? null,
    place_return_dist: base.place_return_dist ?? null,
    cost_loader_per_hour: base.cost_loader_per_hour || d.cost_place,
    cost_hauler_per_hour: base.cost_hauler_per_hour || d.cost_truck,
    cost_loader_operator_per_hour: base.cost_loader_operator_per_hour ?? d.cost_place_op,
    cost_hauler_operator_per_hour: base.cost_hauler_operator_per_hour ?? d.cost_truck_op,
    fuel_loader_work_lph: base.fuel_loader_work_lph ?? fuelPW,
    fuel_loader_idle_lph: base.fuel_loader_idle_lph ?? fuelPI,
    fuel_hauler_work_lph: base.fuel_hauler_work_lph ?? fuelTW,
    fuel_hauler_idle_lph: base.fuel_hauler_idle_lph ?? fuelTI,
    emission_loader_work_kg_per_h: emissionsFromFuel(base.fuel_loader_work_lph ?? fuelPW),
    emission_loader_idle_kg_per_h: emissionsFromFuel(base.fuel_loader_idle_lph ?? fuelPI),
    emission_hauler_work_kg_per_h: emissionsFromFuel(base.fuel_hauler_work_lph ?? fuelTW),
    emission_hauler_idle_kg_per_h: emissionsFromFuel(base.fuel_hauler_idle_lph ?? fuelTI),
    // dual fields stored on config object
    ...(merged as unknown as Partial<SimulationConfig>),
  } as SimulationConfig;
}

type Ev =
  | { t: number; seq: number; kind: "truck_batch_done"; id: number }
  | { t: number; seq: number; kind: "truck_arrive_site"; id: number }
  | { t: number; seq: number; kind: "truck_discharge_done"; id: number; vol: number }
  | { t: number; seq: number; kind: "truck_return_done"; id: number }
  | { t: number; seq: number; kind: "place_fill_done"; id: number; vol: number }
  | { t: number; seq: number; kind: "place_travel_done"; id: number; vol: number }
  | { t: number; seq: number; kind: "place_place_done"; id: number; vol: number }
  | { t: number; seq: number; kind: "place_return_done"; id: number };

function sample(
  rng: Rng,
  config: SimulationConfig,
  mean: number,
  explicit: DurationDist | null | undefined = null,
): number {
  const dist = resolveDist(config, explicit ?? null, mean);
  return sampleDuration(dist, rng);
}

function sampleTruck(
  rng: Rng,
  config: SimulationConfig,
  phase: "batch" | "haul" | "discharge" | "return",
  mean: number,
): number {
  const map = {
    batch: config.truck_batch_dist,
    haul: config.truck_haul_dist,
    discharge: config.truck_discharge_dist,
    return: config.truck_return_dist,
  } as const;
  return sample(rng, config, mean, map[phase] ?? null);
}

function samplePlace(
  rng: Rng,
  config: SimulationConfig,
  phase: "fill" | "travel" | "place" | "return",
  mean: number,
): number {
  const map = {
    fill: config.place_fill_dist,
    travel: config.place_travel_dist,
    place: config.place_place_dist,
    return: config.place_return_dist,
  } as const;
  return sample(rng, config, mean, map[phase] ?? null);
}


export function runRmcDualSimulation(configIn: SimulationConfig): SimulationResult {
  const method = placementMethodOf(
    configIn.operation,
    (configIn as SimulationConfig & { placement_method?: PlacementMethod }).placement_method,
  );
  const f = readRmcFields({ ...configIn, placement_method: method } as SimulationConfig);
  const config = applyRmcToConfig(configIn, { ...f, placement_method: method });

  const rng = new Rng(config.seed);
  let maxHorizon = config.simulation_duration > 0 ? config.simulation_duration : 7 * 24 * 60;

  let targetCycles = Math.max(0, Math.floor(config.target_cycles || 0));
  let targetVolume = Math.max(0, Number(config.target_volume) || 0);
  if (targetCycles <= 0 && targetVolume <= 0) {
    targetCycles = 40;
    targetVolume = 30;
  }

  const nTrucks = f.num_trucks;
  const nPlace = f.num_place;
  const truckCap = f.truck_capacity_m3;
  const placeCap = f.place_capacity_m3;
  const bufferMax = Math.max(placeCap, f.buffer_capacity_m3);

  const events: Ev[] = [];
  let seq = 0;
  const push = (e: {
    t: number;
    kind: Ev["kind"];
    id: number;
    vol?: number;
  }) => {
    seq += 1;
    events.push({ ...e, seq } as Ev);
    events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  };

  let buffer = 0;
  // trucks waiting to discharge: [arrive_t, id, vol]
  const truckQueue: { t: number; id: number; vol: number }[] = [];
  // place units waiting for buffer: [ready_t, id]
  const placeWait: { t: number; id: number }[] = [];

  let freeDischarge = 1; // one discharge bay at site (truck → buffer)
  const truckBusy: [number, number][][] = Array.from({ length: nTrucks }, () => []);
  const placeBusy: [number, number][][] = Array.from({ length: nPlace }, () => []);
  const truckWait: [number, number][][] = Array.from({ length: nTrucks }, () => []);
  const placeWaitInt: [number, number][][] = Array.from({ length: nPlace }, () => []);

  const waitSamples: number[] = [];
  const arrivalTimes: number[] = [];
  const serviceTimes: number[] = [];
  let totalTrips = 0;
  let totalVolume = 0;
  let stopReason = "duration";
  let endTime = maxHorizon;
  let reached = false;

  const timelineVolume: [number, number][] = [[0, 0]];
  const queueOverTime: [number, number][] = [[0, 0]];
  const activityLog: ActivityLog[] = [];
  const cycleLog: CycleLog[] = [];

  let lastQ = 0;
  let qIntegral = 0;
  let maxQueue = 0;
  let lastChange = 0;

  const integrateQ = (t: number) => {
    t = Math.min(t, maxHorizon);
    if (t > lastChange) {
      qIntegral += truckQueue.length * (t - lastChange);
      lastChange = t;
    }
  };
  const snapQ = (t: number) => {
    maxQueue = Math.max(maxQueue, truckQueue.length);
    const last = queueOverTime[queueOverTime.length - 1];
    if (!last || last[1] !== truckQueue.length) {
      queueOverTime.push([Math.min(t, maxHorizon), truckQueue.length]);
    }
  };

  const recAct = (hid: number, phase: string, start: number, dur: number) => {
    const s = Math.max(0, start);
    const e = Math.min(maxHorizon, start + dur);
    if (e > s) activityLog.push({ hauler_id: hid, phase, start: s, end: e, duration: e - s });
  };

  const tryDischarge = (now: number) => {
    while (freeDischarge > 0 && truckQueue.length > 0 && !reached) {
      const next = truckQueue[0];
      const room = bufferMax - buffer;
      if (room < 1e-9) break; // buffer full
      truckQueue.shift();
      integrateQ(now);
      snapQ(now);
      const wait = Math.max(0, now - next.t);
      waitSamples.push(wait);
      if (wait > 1e-9) {
        truckWait[next.id].push([next.t, now]);
        recAct(next.id, "wait", next.t, wait);
      }
      arrivalTimes.push(next.t);
      const vol = Math.min(next.vol, room);
      freeDischarge -= 1;
      const dt = sampleTruck(rng, config, "discharge", f.truck_discharge_mean);
      serviceTimes.push(dt);
      truckBusy[next.id].push([now, now + dt]);
      recAct(next.id, "dump", now, dt); // discharge mapped as dump phase
      push({ t: now + dt, kind: "truck_discharge_done", id: next.id, vol });
    }
  };

  const tryStartPlace = (now: number) => {
    while (placeWait.length > 0 && buffer > 1e-9 && !reached) {
      const unit = placeWait.shift()!;
      const wait = Math.max(0, now - unit.t);
      if (wait > 1e-9) {
        placeWaitInt[unit.id].push([unit.t, now]);
      }
      const vol = Math.min(placeCap, buffer);
      buffer -= vol;
      // maybe free a waiting truck
      tryDischarge(now);
      const fill = samplePlace(rng, config, "fill", f.place_fill_mean);
      placeBusy[unit.id].push([now, now + fill]);
      recAct(unit.id + 1000, "load", now, fill);
      push({ t: now + fill, kind: "place_fill_done", id: unit.id, vol });
    }
  };

  // init trucks at plant
  for (let i = 0; i < nTrucks; i++) {
    const bt = sampleTruck(rng, config, "batch", f.truck_batch_mean);
    truckBusy[i].push([0, bt]);
    recAct(i, "load", 0, bt); // batch at plant
    push({ t: bt, kind: "truck_batch_done", id: i });
  }
  // init place units ready
  for (let i = 0; i < nPlace; i++) {
    placeWait.push({ t: 0, id: i });
  }

  let guard = 0;
  while (events.length && guard++ < 5_000_000) {
    const ev = events.shift()!;
    if (ev.t > maxHorizon || reached) {
      endTime = Math.min(ev.t, maxHorizon);
      break;
    }
    const now = ev.t;
    integrateQ(now);

    if (ev.kind === "truck_batch_done") {
      const haul = sampleTruck(rng, config, "haul", f.truck_haul_mean);
      truckBusy[ev.id].push([now, now + haul]);
      recAct(ev.id, "haul", now, haul);
      push({ t: now + haul, kind: "truck_arrive_site", id: ev.id });
    } else if (ev.kind === "truck_arrive_site") {
      truckQueue.push({ t: now, id: ev.id, vol: truckCap });
      snapQ(now);
      tryDischarge(now);
    } else if (ev.kind === "truck_discharge_done") {
      freeDischarge += 1;
      buffer = Math.min(bufferMax, buffer + ev.vol);
      tryStartPlace(now);
      tryDischarge(now);
      const ret = sampleTruck(rng, config, "return", f.truck_return_mean);
      truckBusy[ev.id].push([now, now + ret]);
      recAct(ev.id, "return", now, ret);
      push({ t: now + ret, kind: "truck_return_done", id: ev.id });
    } else if (ev.kind === "truck_return_done") {
      const bt = sampleTruck(rng, config, "batch", f.truck_batch_mean);
      truckBusy[ev.id].push([now, now + bt]);
      recAct(ev.id, "load", now, bt);
      push({ t: now + bt, kind: "truck_batch_done", id: ev.id });
    } else if (ev.kind === "place_fill_done") {
      const tr = samplePlace(rng, config, "travel", f.place_travel_mean);
      placeBusy[ev.id].push([now, now + tr]);
      recAct(ev.id + 1000, "haul", now, tr);
      push({ t: now + tr, kind: "place_travel_done", id: ev.id, vol: ev.vol });
    } else if (ev.kind === "place_travel_done") {
      const pl = samplePlace(rng, config, "place", f.place_place_mean);
      placeBusy[ev.id].push([now, now + pl]);
      recAct(ev.id + 1000, "dump", now, pl);
      push({ t: now + pl, kind: "place_place_done", id: ev.id, vol: ev.vol });
    } else if (ev.kind === "place_place_done") {
      totalTrips += 1;
      totalVolume += ev.vol;
      timelineVolume.push([now, totalVolume]);
      const ret = samplePlace(rng, config, "return", f.place_return_mean);
      // approximate cycle components for log
      const ct =
        f.place_fill_mean + f.place_travel_mean + f.place_place_mean + f.place_return_mean;
      cycleLog.push({
        trip: totalTrips,
        hauler_id: ev.id,
        finish_time: now,
        return_finish: now + ret,
        wait: 0,
        load: f.place_fill_mean,
        haul: f.place_travel_mean,
        dump: f.place_place_mean,
        return: f.place_return_mean,
        productive_time: ct,
        cycle_time: ct,
        volume: ev.vol,
        productivity: now > 1e-9 ? (totalVolume / now) * 60 : 0,
      });
      placeBusy[ev.id].push([now, now + ret]);
      recAct(ev.id + 1000, "return", now, ret);
      push({ t: now + ret, kind: "place_return_done", id: ev.id });

      if (targetCycles > 0 && totalTrips >= targetCycles) {
        reached = true;
        stopReason = targetVolume > 0 && totalVolume >= targetVolume ? "target_both" : "target_cycles";
        endTime = now;
      } else if (targetVolume > 0 && totalVolume >= targetVolume) {
        reached = true;
        stopReason = "target_volume";
        endTime = now;
      }
    } else if (ev.kind === "place_return_done") {
      placeWait.push({ t: now, id: ev.id });
      tryStartPlace(now);
    }
  }

  if (!reached) {
    stopReason = "duration_cap";
    endTime = maxHorizon;
  }
  integrateQ(endTime);

  const clipBusy = (intervals: [number, number][][]) => {
    let sum = 0;
    const per = intervals.map((list) => {
      let u = 0;
      for (const [a, b] of list) {
        const s = Math.max(0, a);
        const e = Math.min(endTime, b);
        if (e > s) u += e - s;
      }
      sum += u;
      return u;
    });
    return { sum, per };
  };

  const tBusy = clipBusy(truckBusy);
  const pBusy = clipBusy(placeBusy);
  const tWait = clipBusy(truckWait);
  const horizon = Math.max(endTime, 1e-9);
  const truckUtil = tBusy.sum / (nTrucks * horizon);
  const placeUtil = pBusy.sum / (nPlace * horizon);
  const avgWait = waitSamples.length ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length : 0;
  const avgQ = qIntegral / horizon;
  const totalWait = tWait.sum;
  const throughput = (totalVolume / horizon) * 60;

  // bottleneck
  let bottleneck: string;
  let reason: string;
  const labels = resourceLabels(config.operation);
  if (placeUtil >= truckUtil && placeUtil >= 0.75) {
    bottleneck = labels.loader;
    reason = `Utilisasi unit pengecoran (${(placeUtil * 100).toFixed(0)}%) tinggi — metode place membatasi.`;
  } else if (truckUtil >= 0.75) {
    bottleneck = labels.hauler;
    reason = `Utilisasi truck mixer (${(truckUtil * 100).toFixed(0)}%) tinggi — supply RMC dari plant membatasi.`;
  } else if (avgWait > 1 && avgQ > 0.5) {
    bottleneck = "Buffer / discharge";
    reason = `Truck sering antri discharge (Wq ${avgWait.toFixed(1)} mnt) — buffer site atau laju place.`;
  } else {
    bottleneck = "Seimbang / under-utilized";
    reason = `Truck util ${(truckUtil * 100).toFixed(0)}%, place util ${(placeUtil * 100).toFixed(0)}%.`;
  }

  // map result: loader=place, hauler=truck for existing panels
  return {
    operation: config.operation,
    config: {
      ...config,
      num_loaders: nPlace,
      num_haulers: nTrucks,
      hauler_capacity_m3: placeCap,
      payload_per_trip: placeCap,
    },
    simulated_minutes: endTime,
    total_trips: totalTrips,
    total_volume: totalVolume,
    throughput_per_hour: throughput,
    loader_utilization: Math.min(1, placeUtil),
    hauler_utilization: Math.min(1, truckUtil),
    loader_busy_minutes: pBusy.sum,
    hauler_busy_minutes: tBusy.sum,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQ,
    max_queue_length: maxQueue,
    total_wait_time: totalWait,
    hauler_wait_ratio: tBusy.sum > 0 ? totalWait / (tBusy.sum + totalWait) : 0,
    completed_load_requests: arrivalTimes.length,
    censored_waits: truckQueue.length,
    bottleneck,
    bottleneck_reason: reason + ` Metode: ${rmcMethodLabel(method)}. Dual-cycle RMC↔plant + place.`,
    timeline_volume: timelineVolume,
    queue_over_time: queueOverTime,
    activity_log: activityLog,
    cycle_log: cycleLog,
    avg_cycle_components: {
      wait: avgWait,
      load: f.place_fill_mean,
      haul: f.place_travel_mean,
      dump: f.place_place_mean,
      return: f.place_return_mean,
    },
    hauler_trips: Array(nTrucks).fill(0).map((_, i) =>
      Math.floor(totalTrips / nTrucks) + (i < totalTrips % nTrucks ? 1 : 0),
    ),
    hauler_busy_per_unit: tBusy.per,
    hauler_wait_per_unit: tWait.per,
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
    stop_reason: stopReason,
    target_cycles: targetCycles,
    target_volume: targetVolume,
  };
}
