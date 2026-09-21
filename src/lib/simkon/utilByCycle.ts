/**
 * Utilisasi resource per nomor siklus (kumulatif + jendela antar-siklus).
 * Port logika SimKon Python `_build_resource_util_by_cycle`.
 */

import type { SimulationResult } from "./engine";

export type UtilByCyclePoint = {
  siklus: number;
  finish_time: number;
  /** % 0–100 */
  loader_cum: number;
  hauler_cum: number;
  wait_cum: number;
  loader_cycle: number;
  hauler_cycle: number;
  wait_cycle: number;
};

function clipLen(start: number, end: number, t0: number, t1: number): number {
  const s = Math.max(start, t0);
  const e = Math.min(end, t1);
  return Math.max(0, e - s);
}

function busyIn(
  intervals: [number, number][],
  t0: number,
  t1: number,
): number {
  let s = 0;
  for (const [a, b] of intervals) s += clipLen(a, b, t0, t1);
  return s;
}

export function buildResourceUtilByCycle(result: SimulationResult): UtilByCyclePoint[] {
  if (!result.cycle_log.length) return [];

  const nLoaders = Math.max(1, Math.floor(result.config.num_loaders));
  const nHaulers = Math.max(1, Math.floor(result.config.num_haulers));

  const cycles = [...result.cycle_log].sort(
    (a, b) => a.finish_time - b.finish_time || a.trip - b.trip,
  );
  const finishTimes = cycles.map((c) => c.finish_time);

  const loadIv: [number, number][] = [];
  const haulBusyIv: [number, number][] = [];
  const waitIv: [number, number][] = [];

  for (const a of result.activity_log) {
    const iv: [number, number] = [a.start, a.end];
    if (a.phase === "load") loadIv.push(iv);
    if (a.phase === "load" || a.phase === "haul" || a.phase === "dump" || a.phase === "return") {
      haulBusyIv.push(iv);
    }
    if (a.phase === "wait") waitIv.push(iv);
  }

  const rows: UtilByCyclePoint[] = [
    {
      siklus: 0,
      finish_time: 0,
      loader_cum: 0,
      hauler_cum: 0,
      wait_cum: 0,
      loader_cycle: 0,
      hauler_cycle: 0,
      wait_cycle: 0,
    },
  ];

  let prevT = 0;
  finishTimes.forEach((rawT, i) => {
    const t = Math.max(rawT, prevT + 1e-9);
    const loadB = busyIn(loadIv, 0, t);
    const haulB = busyIn(haulBusyIv, 0, t);
    const waitB = busyIn(waitIv, 0, t);
    const loaderCum = t > 0 ? Math.min(1, loadB / (nLoaders * t)) : 0;
    const haulerCum = t > 0 ? Math.min(1, haulB / (nHaulers * t)) : 0;
    const waitCum = t > 0 ? Math.min(1, waitB / (nHaulers * t)) : 0;

    const dt = t - prevT;
    const loadW = busyIn(loadIv, prevT, t);
    const haulW = busyIn(haulBusyIv, prevT, t);
    const waitW = busyIn(waitIv, prevT, t);
    const loaderCy = dt > 0 ? Math.min(1, loadW / (nLoaders * dt)) : 0;
    const haulerCy = dt > 0 ? Math.min(1, haulW / (nHaulers * dt)) : 0;
    const waitCy = dt > 0 ? Math.min(1, waitW / (nHaulers * dt)) : 0;

    rows.push({
      siklus: i + 1,
      finish_time: t,
      loader_cum: Math.round(loaderCum * 1000) / 10,
      hauler_cum: Math.round(haulerCum * 1000) / 10,
      wait_cum: Math.round(waitCum * 1000) / 10,
      loader_cycle: Math.round(loaderCy * 1000) / 10,
      hauler_cycle: Math.round(haulerCy * 1000) / 10,
      wait_cycle: Math.round(waitCy * 1000) / 10,
    });
    prevT = t;
  });

  return rows;
}
