-- SiklOps usage: unique visitors, visits, simulation runs per operation.

create table if not exists usage_visitors (
  visitor_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visit_count integer not null default 1
);

create table if not exists usage_simulations (
  operation_id text primary key,
  run_count integer not null default 0,
  last_run timestamptz
);

create table if not exists usage_events (
  id bigserial primary key,
  kind text not null,
  visitor_id text,
  operation_id text,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_created_idx on usage_events (created_at desc);
create index if not exists usage_events_kind_idx on usage_events (kind, created_at desc);
