/**
 * Server functions: visitor + simulation usage stats.
 * Persists in PGLite (preview) or Neon (DATABASE_URL).
 *
 * Classroom hardening:
 *  - daily rollups instead of unbounded usage_events writes
 *  - visit dedup (15 min) and per-visitor simulation rate limit
 */

import { createServerFn } from "@tanstack/react-start";
import { dbSource, getSql } from "@/lib/db";
import { OPERATIONS, type OperationId } from "./operations";

const OPS = new Set(OPERATIONS.map((o) => o.id));

const VISIT_DEDUP_MINUTES = 15;
const SIM_RATE_MAX_PER_DAY = 80;

function cleanVisitorId(id: unknown): string {
  if (typeof id !== "string") return "";
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function cleanOp(id: unknown): OperationId | "" {
  if (typeof id !== "string") return "";
  return OPS.has(id as OperationId) ? (id as OperationId) : "";
}

export type UsageSnapshot = {
  uniqueVisitors: number;
  totalVisits: number;
  visitsToday: number;
  uniqueToday: number;
  totalSimulations: number;
  simulationsToday: number;
  perOperation: { id: OperationId; title: string; lastRun: string | null; runs: number }[];
  dbSource: "neon" | "pglite";
  persistent: boolean;
};

async function ensureSchema() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists usage_visitors (
      visitor_id text primary key,
      first_seen timestamptz not null default now(),
      last_seen timestamptz not null default now(),
      visit_count integer not null default 1
    )
  `);
  await sql.query(`
    create table if not exists usage_simulations (
      operation_id text primary key,
      run_count integer not null default 0,
      last_run timestamptz
    )
  `);
  await sql.query(`
    create table if not exists usage_daily (
      day date not null,
      kind text not null,
      visitor_id text not null default '',
      operation_id text not null default '',
      count integer not null default 0,
      primary key (day, kind, visitor_id, operation_id)
    )
  `);
  return sql;
}

async function bumpDaily(
  sql: Awaited<ReturnType<typeof getSql>>,
  kind: "visit" | "simulation",
  visitorId: string,
  operationId = "",
) {
  await sql.query(
    `insert into usage_daily (day, kind, visitor_id, operation_id, count)
     values (current_date, $1, $2, $3, 1)
     on conflict (day, kind, visitor_id, operation_id)
     do update set count = usage_daily.count + 1`,
    [kind, visitorId, operationId],
  );
}

export const recordVisitFn = createServerFn({ method: "POST" })
  .validator((d: { visitorId: string }) => ({ visitorId: cleanVisitorId(d?.visitorId) }))
  .handler(async ({ data }) => {
    if (!data.visitorId) return { ok: false as const };
    const sql = await ensureSchema();
    const existing = await sql.query<{ visit_count: number; last_seen: string }>(
      "select visit_count, last_seen::text from usage_visitors where visitor_id = $1",
      [data.visitorId],
    );
    if (existing.length === 0) {
      await sql.query(
        "insert into usage_visitors (visitor_id, visit_count) values ($1, 1)",
        [data.visitorId],
      );
      await bumpDaily(sql, "visit", data.visitorId);
      return { ok: true as const };
    }
    const last = existing[0].last_seen ? new Date(existing[0].last_seen) : null;
    const recent =
      last &&
      Number.isFinite(last.getTime()) &&
      Date.now() - last.getTime() < VISIT_DEDUP_MINUTES * 60_000;
    if (recent) {
      await sql.query(
        "update usage_visitors set last_seen = now() where visitor_id = $1",
        [data.visitorId],
      );
      return { ok: true as const, deduped: true as const };
    }
    await sql.query(
      "update usage_visitors set last_seen = now(), visit_count = visit_count + 1 where visitor_id = $1",
      [data.visitorId],
    );
    await bumpDaily(sql, "visit", data.visitorId);
    return { ok: true as const };
  });

export const recordSimulationFn = createServerFn({ method: "POST" })
  .validator((d: { visitorId: string; operationId: string }) => ({
    visitorId: cleanVisitorId(d?.visitorId),
    operationId: cleanOp(d?.operationId),
  }))
  .handler(async ({ data }) => {
    if (!data.operationId) return { ok: false as const };
    const sql = await ensureSchema();
    if (data.visitorId) {
      const paced = await sql.query<{ n: number }>(
        `select coalesce(sum(count), 0)::int as n
         from usage_daily
         where day = current_date and kind = 'simulation' and visitor_id = $1`,
        [data.visitorId],
      );
      if ((paced[0]?.n ?? 0) >= SIM_RATE_MAX_PER_DAY) {
        return { ok: false as const, limited: true as const };
      }
    }
    await sql.query(
      `insert into usage_simulations (operation_id, run_count, last_run)
       values ($1, 1, now())
       on conflict (operation_id) do update
         set run_count = usage_simulations.run_count + 1,
             last_run = now()`,
      [data.operationId],
    );
    await bumpDaily(sql, "simulation", data.visitorId || "", data.operationId);
    return { ok: true as const };
  });

export const getUsageStatsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsageSnapshot> => {
    const sql = await ensureSchema();
    const totals = await sql.query<{
      unique_visitors: number;
      total_visits: number;
    }>(
      `select
         coalesce(count(*), 0)::int as unique_visitors,
         coalesce(sum(visit_count), 0)::int as total_visits
       from usage_visitors`,
    );
    const today = await sql.query<{ visits_today: number; unique_today: number }>(
      `select
         coalesce(sum(count), 0)::int as visits_today,
         coalesce(count(distinct visitor_id), 0)::int as unique_today
       from usage_daily
       where kind = 'visit' and day = current_date`,
    );
    const sims = await sql.query<{ total: number; today: number }>(
      `select
         (select coalesce(sum(run_count), 0)::int from usage_simulations) as total,
         (select coalesce(sum(count), 0)::int from usage_daily
            where kind = 'simulation' and day = current_date) as today`,
    );
    const rows = await sql.query<{
      operation_id: string;
      run_count: number;
      last_run: string | null;
    }>("select operation_id, run_count, last_run::text from usage_simulations");
    const byId = new Map(rows.map((r) => [r.operation_id, r]));
    const perOperation = OPERATIONS.map((op) => {
      const r = byId.get(op.id);
      return {
        id: op.id,
        title: op.shortTitle,
        runs: r?.run_count ?? 0,
        lastRun: r?.last_run ?? null,
      };
    });
    return {
      uniqueVisitors: totals[0]?.unique_visitors ?? 0,
      totalVisits: totals[0]?.total_visits ?? 0,
      visitsToday: today[0]?.visits_today ?? 0,
      uniqueToday: today[0]?.unique_today ?? 0,
      totalSimulations: sims[0]?.total ?? 0,
      simulationsToday: sims[0]?.today ?? 0,
      perOperation,
      dbSource,
      persistent: dbSource === "neon",
    };
  },
);
