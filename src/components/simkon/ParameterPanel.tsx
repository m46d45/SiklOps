import type { ReactNode } from "react";
import {
  DIESEL_KG_CO2_PER_L,
  DIST_LABELS,
  emissionsFromFuel,
  fromMeanCv,
  makeDist,
  type DistKind,
  type DurationDist,
  type SimulationConfig,
} from "@/lib/simkon/engine";
import { getOperation, type OperationId } from "@/lib/simkon/operations";
import { isRmcOperation, rmcMethodLabel, placementMethodOf } from "@/lib/simkon/rmcEngine";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const DIST_KEYS = Object.keys(DIST_LABELS) as DistKind[];

type TaskKey = "load" | "haul" | "dump" | "return";

const TASK_META: {
  key: TaskKey;
  meanKey: keyof SimulationConfig;
  distKey: keyof SimulationConfig;
  maxMean: number;
}[] = [
  { key: "load", meanKey: "load_time_mean", distKey: "load_dist", maxMean: 30 },
  { key: "haul", meanKey: "haul_time_mean", distKey: "haul_dist", maxMean: 60 },
  { key: "dump", meanKey: "dump_time_mean", distKey: "dump_dist", maxMean: 40 },
  { key: "return", meanKey: "return_time_mean", distKey: "return_dist", maxMean: 60 },
];

type Props = {
  draft: SimulationConfig;
  onChange: (next: SimulationConfig) => void;
  operationId?: OperationId;
  className?: string;
};

function ensureDist(draft: SimulationConfig, distKey: TaskKey, mean: number): DurationDist {
  const key = `${distKey}_dist` as const;
  const existing = draft[key];
  if (existing) return { ...existing, mean };
  return fromMeanCv(mean, draft.cv, draft.default_dist_kind);
}

