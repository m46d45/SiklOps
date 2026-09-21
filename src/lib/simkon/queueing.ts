/**
 * Little's Law & Kingman system analysis (port of queueing_theory.py).
 */

import { expectedMean, resolveDist, resourceLabels, type SimulationResult } from "./engine";
import { isRmcOperation } from "./rmcEngine";

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function cv(xs: number[]): number {
  const m = mean(xs);
  if (m <= 1e-12) return 0;
  return std(xs) / m;
}

function interarrival(times: number[]): number[] {
  if (times.length < 2) return [];
  const arr = [...times].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[i - 1]) out.push(arr[i] - arr[i - 1]);
  }
  return out;
}

function erlangC(cIn: number, traffic: number): number {
  const c = Math.max(1, Math.floor(cIn));
  const a = traffic;
  if (a <= 0) return 0;
  if (a >= c - 1e-12) return 1;
  let sumTerm = 0;
  let term = 1;
  for (let k = 0; k < c; k++) {
    if (k > 0) term *= a / k;
    sumTerm += term;
  }
  const termC = c > 0 ? (term * a) / c : 0;
  const last = (termC * c) / (c - a);
  const denom = sumTerm + last;
  if (denom <= 0) return 1;
  return Math.min(1, last / denom);
}

function wqMMc(lam: number, mu: number, cIn: number): number {
  const c = Math.max(1, Math.floor(cIn));
  if (lam <= 0 || mu <= 0) return 0;
  if (lam / (c * mu) >= 1 - 1e-12) return Infinity;
  const a = lam / mu;
  const pWait = erlangC(c, a);
  return pWait / (c * mu - lam);
}

function relErr(pred: number | null | undefined, obs: number): number | null {
  if (obs == null || Math.abs(obs) < 1e-12) return null;
  if (pred == null || !Number.isFinite(pred)) return null;
  return (pred - obs) / obs;
}

export type SystemAnalysis = {
  T_min: number;
  n_arrivals: number;
  n_trips: number;
  n_excavator: number;
  n_truck: number;
  bottleneck: string;
  lambda_arr_per_hour: number;
  lambda_trip_per_hour: number;
  W_q_sim: number;
  L_q_sim: number;
  L_q_little: number;
  W_q_from_L: number;
  W_cycle_sim: number;
  W_cycle_from_little: number;
  L_sys_little: number;
  N_fleet: number;
  little_N_error_rel: number | null;
  t_s_sys: number;
  c_a_sys: number;
  c_s_sys: number;
  vut_factor: number;
  rho_sys: number;
  rho_excavator: number;
  rho_truck: number;
  W_q_kingman: number | null;
  W_q_kingman_no_var: number | null;
  W_q_vut_classic: number | null;
  CT_sim: number;
  CT_kingman: number | null;
  CT_no_var: number;
  stable: boolean;
};

