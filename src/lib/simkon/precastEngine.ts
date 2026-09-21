/**
 * Precast plant DES (Halpin Ch.13–14 simplified)
 *
 * Form cycle:
 *  prepare (crew) → pour (crew + crane) → cure (cure slot) → strip (crew + crane) → clean (crew)
 *
 * Bottlenecks: forms, crews, cure slots, crane.
 * Production = finished elements (after strip).
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

export function isPrecastOperation(op: string | undefined): boolean {
  return op === "precast_plant";
}

export type PrecastFields = {
  num_forms: number;
  num_crews: number;
  num_cure_slots: number;
  num_cranes: number;
  element_volume_m3: number;
  prepare_mean: number;
  pour_mean: number;
  cure_mean: number;
  strip_mean: number;
  clean_mean: number;
  prepare_dist?: DurationDist | null;
  pour_dist?: DurationDist | null;
  cure_dist?: DurationDist | null;
  strip_dist?: DurationDist | null;
  clean_dist?: DurationDist | null;
  cost_form_per_hour: number;
  cost_crew_per_hour: number;
  cost_crane_per_hour: number;
  cost_cure_per_hour: number;
};

export function precastDefaults(): PrecastFields {
  return {
    num_forms: 6,
    num_crews: 2,
    num_cure_slots: 8,
    num_cranes: 1,
    element_volume_m3: 2.5,
    prepare_mean: 45, // set steel / form prep
    pour_mean: 25,
    cure_mean: 720, // 12 jam overnight-style (can edit down for demo)
    strip_mean: 20,
    clean_mean: 15,
    cost_form_per_hour: 25_000, // amortization of form set
    cost_crew_per_hour: 180_000, // regu formwork
    cost_crane_per_hour: 550_000,
    cost_cure_per_hour: 15_000, // steam/space
  };
}

export function readPrecastFields(cfg: SimulationConfig): PrecastFields {
  const d = precastDefaults();
  const c = cfg as SimulationConfig & Partial<PrecastFields>;
  return {
    num_forms: Math.max(1, Math.floor(cfg.num_haulers ?? c.num_forms ?? d.num_forms)),
    num_crews: Math.max(1, Math.floor(cfg.num_loaders ?? c.num_crews ?? d.num_crews)),
    num_cure_slots: Math.max(1, Math.floor(c.num_cure_slots ?? d.num_cure_slots)),
    num_cranes: Math.max(1, Math.floor(c.num_cranes ?? d.num_cranes)),
    element_volume_m3: Math.max(0.1, c.element_volume_m3 ?? cfg.payload_per_trip ?? d.element_volume_m3),
    prepare_mean: Math.max(1, c.prepare_mean ?? cfg.load_time_mean ?? d.prepare_mean),
    pour_mean: Math.max(0.5, c.pour_mean ?? cfg.haul_time_mean ?? d.pour_mean),
    cure_mean: Math.max(1, c.cure_mean ?? cfg.dump_time_mean ?? d.cure_mean),
    strip_mean: Math.max(0.5, c.strip_mean ?? cfg.return_time_mean ?? d.strip_mean),
    clean_mean: Math.max(0.5, c.clean_mean ?? d.clean_mean),
    prepare_dist: c.prepare_dist ?? cfg.load_dist ?? null,
    pour_dist: c.pour_dist ?? cfg.haul_dist ?? null,
    cure_dist: c.cure_dist ?? cfg.dump_dist ?? null,
    strip_dist: c.strip_dist ?? cfg.return_dist ?? null,
    clean_dist: c.clean_dist ?? null,
    cost_form_per_hour: c.cost_form_per_hour ?? d.cost_form_per_hour,
    cost_crew_per_hour: c.cost_crew_per_hour ?? cfg.cost_loader_per_hour ?? d.cost_crew_per_hour,
    cost_crane_per_hour: c.cost_crane_per_hour ?? d.cost_crane_per_hour,
    cost_cure_per_hour: c.cost_cure_per_hour ?? d.cost_cure_per_hour,
  };
}

export function applyPrecastToConfig(
  base: SimulationConfig,
  fields?: Partial<PrecastFields>,
): SimulationConfig {
  const d = precastDefaults();
  const f = { ...d, ...readPrecastFields(base), ...fields };
  // Map for ResultsPanel: loaders=crews, haulers=forms
  const blendedLoader =
    f.cost_crew_per_hour +
    (f.num_crews > 0 ? (f.cost_crane_per_hour * f.num_cranes) / f.num_crews : f.cost_crane_per_hour);
  const blendedHauler =
    f.cost_form_per_hour +
    (f.num_forms > 0 ? (f.cost_cure_per_hour * f.num_cure_slots) / f.num_forms : 0);

  return {
    ...base,
    operation: "precast_plant",
    num_loaders: f.num_crews,
    num_haulers: f.num_forms,
    loader_bucket_m3: f.element_volume_m3,
    hauler_capacity_m3: f.element_volume_m3,
    payload_per_trip: f.element_volume_m3,
    load_time_mean: f.prepare_mean,
    haul_time_mean: f.pour_mean,
    dump_time_mean: f.cure_mean,
    return_time_mean: f.strip_mean + f.clean_mean,
    load_dist: f.prepare_dist ?? fromMeanCv(f.prepare_mean, 0.15, "normal"),
    haul_dist: f.pour_dist ?? fromMeanCv(f.pour_mean, 0.2, "normal"),
    dump_dist: f.cure_dist ?? fromMeanCv(f.cure_mean, 0.05, "normal"),
    return_dist: f.strip_dist ?? fromMeanCv(f.strip_mean + f.clean_mean, 0.15, "normal"),
    cost_loader_per_hour: blendedLoader,
    cost_hauler_per_hour: blendedHauler,
    fuel_loader_work_lph: 4, // crane share
    fuel_loader_idle_lph: 1.5,
    fuel_hauler_work_lph: 0,
    fuel_hauler_idle_lph: 0,
    num_forms: f.num_forms,
    num_crews: f.num_crews,
    num_cure_slots: f.num_cure_slots,
    num_cranes: f.num_cranes,
    element_volume_m3: f.element_volume_m3,
    prepare_mean: f.prepare_mean,
    pour_mean: f.pour_mean,
    cure_mean: f.cure_mean,
    strip_mean: f.strip_mean,
    clean_mean: f.clean_mean,
    prepare_dist: f.prepare_dist,
    pour_dist: f.pour_dist,
    cure_dist: f.cure_dist,
    strip_dist: f.strip_dist,
    clean_dist: f.clean_dist,
    cost_form_per_hour: f.cost_form_per_hour,
    cost_crew_per_hour: f.cost_crew_per_hour,
    cost_crane_per_hour: f.cost_crane_per_hour,
    cost_cure_per_hour: f.cost_cure_per_hour,
  } as SimulationConfig;
}

type FormState =
  | "idle"
  | "prepare"
  | "wait_pour"
  | "pour"
  | "wait_cure"
  | "cure"
  | "wait_strip"
  | "strip"
  | "clean";

type EvKind = "prepare_done" | "pour_done" | "cure_done" | "strip_done" | "clean_done";
type Ev = { t: number; kind: EvKind; formId: number; seq: number };

function sample(
  rng: Rng,
  config: SimulationConfig,
  mean: number,
  dist?: DurationDist | null,
): number {
  return Math.max(0.05, sampleDuration(resolveDist(config, dist ?? null, mean), rng));
}

export function runPrecastSimulation(configIn: SimulationConfig): SimulationResult {
  const f = readPrecastFields(configIn);
  const config = applyPrecastToConfig(configIn, f);
  const rng = new Rng(config.seed);
  const vol = f.element_volume_m3;

  let maxHorizon = config.simulation_duration > 0 ? config.simulation_duration : 7 * 24 * 60;
  // For precast with long cure, default target volume works better; also allow cycles
  const targetCycles = config.target_cycles ?? 0;
  const targetVolume = config.target_volume ?? 0;

  const nForms = f.num_forms;
  const nCrews = f.num_crews;
  const nCure = f.num_cure_slots;
  const nCrane = f.num_cranes;

  let freeCrews = nCrews;
  let freeCrane = nCrane;
  let freeCure = nCure;

  const formState: FormState[] = Array(nForms).fill("idle");
  const formStart: number[] = Array(nForms).fill(0);
  const formCycleStart: number[] = Array(nForms).fill(0);
  const formPhase = Array.from({ length: nForms }, () => ({
    prepare: 0,
    pour: 0,
    cure: 0,
    strip: 0,
    wait: 0,
  }));

  // queues of form ids waiting for resource
  const qPrepare: number[] = [];
  const qPour: number[] = []; // need crew+crane
  const qCure: number[] = []; // need cure slot
  const qStrip: number[] = []; // need crew+crane
  const qClean: number[] = []; // need crew

  let crewBusyMin = 0;
  let craneBusyMin = 0;
  let formBusyMin = 0;
  let cureBusyMin = 0;
  let crewBusy = 0;
  let craneBusy = 0;
  let cureBusy = 0;
  let crewSince = -1;
  let craneSince = -1;
  let cureSince = -1;
  const formBusySince: number[] = Array(nForms).fill(-1);

  let totalTrips = 0;
  let totalVolume = 0;
  let seq = 0;
  const events: Ev[] = [];
  const push = (t: number, kind: EvKind, formId: number) => {
    events.push({ t, kind, formId, seq: seq++ });
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

  const queueLen = () => qPrepare.length + qPour.length + qCure.length + qStrip.length + qClean.length;
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

  const setCrew = (t: number, n: number) => {
    if (crewBusy > 0 && crewSince >= 0) crewBusyMin += (t - crewSince) * crewBusy;
    crewBusy = n;
    freeCrews = nCrews - n;
    crewSince = n > 0 ? t : -1;
  };
  const setCrane = (t: number, n: number) => {
    if (craneBusy > 0 && craneSince >= 0) craneBusyMin += (t - craneSince) * craneBusy;
    craneBusy = n;
    freeCrane = nCrane - n;
    craneSince = n > 0 ? t : -1;
  };
  const setCure = (t: number, n: number) => {
    if (cureBusy > 0 && cureSince >= 0) cureBusyMin += (t - cureSince) * cureBusy;
    cureBusy = n;
    freeCure = nCure - n;
    cureSince = n > 0 ? t : -1;
  };
  const setFormBusy = (id: number, t: number, busy: boolean) => {
    if (busy) {
      if (formBusySince[id] < 0) formBusySince[id] = t;
    } else if (formBusySince[id] >= 0) {
      formBusyMin += t - formBusySince[id];
      formBusySince[id] = -1;
    }
  };

  const tryDispatch = (t: number) => {
    // Priority: strip > pour > clean > prepare (finish work first — classic plant rule)
    // Strip needs crew+crane
    while (qStrip.length && freeCrews > 0 && freeCrane > 0) {
      const id = qStrip.shift()!;
      formState[id] = "strip";
      formPhase[id].wait += Math.max(0, t - formStart[id]);
      setCrew(t, crewBusy + 1);
      setCrane(t, craneBusy + 1);
      setFormBusy(id, t, true);
      const w = Math.max(0, t - formStart[id]);
      waitSamples.push(w);
      const dur = sample(rng, config, f.strip_mean, f.strip_dist);
      formPhase[id].strip = dur;
      serviceTimes.push(dur);
      activityLog.push({ hauler_id: id, phase: "return", start: t, end: t + dur, duration: dur });
      push(t + dur, "strip_done", id);
      logQ(t);
    }
    // Pour needs crew+crane
    while (qPour.length && freeCrews > 0 && freeCrane > 0) {
      const id = qPour.shift()!;
      formState[id] = "pour";
      formPhase[id].wait += Math.max(0, t - formStart[id]);
      setCrew(t, crewBusy + 1);
      setCrane(t, craneBusy + 1);
      setFormBusy(id, t, true);
      const w = Math.max(0, t - formStart[id]);
      waitSamples.push(w);
      arrivalTimes.push(t);
      const dur = sample(rng, config, f.pour_mean, f.pour_dist);
      formPhase[id].pour = dur;
      serviceTimes.push(dur);
      activityLog.push({ hauler_id: id, phase: "haul", start: t, end: t + dur, duration: dur });
      push(t + dur, "pour_done", id);
      logQ(t);
    }
    // Clean needs crew only
    while (qClean.length && freeCrews > 0) {
      const id = qClean.shift()!;
      formState[id] = "clean";
      setCrew(t, crewBusy + 1);
      setFormBusy(id, t, true);
      const dur = sample(rng, config, f.clean_mean, f.clean_dist);
      activityLog.push({ hauler_id: id, phase: "return", start: t, end: t + dur, duration: dur });
      push(t + dur, "clean_done", id);
      logQ(t);
    }
    // Prepare needs crew only
    while (qPrepare.length && freeCrews > 0) {
      const id = qPrepare.shift()!;
      formState[id] = "prepare";
      setCrew(t, crewBusy + 1);
      setFormBusy(id, t, true);
      const dur = sample(rng, config, f.prepare_mean, f.prepare_dist);
      formPhase[id].prepare = dur;
      activityLog.push({ hauler_id: id, phase: "load", start: t, end: t + dur, duration: dur });
      push(t + dur, "prepare_done", id);
      logQ(t);
    }
    // Cure slots
    while (qCure.length && freeCure > 0) {
      const id = qCure.shift()!;
      formState[id] = "cure";
      formPhase[id].wait += Math.max(0, t - formStart[id]);
      setCure(t, cureBusy + 1);
      setFormBusy(id, t, true);
      const dur = sample(rng, config, f.cure_mean, f.cure_dist);
      formPhase[id].cure = dur;
      activityLog.push({ hauler_id: id, phase: "dump", start: t, end: t + dur, duration: dur });
      push(t + dur, "cure_done", id);
      logQ(t);
    }
  };

  // init: all forms ready to prepare
  for (let i = 0; i < nForms; i++) {
    formState[i] = "idle";
    formStart[i] = 0;
    qPrepare.push(i);
  }
  tryDispatch(0);

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

    const id = ev.formId;
    switch (ev.kind) {
      case "prepare_done": {
        setCrew(t, Math.max(0, crewBusy - 1));
        formState[id] = "wait_pour";
        formStart[id] = t;
        qPour.push(id);
        logQ(t);
        tryDispatch(t);
        break;
      }
      case "pour_done": {
        setCrew(t, Math.max(0, crewBusy - 1));
        setCrane(t, Math.max(0, craneBusy - 1));
        formState[id] = "wait_cure";
        formStart[id] = t;
        qCure.push(id);
        logQ(t);
        tryDispatch(t);
        break;
      }
      case "cure_done": {
        setCure(t, Math.max(0, cureBusy - 1));
        formState[id] = "wait_strip";
        formStart[id] = t;
        qStrip.push(id);
        logQ(t);
        tryDispatch(t);
        break;
      }
      case "strip_done": {
        setCrew(t, Math.max(0, crewBusy - 1));
        setCrane(t, Math.max(0, craneBusy - 1));
        // element complete
        totalTrips++;
        totalVolume += vol;
        timelineVolume.push([t, totalVolume]);
        const wait = formPhase[id].wait;
        const load = formPhase[id].prepare;
        const haul = formPhase[id].pour;
        const dump = formPhase[id].cure;
        const ret = formPhase[id].strip + f.clean_mean;
        const cycle = Math.max(0.05, t - formCycleStart[id] + f.clean_mean);
        const productive = load + haul + formPhase[id].strip + f.clean_mean;
        cycleLog.push({
          hauler_id: id,
          trip: totalTrips,
          wait,
          load,
          haul,
          dump,
          return: ret,
          cycle_time: cycle,
          productive_time: productive,
          finish_time: t,
          return_finish: t,
          volume: vol,
          productivity: (vol / cycle) * 60,
        });
        formState[id] = "idle";
        formStart[id] = t;
        formPhase[id] = { prepare: 0, pour: 0, cure: 0, strip: 0, wait: 0 };
        qClean.push(id);
        logQ(t);
        tryDispatch(t);
        break;
      }
      case "clean_done": {
        setCrew(t, Math.max(0, crewBusy - 1));
        formState[id] = "idle";
        formStart[id] = t;
        formCycleStart[id] = t;
        setFormBusy(id, t, false);
        qPrepare.push(id);
        logQ(t);
        tryDispatch(t);
        break;
      }
    }
  }

  const horizon = Math.min(t, maxHorizon) || maxHorizon;
  for (let i = 0; i < nForms; i++) setFormBusy(i, horizon, false);
  if (crewBusy > 0) setCrew(horizon, 0);
  if (craneBusy > 0) setCrane(horizon, 0);
  if (cureBusy > 0) setCure(horizon, 0);
  logQ(horizon);

  const loaderUtil = Math.min(1, crewBusyMin / (nCrews * horizon + 1e-9));
  const haulerUtil = Math.min(1, formBusyMin / (nForms * horizon + 1e-9));
  const craneUtil = Math.min(1, craneBusyMin / (nCrane * horizon + 1e-9));
  const cureUtil = Math.min(1, cureBusyMin / (nCure * horizon + 1e-9));
  const avgWait = waitSamples.length
    ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length
    : 0;
  const avgQ = qIntegral / Math.max(horizon, 1e-9);
  const thr = (totalVolume / Math.max(horizon, 1e-9)) * 60;

  let bottleneck = "Seimbang";
  let bottleneck_reason = "Crew, form, cure slot, dan crane relatif seimbang.";
  if (craneUtil > 0.9) {
    bottleneck = "Crane pabrik";
    bottleneck_reason = "Crane jenuh (pour & strip) — bottleneck klasik precast plant.";
  } else if (cureUtil > 0.9 || qCure.length > 0) {
    bottleneck = "Cure slots";
    bottleneck_reason = "Slot curing penuh — tambah kapasitas cure atau kurangi form aktif.";
  } else if (loaderUtil > 0.9) {
    bottleneck = "Crew formwork";
    bottleneck_reason = "Crew jenuh — tambah regu atau sederhanakan prepare/clean.";
  } else if (haulerUtil > 0.9) {
    bottleneck = "Forms";
    bottleneck_reason = "Semua form sibuk — throughput dibatasi jumlah form.";
  }

  const finalConfig = {
    ...config,
    crane_utilization: craneUtil,
    cure_utilization: cureUtil,
  } as SimulationConfig;

  return {
    operation: "precast_plant",
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
    loader_busy_minutes: crewBusyMin,
    hauler_busy_minutes: formBusyMin,
    avg_queue_wait: avgWait,
    avg_queue_length: avgQ,
    max_queue_length: maxQueue,
    total_wait_time: waitSamples.reduce((a, b) => a + b, 0),
    hauler_wait_ratio: waitSamples.length
      ? waitSamples.reduce((a, b) => a + b, 0) / (nForms * horizon + 1e-9)
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
      wait: cycleLog.length
        ? cycleLog.reduce((s, c) => s + c.wait, 0) / cycleLog.length
        : avgWait,
      load: cycleLog.length
        ? cycleLog.reduce((s, c) => s + c.load, 0) / cycleLog.length
        : f.prepare_mean,
      haul: cycleLog.length
        ? cycleLog.reduce((s, c) => s + c.haul, 0) / cycleLog.length
        : f.pour_mean,
      dump: cycleLog.length
        ? cycleLog.reduce((s, c) => s + c.dump, 0) / cycleLog.length
        : f.cure_mean,
      return: cycleLog.length
        ? cycleLog.reduce((s, c) => s + c.return, 0) / cycleLog.length
        : f.strip_mean + f.clean_mean,
    },
    hauler_trips: Array(nForms)
      .fill(0)
      .map((_, i) => cycleLog.filter((c) => c.hauler_id === i).length),
    hauler_busy_per_unit: Array(nForms).fill(formBusyMin / nForms),
    hauler_wait_per_unit: Array(nForms).fill(
      waitSamples.reduce((a, b) => a + b, 0) / Math.max(nForms, 1),
    ),
    arrival_times: arrivalTimes,
    service_times: serviceTimes,
    wait_samples: waitSamples,
  };
}

export function precastTheoreticalThroughput(f: PrecastFields): number {
  const cycle =
    f.prepare_mean + f.pour_mean + f.cure_mean + f.strip_mean + f.clean_mean;
  const formThr = (f.num_forms * 60) / Math.max(cycle, 1) * f.element_volume_m3;
  // crew bottleneck: prepare+pour+strip+clean per element (cure no crew)
  const crewWork = f.prepare_mean + f.pour_mean + f.strip_mean + f.clean_mean;
  const crewThr = (f.num_crews * 60) / Math.max(crewWork, 1) * f.element_volume_m3;
  // crane: pour+strip
  const craneWork = f.pour_mean + f.strip_mean;
  const craneThr = (f.num_cranes * 60) / Math.max(craneWork, 1) * f.element_volume_m3;
  // cure slots: each slot holds one element for cure_mean
  const cureThr = (f.num_cure_slots * 60) / Math.max(f.cure_mean, 1) * f.element_volume_m3;
  return Math.min(formThr, crewThr, craneThr, cureThr);
}