export function ParameterPanel({
  draft,
  onChange,
  operationId,
  className,
}: Props) {
  const op = getOperation(operationId ?? draft.operation ?? "earthmoving");
  const set = (patch: Partial<SimulationConfig>) => onChange({ ...draft, ...patch });

  const setFuel = (
    workKey: "fuel_loader_work_lph" | "fuel_hauler_work_lph",
    idleKey: "fuel_loader_idle_lph" | "fuel_hauler_idle_lph",
    emWork: "emission_loader_work_kg_per_h" | "emission_hauler_work_kg_per_h",
    emIdle: "emission_loader_idle_kg_per_h" | "emission_hauler_idle_kg_per_h",
    which: "work" | "idle",
    v: number,
  ) => {
    if (which === "work") {
      set({ [workKey]: v, [emWork]: emissionsFromFuel(v) } as Partial<SimulationConfig>);
    } else {
      set({ [idleKey]: v, [emIdle]: emissionsFromFuel(v) } as Partial<SimulationConfig>);
    }
  };

  const setTaskMean = (task: (typeof TASK_META)[number], mean: number) => {
    const dist = ensureDist(draft, task.key, mean);
    onChange({
      ...draft,
      [task.meanKey]: mean,
      [task.distKey]: rebuildDist({ ...dist, mean }, dist.kind, dist.cv),
    });
  };

  const setTaskDistKind = (task: (typeof TASK_META)[number], kind: DistKind) => {
    const mean = draft[task.meanKey] as number;
    const prev = ensureDist(draft, task.key, mean);
    const cv = kind === "constant" ? 0 : prev.cv > 0 ? prev.cv : 0.2;
    onChange({
      ...draft,
      [task.distKey]: rebuildDist({ ...prev, mean, kind, cv }, kind, cv),
    });
  };

  const setTaskCv = (task: (typeof TASK_META)[number], cv: number) => {
    const mean = draft[task.meanKey] as number;
    const prev = ensureDist(draft, task.key, mean);
    onChange({
      ...draft,
      [task.distKey]: rebuildDist({ ...prev, mean, cv }, prev.kind, cv),
    });
  };

  const setTaskBeta = (
    task: (typeof TASK_META)[number],
    patch: Partial<Pick<DurationDist, "alpha" | "beta_shape" | "min_bound" | "max_bound">>,
  ) => {
    const mean = draft[task.meanKey] as number;
    const prev = ensureDist(draft, task.key, mean);
    onChange({
      ...draft,
      [task.distKey]: { ...prev, mean, kind: "beta", ...patch },
    });
  };

  const taskLabel = (key: TaskKey) =>
    op.tasks.find((t) => t.key === key)?.label ?? key;

  const bucketsPerLoad =
    draft.loader_bucket_m3 > 0
      ? draft.hauler_capacity_m3 / draft.loader_bucket_m3
      : 0;

  return (
    <div className={cn("space-y-6", className)}>
      {isRmcOperation(op.id) ? (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-primary/25 bg-primary/5 p-3 sm:p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Dual-cycle RMC · {rmcMethodLabel(placementMethodOf(op.id))}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Siklus A</strong> — truck mixer: batch di
              plant → haul ke site → discharge ke buffer → return plant.{" "}
              <strong className="text-foreground">Siklus B</strong> — pengecoran di site (
              {op.loaderLabel}): fill dari buffer → travel → place → return. Kedua siklus
              berinteraksi lewat <strong className="text-foreground">buffer site</strong>.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ResourceCard title="Siklus A · Truck mixer (plant ↔ site)">
              <NumField
                label="Jumlah truck"
                value={draft.num_trucks ?? draft.num_haulers}
                min={1}
                max={40}
                step={1}
                onChange={(v) =>
                  set({ num_trucks: Math.floor(v), num_haulers: Math.floor(v) })
                }
              />
              <NumField
                label="Kapasitas drum"
                unit="m³"
                value={draft.truck_capacity_m3 ?? 5}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(v) => set({ truck_capacity_m3: v })}
              />
              <NumField
                label="Batch di plant"
                unit="mnt"
                value={draft.truck_batch_mean ?? 5}
                min={0.5}
                max={60}
                step={0.5}
                onChange={(v) => set({ truck_batch_mean: v })}
              />
              <NumField
                label="Haul ke site"
                unit="mnt"
                value={draft.truck_haul_mean ?? 20}
                min={0.5}
                max={120}
                step={0.5}
                onChange={(v) => set({ truck_haul_mean: v })}
              />
              <NumField
                label="Discharge ke buffer"
                unit="mnt"
                value={draft.truck_discharge_mean ?? 4}
                min={0.5}
                max={40}
                step={0.5}
                onChange={(v) => set({ truck_discharge_mean: v })}
              />
              <NumField
                label="Return ke plant"
                unit="mnt"
                value={draft.truck_return_mean ?? 18}
                min={0.5}
                max={120}
                step={0.5}
                onChange={(v) => set({ truck_return_mean: v })}
              />
            </ResourceCard>
            <ResourceCard title={`Siklus B · ${op.loaderLabel} (pengecoran)`}>
              <NumField
                label={`Jumlah ${op.loaderLabel.toLowerCase()}`}
                value={draft.num_place ?? draft.num_loaders}
                min={1}
                max={20}
                step={1}
                onChange={(v) =>
                  set({ num_place: Math.floor(v), num_loaders: Math.floor(v) })
                }
              />
              <NumField
                label={op.loaderCapacityLabel}
                unit="m³"
                value={draft.place_capacity_m3 ?? draft.hauler_capacity_m3}
                min={0.05}
                max={10}
                step={0.05}
                onChange={(v) =>
                  set({
                    place_capacity_m3: v,
                    hauler_capacity_m3: v,
                    payload_per_trip: v,
                    loader_bucket_m3: v,
                  })
                }
              />
              <NumField
                label="Fill dari buffer"
                unit="mnt"
                value={draft.place_fill_mean ?? draft.load_time_mean}
                min={0.5}
                max={30}
                step={0.5}
                onChange={(v) => set({ place_fill_mean: v, load_time_mean: v })}
              />
              <NumField
                label="Travel / lift / pump"
                unit="mnt"
                value={draft.place_travel_mean ?? draft.haul_time_mean}
                min={0.5}
                max={60}
                step={0.5}
                onChange={(v) => set({ place_travel_mean: v, haul_time_mean: v })}
              />
              <NumField
                label="Place"
                unit="mnt"
                value={draft.place_place_mean ?? draft.dump_time_mean}
                min={0.5}
                max={40}
                step={0.5}
                onChange={(v) => set({ place_place_mean: v, dump_time_mean: v })}
              />
              <NumField
                label="Return unit place"
                unit="mnt"
                value={draft.place_return_mean ?? draft.return_time_mean}
                min={0.5}
                max={60}
                step={0.5}
                onChange={(v) => set({ place_return_mean: v, return_time_mean: v })}
              />
            </ResourceCard>
          </div>
          <NumField
            label="Kapasitas buffer site"
            unit="m³"
            value={draft.buffer_capacity_m3 ?? 6}
            min={0.2}
            max={50}
            step={0.5}
            onChange={(v) => set({ buffer_capacity_m3: v })}
          />
          <p className="text-xs text-muted-foreground">
            Buffer penuh → truck antri discharge. Buffer kosong → unit place menunggu supply.
            Volume produksi dihitung saat <strong className="text-foreground">place</strong>{" "}
            selesai.
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">
            {isRmcOperation(op.id) ? "Biaya & solar (kedua siklus)" : "Resource"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Jumlah unit, kapasitas, biaya (ribu Rp/jam), solar (L/jam → emisi otomatis).
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-muted/40 px-3 py-2.5">
          <div>
            <Label htmlFor="all-in">Biaya all-in (sewa + operator)</Label>
            <p className="text-xs text-muted-foreground">
              Dry hire saja jika mati; operator ditambah jika aktif.
            </p>
          </div>
          <Switch
            id="all-in"
            checked={!!draft.cost_all_in}
            onCheckedChange={(on) => set({ cost_all_in: on })}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ResourceCard title={op.loaderLabel}>
            <Field label="Jumlah unit" value={`${draft.num_loaders}`}>
              <Slider
                min={1}
                max={6}
                step={1}
                value={[draft.num_loaders]}
                onValueChange={([v]) => set({ num_loaders: v })}
              />
            </Field>
            <NumField
              label={op.loaderCapacityLabel}
              unit={op.unit}
              value={draft.loader_bucket_m3}
              min={0.05}
              max={20}
              step={0.1}
              onChange={(v) => set({ loader_bucket_m3: v })}
            />
            <NumField
              label="Biaya sewa"
              unit={`ribu ${draft.cost_currency || "Rp"}/jam`}
              value={(draft.cost_loader_per_hour ?? 0) / 1000}
              min={0}
              max={50_000}
              step={10}
              onChange={(v) => set({ cost_loader_per_hour: v * 1000 })}
            />
            {draft.cost_all_in ? (
              <NumField
                label="Biaya operator"
                unit={`ribu ${draft.cost_currency || "Rp"}/jam`}
                value={(draft.cost_loader_operator_per_hour ?? 0) / 1000}
                min={0}
                max={50_000}
                step={10}
                onChange={(v) => set({ cost_loader_operator_per_hour: v * 1000 })}
              />
            ) : null}
            <NumField
              label="Solar kerja"
              unit="L/jam"
              value={draft.fuel_loader_work_lph ?? 0}
              min={0}
              max={80}
              step={0.1}
              onChange={(v) =>
                setFuel(
                  "fuel_loader_work_lph",
                  "fuel_loader_idle_lph",
                  "emission_loader_work_kg_per_h",
                  "emission_loader_idle_kg_per_h",
                  "work",
                  v,
                )
              }
            />
            <NumField
              label="Solar idle"
              unit="L/jam"
              value={draft.fuel_loader_idle_lph ?? 0}
              min={0}
              max={40}
              step={0.1}
              onChange={(v) =>
                setFuel(
                  "fuel_loader_work_lph",
                  "fuel_loader_idle_lph",
                  "emission_loader_work_kg_per_h",
                  "emission_loader_idle_kg_per_h",
                  "idle",
                  v,
                )
              }
            />
            <p className="text-[11px] text-muted-foreground">
              EF kerja ≈{" "}
              <span className="font-mono">
                {(draft.emission_loader_work_kg_per_h ?? 0).toFixed(1)}
              </span>{" "}
              kg CO₂e/jam (×{DIESEL_KG_CO2_PER_L})
            </p>
          </ResourceCard>

          <ResourceCard title={op.haulerLabel}>
            <Field label="Jumlah unit" value={`${draft.num_haulers}`}>
              <Slider
                min={1}
                max={40}
                step={1}
                value={[draft.num_haulers]}
                onValueChange={([v]) => set({ num_haulers: v })}
              />
            </Field>
            <NumField
              label={op.haulerCapacityLabel}
              unit={op.unit}
              value={draft.hauler_capacity_m3}
              min={0.05}
              max={40}
              step={0.1}
              onChange={(v) =>
                set({ hauler_capacity_m3: v, payload_per_trip: v })
              }
            />
            <NumField
              label="Biaya sewa"
              unit={`ribu ${draft.cost_currency || "Rp"}/jam`}
              value={(draft.cost_hauler_per_hour ?? 0) / 1000}
              min={0}
              max={50_000}
              step={10}
              onChange={(v) => set({ cost_hauler_per_hour: v * 1000 })}
            />
            {draft.cost_all_in ? (
              <NumField
                label="Biaya operator"
                unit={`ribu ${draft.cost_currency || "Rp"}/jam`}
                value={(draft.cost_hauler_operator_per_hour ?? 0) / 1000}
                min={0}
                max={50_000}
                step={10}
                onChange={(v) => set({ cost_hauler_operator_per_hour: v * 1000 })}
              />
            ) : null}
            <NumField
              label="Solar kerja"
              unit="L/jam"
              value={draft.fuel_hauler_work_lph ?? 0}
              min={0}
              max={80}
              step={0.1}
              onChange={(v) =>
                setFuel(
                  "fuel_hauler_work_lph",
                  "fuel_hauler_idle_lph",
                  "emission_hauler_work_kg_per_h",
                  "emission_hauler_idle_kg_per_h",
                  "work",
                  v,
                )
              }
            />
            <NumField
              label="Solar idle/antri"
              unit="L/jam"
              value={draft.fuel_hauler_idle_lph ?? 0}
              min={0}
              max={40}
              step={0.1}
              onChange={(v) =>
                setFuel(
                  "fuel_hauler_work_lph",
                  "fuel_hauler_idle_lph",
                  "emission_hauler_work_kg_per_h",
                  "emission_hauler_idle_kg_per_h",
                  "idle",
                  v,
                )
              }
            />
            <p className="text-[11px] text-muted-foreground">
              EF kerja ≈{" "}
              <span className="font-mono">
                {(draft.emission_hauler_work_kg_per_h ?? 0).toFixed(1)}
              </span>{" "}
              kg CO₂e/jam
            </p>
          </ResourceCard>
        </div>

        <p className="text-xs text-muted-foreground">
          Volume per trip = kapasitas {op.haulerLabel.toLowerCase()} (
          <span className="font-mono tabular-nums">{draft.hauler_capacity_m3}</span>{" "}
          {op.unit})
          {bucketsPerLoad > 0 ? (
            <>
              {" "}
              · rasio kapasitas ≈{" "}
              <span className="font-mono tabular-nums">{bucketsPerLoad.toFixed(1)}</span>
            </>
          ) : null}
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Tugas (cycle time)</h3>
          <p className="text-xs text-muted-foreground">
            Mean dalam <strong className="text-foreground">menit</strong>, plus distribusi per
            tugas.
          </p>
        </div>
        <div className="space-y-3">
          {TASK_META.map((task) => {
            const mean = draft[task.meanKey] as number;
            const dist = ensureDist(draft, task.key, mean);
            return (
              <div
                key={task.key}
                className="rounded-[var(--radius-lg)] border border-border bg-card/40 p-3 sm:p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{taskLabel(task.key)}</p>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    μ = {mean} mnt
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_minmax(140px,180px)] sm:items-end">
                  <Field label="Mean (menit)" value={`${mean}`}>
                    <Slider
                      min={0.5}
                      max={task.maxMean}
                      step={0.5}
                      value={[mean]}
                      onValueChange={([v]) => setTaskMean(task, v)}
                    />
                  </Field>
                  <div className="space-y-1.5">
                    <Label>Distribusi</Label>
                    <Select
                      value={dist.kind}
                      onValueChange={(v) => setTaskDistKind(task, v as DistKind)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIST_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {DIST_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {dist.kind !== "constant" && dist.kind !== "beta" && dist.kind !== "exponential" ? (
                  <div className="mt-3">
                    <Field label="CV (std/mean)" value={dist.cv.toFixed(2)}>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[dist.cv]}
                        onValueChange={([v]) => setTaskCv(task, v)}
                      />
                    </Field>
                  </div>
                ) : null}
                {dist.kind === "beta" ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <NumField
                      label="Min"
                      unit="mnt"
                      value={dist.min_bound}
                      min={0.05}
                      max={dist.max_bound - 0.05}
                      step={0.1}
                      onChange={(v) => setTaskBeta(task, { min_bound: v })}
                    />
                    <NumField
                      label="Max"
                      unit="mnt"
                      value={dist.max_bound}
                      min={dist.min_bound + 0.05}
                      max={120}
                      step={0.1}
                      onChange={(v) => setTaskBeta(task, { max_bound: v })}
                    />
                    <NumField
                      label="α"
                      value={dist.alpha}
                      min={0.1}
                      max={20}
                      step={0.1}
                      onChange={(v) => setTaskBeta(task, { alpha: v })}
                    />
                    <NumField
                      label="β"
                      value={dist.beta_shape}
                      min={0.1}
                      max={20}
                      step={0.1}
                      onChange={(v) => setTaskBeta(task, { beta_shape: v })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Setup simulasi</h3>
          <p className="text-xs text-muted-foreground">
            Berhenti saat target siklus atau target pekerjaan tercapai dulu.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField
            label="Target siklus"
            value={draft.target_cycles || 50}
            min={0}
            max={400}
            step={1}
            onChange={(v) =>
              set({ target_cycles: Math.max(0, Math.floor(v)), stop_mode: "either" })
            }
          />
          <NumField
            label="Target pekerjaan"
            unit={op.unit}
            value={draft.target_volume ?? 100}
            min={0}
            max={20000}
            step={1}
            onChange={(v) => set({ target_volume: Math.max(0, v), stop_mode: "either" })}
          />
          <NumField
            label="Seed"
            value={draft.seed ?? 12345}
            min={0}
            max={999999}
            step={1}
            onChange={(v) => set({ seed: Math.max(0, Math.floor(v)) })}
          />
        </div>
      </section>
    </div>
  );
}

function rebuildDist(base: DurationDist, kind: DistKind, cv: number): DurationDist {
  if (kind === "constant") return makeDist({ kind: "constant", mean: base.mean, cv: 0 });
  if (kind === "beta") {
    const spread = 0.4;
    return makeDist({
      kind: "beta",
      mean: base.mean,
      cv,
      min_bound:
        base.min_bound > 0 ? base.min_bound : Math.max(0.05, base.mean * (1 - spread)),
      max_bound:
        base.max_bound > base.min_bound
          ? base.max_bound
          : Math.max(0.15, base.mean * (1 + spread)),
      alpha: base.alpha > 0 ? base.alpha : 2,
      beta_shape: base.beta_shape > 0 ? base.beta_shape : 5,
    });
  }
  return fromMeanCv(base.mean, cv, kind);
}

function ResourceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border p-3 sm:p-4">
      <p className="text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}

function NumField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {unit ? (
          <span className="ml-1 font-normal text-muted-foreground">({unit})</span>
        ) : null}
      </Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </div>
  );
}
