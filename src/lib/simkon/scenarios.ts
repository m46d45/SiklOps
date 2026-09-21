/** Simpan / muat skenario parameter di localStorage. */

import type { SimulationConfig } from "./engine";

const KEY = "siklops.scenarios.v1";

export type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  config: SimulationConfig;
};

function readAll(): SavedScenario[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedScenario[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listScenarios(): SavedScenario[] {
  return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveScenario(name: string, config: SimulationConfig): SavedScenario {
  const list = readAll();
  const item: SavedScenario = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || `Skenario ${list.length + 1}`,
    savedAt: new Date().toISOString(),
    config: JSON.parse(JSON.stringify(config)) as SimulationConfig,
  };
  list.push(item);
  writeAll(list);
  return item;
}

export function deleteScenario(id: string) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export function getScenario(id: string): SavedScenario | undefined {
  return readAll().find((s) => s.id === id);
}
