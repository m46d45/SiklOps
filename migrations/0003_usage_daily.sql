-- Daily rollups for classroom stats (replaces unbounded usage_events writes).

create table if not exists usage_daily (
  day date not null,
  kind text not null,
  visitor_id text not null default '',
  operation_id text not null default '',
  count integer not null default 0,
  primary key (day, kind, visitor_id, operation_id)
);

create index if not exists usage_daily_day_kind_idx on usage_daily (day, kind);
