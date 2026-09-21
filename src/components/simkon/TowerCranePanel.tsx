import { useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  applyTowerCraneToConfig,
  defaultFronts,
  towerCraneDefaults,
  towerCraneTheory,
  type CraneFront,
  type TowerCraneFields,
  runTowerCraneSimulation,
} from "@/lib/simkon/towerCraneEngine";
import {
  DIST_LABELS,
  defaultConfig,
  fromMeanCv,
  type DistKind,
  type DurationDist,
  type SimulationResult,
} from "@/lib/simkon/engine";
import { TowerCraneResults, type TowerFrontStat } from "@/components/simkon/TowerCraneResults";
import { MetricCard } from "@/components/simkon/MetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNum } from "@/lib/utils";
import { trackSimulation } from "@/lib/simkon/usageClient";

const DIST_KEYS = Object.keys(DIST_LABELS) as DistKind[];

function Field({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {unit ? ` (${unit})` : ""}
      </Label>
      <Input
        type="number"
        className="h-9 tabular-nums"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          let v = n;
          if (min != null) v = Math.max(min, v);
          if (max != null) v = Math.min(max, v);
          onChange(v);
        }}
      />
    </div>
  );
}

function rebuildDist(base: DurationDist, kind: DistKind, cv: number): DurationDist {
  if (kind === "constant") return { ...base, kind: "constant", mean: base.mean, cv: 0 };
  if (kind === "exponential") return fromMeanCv(base.mean, 1, "exponential");
  if (kind === "beta") {
    return {
      ...base,
      kind: "beta",
      mean: base.mean,
      cv,
      alpha: base.alpha ?? 2,
      beta_shape: base.beta_shape ?? 2,
      min_bound: base.min_bound ?? Math.max(0.05, base.mean * 0.5),
      max_bound: base.max_bound ?? base.mean * 1.5,
    };
  }
  return fromMeanCv(base.mean, cv, kind);
}

function ensureDist(
  dist: DurationDist | null | undefined,
  mean: number,
  fallbackKind: DistKind,
): DurationDist {
  if (dist) return { ...dist, mean };
  return fromMeanCv(mean, fallbackKind === "exponential" ? 1 : 0.2, fallbackKind);
}

type ResultExtra = SimulationResult & {
  front_stats?: TowerFrontStat[];
};

