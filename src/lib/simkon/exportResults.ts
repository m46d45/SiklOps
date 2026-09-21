/** Export ringkas hasil simulasi ke CSV (client-side download). */

import type { SimulationResult } from "./engine";
import { resourceLabels } from "./engine";
import { computeCosts } from "./costs";
import { computeEmissions } from "./emissions";
import { theoreticalCaps } from "./queueing";

export function resultToCsv(result: SimulationResult): string {
  const labels = resourceLabels(result.operation);
  const costs = computeCosts(result);
  const em = computeEmissions(result);
  const caps = theoreticalCaps(result);
  const rows: string[][] = [
    ["metric", "value", "unit"],
    ["operation", result.operation, ""],
    ["total_trips", String(result.total_trips), ""],
    ["total_volume", String(result.total_volume), labels.unit],
    ["throughput_per_hour", String(result.throughput_per_hour), `${labels.unit}/jam`],
    ["simulated_hours", String(result.simulated_minutes / 60), "jam"],
    ["loader_util", String(result.loader_utilization), "ratio"],
    ["hauler_util", String(result.hauler_utilization), "ratio"],
    ["avg_queue_wait", String(result.avg_queue_wait), "mnt"],
    ["match_factor", String(caps.match), ""],
    ["cost_total", String(costs.cost_total), costs.currency],
    ["unit_cost", String(costs.unit_cost), `${costs.currency}/${labels.unit}`],
    ["cost_wait", String(costs.cost_wait), costs.currency],
    ["emission_total_kg", String(em.emission_total), "kg CO2e"],
    ["unit_emission", String(em.unit_emission), `kg/${labels.unit}`],
    ["bottleneck", result.bottleneck, ""],
    ["stop_reason", result.stop_reason, ""],
    ["num_loaders", String(result.config.num_loaders), labels.loader],
    ["num_haulers", String(result.config.num_haulers), labels.hauler],
    ["seed", String(result.config.seed ?? ""), ""],
  ];
  rows.push([]);
  rows.push(["cycle", "wait", "load", "haul", "dump", "return", "cycle_time", "productivity"]);
  for (const c of result.cycle_log) {
    rows.push([
      String(c.trip),
      String(c.wait),
      String(c.load),
      String(c.haul),
      String(c.dump),
      String(c.return),
      String(c.cycle_time),
      String(c.productivity),
    ]);
  }
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
