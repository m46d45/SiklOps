/**
 * Browser-side usage tracker. Dual-writes: localStorage (always) + server (if up).
 */

import { OPERATIONS, type OperationId } from "./operations";
import { getUsageStatsFn, recordSimulationFn, recordVisitFn, type UsageSnapshot } from "./usage";

const VID_KEY = "siklops-visitor-id";
const LOCAL_KEY = "siklops-usage-local";
const SESSION_VISIT = "siklops-visit-session";

export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(VID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VID_KEY, id);
    }
    return id;
  } catch {
    return `tmp-${Date.now()}`;
  }
}

type LocalUsage = {
  visits: number;
  simulations: number;
  perOp: Record<string, number>;
};

function readLocal(): LocalUsage {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { visits: 0, simulations: 0, perOp: {} };
    const p = JSON.parse(raw) as LocalUsage;
    return {
      visits: Number(p.visits) || 0,
      simulations: Number(p.simulations) || 0,
      perOp: p.perOp && typeof p.perOp === "object" ? p.perOp : {},
    };
  } catch {
    return { visits: 0, simulations: 0, perOp: {} };
  }
}

function writeLocal(u: LocalUsage) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(u));
  } catch {
    /* ignore quota */
  }
}

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("siklops-usage"));
  }
}

export function trackVisitOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(SESSION_VISIT)) return;
    sessionStorage.setItem(SESSION_VISIT, "1");
  } catch {
    /* continue */
  }
  const local = readLocal();
  local.visits += 1;
  writeLocal(local);
  emit();
  const visitorId = getVisitorId();
  void recordVisitFn({ data: { visitorId } }).catch(() => undefined);
}

export function trackSimulation(operationId: OperationId | string): void {
  if (typeof window === "undefined") return;
  const local = readLocal();
  local.simulations += 1;
  local.perOp[operationId] = (local.perOp[operationId] ?? 0) + 1;
  writeLocal(local);
  emit();
  void recordSimulationFn({
    data: { visitorId: getVisitorId(), operationId },
  }).catch(() => undefined);
}

export function emptySnapshot(): UsageSnapshot {
  return {
    uniqueVisitors: 0,
    totalVisits: 0,
    visitsToday: 0,
    uniqueToday: 0,
    totalSimulations: 0,
    simulationsToday: 0,
    dbSource: "pglite",
    persistent: false,
    perOperation: OPERATIONS.map((op) => ({
      id: op.id,
      title: op.shortTitle,
      runs: 0,
      lastRun: null,
    })),
  };
}

export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  try {
    return await getUsageStatsFn();
  } catch {
    const local = readLocal();
    return {
      uniqueVisitors: local.visits > 0 ? 1 : 0,
      totalVisits: local.visits,
      visitsToday: local.visits,
      uniqueToday: local.visits > 0 ? 1 : 0,
      totalSimulations: local.simulations,
      simulationsToday: local.simulations,
      dbSource: "pglite",
      persistent: false,
      perOperation: OPERATIONS.map((op) => ({
        id: op.id,
        title: op.shortTitle,
        runs: local.perOp[op.id] ?? 0,
        lastRun: null,
      })),
    };
  }
}