function DistRow({
  label,
  hint,
  mean,
  dist,
  maxMean,
  defaultKind,
  onChange,
}: {
  label: string;
  hint: string;
  mean: number;
  dist: DurationDist;
  maxMean: number;
  defaultKind: DistKind;
  onChange: (mean: number, dist: DurationDist) => void;
}) {
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-border/70 bg-muted/10 p-3">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mean (menit)</Label>
          <Input
            type="number"
            className="h-9 tabular-nums"
            min={0.5}
            max={maxMean}
            step={0.1}
            value={mean}
            onChange={(e) => {
              const m = Math.max(0.5, Number(e.target.value) || 0.5);
              onChange(m, rebuildDist({ ...dist, mean: m }, dist.kind, dist.cv));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Distribusi</Label>
          <Select
            value={dist.kind}
            onValueChange={(kind) => {
              const k = kind as DistKind;
              const cv = k === "exponential" ? 1 : k === "constant" ? 0 : dist.cv > 0 ? dist.cv : 0.2;
              onChange(mean, rebuildDist({ ...dist, mean, kind: k, cv }, k, cv));
            }}
          >
            <SelectTrigger className="h-9">
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
        {dist.kind !== "constant" && dist.kind !== "beta" && dist.kind !== "exponential" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">
              CV · {dist.cv.toFixed(2)}
            </Label>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[dist.cv]}
              onValueChange={([cv]) =>
                onChange(mean, rebuildDist({ ...dist, mean, cv }, dist.kind, cv))
              }
            />
          </div>
        ) : null}
        {dist.kind === "exponential" ? (
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Poisson process: inter-arrival ~ Exp(mean). CV tetap 1. Rate λ = 1/mean ≈{" "}
            {formatNum(60 / Math.max(0.5, mean), 1)} permintaan/jam.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TowerCranePanel() {
  const [fields, setFields] = useState<TowerCraneFields>(() => towerCraneDefaults());
  const [seed, setSeed] = useState(12345);
  const [maxHours, setMaxHours] = useState(8);
  const [costCrane, setCostCrane] = useState(500_000);
  const [costOp, setCostOp] = useState(150_000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResultExtra | null>(null);

  const patchFront = (id: number, p: Partial<CraneFront>) => {
    setFields((prev) => ({
      ...prev,
      fronts: prev.fronts.map((f) => (f.id === id ? { ...f, ...p } : f)),
    }));
  };

  const theory = useMemo(() => towerCraneTheory(fields), [fields]);

  const run = () => {
    setRunning(true);
    requestAnimationFrame(() => {
      try {
        const base = defaultConfig("tower_crane");
        const minutes = Math.max(15, maxHours * 60);
        const cfg = applyTowerCraneToConfig(
          {
            ...base,
            seed,
            simulation_duration: minutes,
            target_volume: 0,
            target_cycles: 0,
            stop_mode: "either",
            cost_loader_per_hour: costCrane,
            cost_loader_operator_per_hour: costOp,
            cost_all_in: true,
          },
          fields,
        );
        setResult(runTowerCraneSimulation(cfg));
        trackSimulation("tower_crane");
      } finally {
        setRunning(false);
      }
    });
  };

  const reset = () => {
    setFields(towerCraneDefaults());
    setSeed(12345);
    setMaxHours(8);
    setCostCrane(500_000);
    setCostOp(150_000);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tower crane · Poisson request + service</CardTitle>
          <CardDescription className="leading-relaxed">
            Crane = <strong className="text-foreground">single server</strong>. Tiap front
            menghasilkan <strong className="text-foreground">permintaan berulang</strong>{" "}
            (default proses Poisson / Exp). Saat dilayani:{" "}
            <strong className="text-foreground">satu durasi service</strong> (mean +
            distribusi) karena lokasi front berbeda. Antrian prioritas 1→9, non-preemptive.
            Stop: <strong className="text-foreground">waktu operasi maks</strong> (default 8 jam).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted/20">
            <img
              src="/illustrations/tower-crane-multi-front.jpg"
              alt="Tower crane: yard vs fronts"
              className="mx-auto max-h-64 w-full object-contain object-center p-2 sm:max-h-80"
            />
            <figcaption className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              Yard → crane (server) → Front A/B/C. Request Poisson per front; service 1
              durasi per lift.
            </figcaption>
          </figure>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Jumlah tower crane"
              value={fields.num_cranes}
              min={1}
              max={2}
              step={1}
              onChange={(v) =>
                setFields((p) => ({ ...p, num_cranes: Math.floor(v) as 1 | 2 }))
              }
            />
            <Field
              label="Waktu operasi maks"
              unit="jam"
              value={maxHours}
              min={0.5}
              max={24}
              step={0.5}
              onChange={setMaxHours}
            />
            <Field
              label="Sewa crane"
              unit="ribu Rp/jam"
              value={costCrane / 1000}
              min={0}
              max={5000}
              step={10}
              onChange={(v) => setCostCrane(v * 1000)}
            />
            <Field
              label="Operator crane"
              unit="ribu Rp/jam"
              value={costOp / 1000}
              min={0}
              max={1000}
              step={5}
              onChange={(v) => setCostOp(v * 1000)}
            />
            <Field label="Seed" value={seed} min={1} step={1} onChange={(v) => setSeed(Math.floor(v))} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Demand front (teori)"
              value={`${formatNum(theory.demand, 1)} unit/jam`}
              hint="Σ (60/E[inter-arrival]) × vol"
            />
            <MetricCard
              label="Kapasitas crane (teori)"
              value={`${formatNum(theory.crane_cap, 1)} unit/jam`}
              hint="n_crane × 60/E[service] × vol"
            />
            <MetricCard
              label="Util teori demand/cap"
              value={`${formatNum(theory.util_theory * 100, 0)}%`}
              hint=">100% = overload teori"
            />
            <MetricCard
              label="Front aktif"
              value={`${fields.fronts.filter((x) => x.enabled).length} / 5`}
              hint="Prioritas 1 = paling penting"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Work fronts (max 5)</p>
            {fields.fronts.map((fr) => {
              const reqDist = ensureDist(fr.request_dist, fr.request_interval_mean, "exponential");
              const svcDist = ensureDist(fr.service_dist, fr.service_mean, "normal");
              return (
                <div
                  key={fr.id}
                  className={`space-y-3 rounded-[var(--radius-lg)] border p-3 sm:p-4 ${
                    fr.enabled
                      ? "border-border bg-card/40"
                      : "border-border/60 bg-muted/20 opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-primary)]"
                        checked={fr.enabled}
                        onChange={(e) => patchFront(fr.id, { enabled: e.target.checked })}
                      />
                      {fr.name}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Prio {fr.priority} · λ≈{formatNum(60 / fr.request_interval_mean, 1)}
                      /jam
                    </span>
                  </div>
                  {fr.enabled ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field
                          label="Prioritas (1=tinggi)"
                          value={fr.priority}
                          min={1}
                          max={9}
                          step={1}
                          onChange={(v) => patchFront(fr.id, { priority: Math.floor(v) })}
                        />
                        <Field
                          label="Volume / lift"
                          unit="unit"
                          value={fr.volume_per_lift}
                          min={0.1}
                          max={10}
                          step={0.1}
                          onChange={(v) => patchFront(fr.id, { volume_per_lift: v })}
                        />
                        <Field
                          label="Tarif crew front"
                          unit="ribu Rp/jam"
                          value={fr.crew_cost_per_hour / 1000}
                          min={0}
                          max={1000}
                          step={5}
                          onChange={(v) => patchFront(fr.id, { crew_cost_per_hour: v * 1000 })}
                        />
                      </div>
                      <DistRow
                        label="Permintaan (inter-arrival)"
                        hint="Default Eksponensial = proses Poisson. Mean = rata-rata menit antar permintaan."
                        mean={fr.request_interval_mean}
                        dist={reqDist}
                        maxMean={120}
                        defaultKind="exponential"
                        onChange={(mean, dist) =>
                          patchFront(fr.id, {
                            request_interval_mean: mean,
                            request_dist: dist,
                          })
                        }
                      />
                      <DistRow
                        label="Service crane (yard → front → return)"
                        hint="Satu durasi full trip. Beda front = beda mean (lokasi berbeda)."
                        mean={fr.service_mean}
                        dist={svcDist}
                        maxMean={60}
                        defaultKind="normal"
                        onChange={(mean, dist) =>
                          patchFront(fr.id, {
                            service_mean: mean,
                            service_dist: dist,
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={run} disabled={running}>
              <Play className="mr-1.5 h-4 w-4" />
              {running ? "Menghitung…" : "Jalankan simulasi"}
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reset default
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setFields((p) => ({
                  ...p,
                  fronts: defaultFronts().map((f) => ({ ...f, enabled: true })),
                }))
              }
            >
              Aktifkan 5 front
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? <TowerCraneResults result={result} /> : null}
    </div>
  );
}