export function analyzeSystem(result: SimulationResult): SystemAnalysis {
  const T = Math.max(result.simulated_minutes, 1e-9);
  const nExc = Math.max(1, result.config.num_loaders);
  const nTruck = Math.max(1, result.config.num_haulers);

  const arrivals = result.arrival_times.filter((t) => t >= 0 && t <= T + 1e-9);
  const servicesLoad = result.service_times.filter((s) => s > 0);
  const nArr = arrivals.length;
  const lamArr = nArr > 0 ? nArr / T : 0;

  const cycles = result.cycle_log;
  const nTrips = Math.max(cycles.length, result.total_trips);
  const lamTrip = nTrips > 0 ? nTrips / T : 0;

  const waits = cycles.map((c) => c.wait);
  const loads = cycles.map((c) => c.load);
  const loadSamples = loads.length ? loads : servicesLoad;
  const productive = cycles.map((c) => c.productive_time);
  const cycleTimes = cycles.map((c) => c.cycle_time);
  const finishTimes = cycles.map((c) => c.finish_time);

  const W_q_sim = result.avg_queue_wait;
  const L_q_sim = result.avg_queue_length;
  const L_q_little = lamArr * W_q_sim;
  const W_q_from_L = lamArr > 1e-12 ? L_q_sim / lamArr : 0;

  const t_s_load = loadSamples.length
    ? mean(loadSamples)
    : Math.max(
        0.05,
        expectedMean(resolveDist(result.config, result.config.load_dist, result.config.load_time_mean)),
      );

  const W_cycle = cycleTimes.length ? mean(cycleTimes) : 0;
  const L_sys_little = W_cycle > 0 ? lamTrip * W_cycle : 0;
  const N_fleet = nTruck;
  const W_cycle_from_little = lamTrip > 1e-12 ? N_fleet / lamTrip : 0;

  let t_s_sys = productive.length ? mean(productive) : Math.max(W_cycle - W_q_sim, t_s_load);
  t_s_sys = Math.max(0.05, t_s_sys);
  const c_s_sys = productive.length >= 2 ? cv(productive) : cv(cycleTimes);

  const iatIn = interarrival(arrivals);
  const iatOut = interarrival(finishTimes);
  const c_a_sys =
    iatIn.length >= 2 ? cv(iatIn) : iatOut.length >= 2 ? cv(iatOut) : 1;

  const labels = resourceLabels(result.operation);
  const rhoExc = result.loader_utilization;
  const rhoTruck = result.hauler_utilization;
  let bottleneck: string;
  let rhoSys: number;
  let cSys: number;
  if (rhoExc >= rhoTruck) {
    bottleneck = labels.loader;
    rhoSys = rhoExc;
    cSys = nExc;
  } else {
    bottleneck = labels.hauler;
    rhoSys = rhoTruck;
    cSys = nTruck;
  }
  rhoSys = Math.min(0.999, Math.max(0, rhoSys));

  const lamSys = lamTrip > 0 ? lamTrip : lamArr;
  const muSys = 1 / t_s_sys;
  const vut = 0.5 * (c_a_sys ** 2 + c_s_sys ** 2);

  const wqMmc = lamSys > 0 && muSys > 0 ? wqMMc(lamSys, muSys, cSys) : 0;
  const W_q_kingman = Number.isFinite(wqMmc) ? vut * wqMmc : Infinity;
  const W_q_no_var = Number.isFinite(wqMmc) ? 0 : Infinity;

  let W_q_vut_classic: number;
  if (rhoSys < 1 - 1e-12) {
    W_q_vut_classic = vut * (rhoSys / (1 - rhoSys)) * t_s_sys;
  } else {
    W_q_vut_classic = Infinity;
  }

  const CT_kingman = Number.isFinite(W_q_kingman) ? t_s_sys + W_q_kingman : Infinity;
  const CT_no_var = t_s_sys;
  const CT_sim = W_cycle > 0 ? W_cycle : t_s_sys + W_q_sim;

  return {
    T_min: T,
    n_arrivals: nArr,
    n_trips: nTrips,
    n_excavator: nExc,
    n_truck: nTruck,
    bottleneck,
    lambda_arr_per_hour: lamArr * 60,
    lambda_trip_per_hour: lamTrip * 60,
    W_q_sim,
    L_q_sim,
    L_q_little,
    W_q_from_L,
    W_cycle_sim: W_cycle,
    W_cycle_from_little,
    L_sys_little,
    N_fleet,
    little_N_error_rel: relErr(L_sys_little, N_fleet),
    t_s_sys,
    c_a_sys,
    c_s_sys,
    vut_factor: vut,
    rho_sys: rhoSys,
    rho_excavator: rhoExc,
    rho_truck: rhoTruck,
    W_q_kingman: Number.isFinite(W_q_kingman) ? W_q_kingman : null,
    W_q_kingman_no_var: Number.isFinite(W_q_no_var) ? W_q_no_var : null,
    W_q_vut_classic: Number.isFinite(W_q_vut_classic) ? W_q_vut_classic : null,
    CT_sim,
    CT_kingman: Number.isFinite(CT_kingman) ? CT_kingman : null,
    CT_no_var,
    stable: rhoSys < 0.99 && Number.isFinite(wqMmc),
  };
}

export function kingmanCurve(
  t_s: number,
  c_a: number,
  c_s: number,
  rhoMax = 0.95,
  nPoints = 40,
): { rho: number; W_q: number; rho_pct: number }[] {
  const vut = 0.5 * (c_a ** 2 + c_s ** 2);
  const rows: { rho: number; W_q: number; rho_pct: number }[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const rho = (i / nPoints) * rhoMax;
    let wq = 0;
    if (rho >= 1e-6 && rho < 1 - 1e-12) {
      wq = vut * (rho / (1 - rho)) * t_s;
    }
    rows.push({ rho, W_q: wq, rho_pct: rho * 100 });
  }
  return rows;
}

export function whatIfTips(result: SimulationResult): string[] {
  const tips: string[] = [];
  const labels = resourceLabels(result.operation);
  const bn = result.bottleneck.toLowerCase();
  const L = labels.loader;
  const H = labels.hauler;

  if (
    bn.includes("excavator") ||
    bn.includes("loader") ||
    bn.includes(L.toLowerCase()) ||
    bn.includes("tukang") ||
    bn.includes("mixer")
  ) {
    tips.push(`Tambah 1 unit ${L} — amati apakah throughput naik dan antrian turun.`);
    tips.push(`Percepat tugas load/batch 15–20% tanpa menambah ${L}.`);
  }
  if (
    bn.includes("truck") ||
    bn.includes("hauler") ||
    bn.includes(H.toLowerCase()) ||
    bn.includes("helper")
  ) {
    tips.push(`Tambah 1–2 ${H} — cek utilisasi ${L} dan waktu tunggu.`);
    tips.push(`Perpendek haul/return (atau place) 15–25%.`);
  }
  if (bn.includes("seimbang") || bn.includes("under")) {
    tips.push(
      `Kurangi jumlah ${H} bertahap sampai utilisasi ${L} naik mendekati 80–90% tanpa antrian panjang.`,
    );
    tips.push("Naikkan CV ke 0.35 di tab Perbandingan — lihat sebaran antrian & emisi.");
  }
  tips.push("Pakai multi-run (beberapa seed) untuk melihat sebaran throughput/biaya/emisi.");
  tips.push("Cek sweet spot: min biaya satuan vs min emisi satuan bisa di fleet berbeda.");
  tips.push(`Bandingkan match factor dengan jumlah ${H} ideal teori di Feedback.`);
  return tips;
}

export function theoreticalCaps(result: SimulationResult) {
  const cfg = result.config;
  if (isRmcOperation(cfg.operation)) {
    const placeCycle =
      (cfg.place_fill_mean ?? cfg.load_time_mean) +
      (cfg.place_travel_mean ?? cfg.haul_time_mean) +
      (cfg.place_place_mean ?? cfg.dump_time_mean) +
      (cfg.place_return_mean ?? cfg.return_time_mean);
    const truckCycle =
      (cfg.truck_batch_mean ?? 5) +
      (cfg.truck_haul_mean ?? 18) +
      (cfg.truck_discharge_mean ?? 4) +
      (cfg.truck_return_mean ?? 16);
    const placeCap = Math.max(0.01, cfg.place_capacity_m3 ?? cfg.payload_per_trip ?? 0.5);
    const truckCap = Math.max(0.01, cfg.truck_capacity_m3 ?? 7);
    const nP = Math.max(1, cfg.num_place ?? cfg.num_loaders);
    const nT = Math.max(1, cfg.num_trucks ?? cfg.num_haulers);
    const loaderProd = placeCycle > 0 ? (60 / placeCycle) * nP * placeCap : 0;
    const haulerProd = truckCycle > 0 ? (60 / truckCycle) * nT * truckCap : 0;
    const match = loaderProd > 0 ? haulerProd / loaderProd : 0;
    return { loaderProd, haulerProd, match, cycle: placeCycle };
  }
  const cycle = cycleTimeFromConfig(cfg);
  const loaderProd =
    cfg.load_time_mean > 0
      ? (60 / cfg.load_time_mean) * cfg.num_loaders * cfg.payload_per_trip
      : 0;
  const haulerProd =
    cycle > 0 ? (60 / cycle) * cfg.num_haulers * cfg.payload_per_trip : 0;
  const match = loaderProd > 0 ? haulerProd / loaderProd : 0;
  return { loaderProd, haulerProd, match, cycle };
}

function cycleTimeFromConfig(cfg: SimulationResult["config"]): number {
  return (
    expectedMean(resolveDist(cfg, cfg.load_dist, cfg.load_time_mean)) +
    expectedMean(resolveDist(cfg, cfg.haul_dist, cfg.haul_time_mean)) +
    expectedMean(resolveDist(cfg, cfg.dump_dist, cfg.dump_time_mean)) +
    expectedMean(resolveDist(cfg, cfg.return_dist, cfg.return_time_mean))
  );
}
