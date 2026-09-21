import { useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  applyBrickToConfig,
  brickDefaults,
  brickTheoreticalThroughput,
  type BrickConfigFields,
} from "@/lib/simkon/brickEngine";
import {
  DIST_LABELS,
  defaultConfig,
  fromMeanCv,
  runSimulation,
  type DistKind,
  type DurationDist,
  type SimulationResult,
} from "@/lib/simkon/engine";
import { ResultsPanel } from "@/components/simkon/ResultsPanel";
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
const DEFAULT_CV = 0.2;
const DEFAULT_KIND: DistKind = "normal";

type DistKey = "fetch_dist" | "lift_dist" | "mortar_dist" | "lay_dist";
type MeanKey = "fetch_mean" | "lift_mean" | "mortar_mean" | "lay_mean";

type TaskDef = {
  label: string;
  hint: string;
  meanKey: MeanKey;
  distKey: DistKey;
  maxMean: number;
};

const TASKS: TaskDef[] = [
  {
    label: "A · Helper fetch (pile jauh)",
    hint: "Satu durasi full trip: ke pile jauh → bawa batch → temp stock",
    meanKey: "fetch_mean",
    distKey: "fetch_dist",
    maxMean: 40,
  },
  {
    label: "B · Helper lift bata ke scaffold",
    hint: "Satu durasi full trip: ambil batch di temp → naik → taruh slot scaffold → turun",
    meanKey: "lift_mean",
    distKey: "lift_dist",
    maxMean: 30,
  },
  {
    label: "B′ · Helper supply mortar",
    hint: "Satu durasi full trip: ambil ember (tim mortar ready) → scaffold → taruh → return",
    meanKey: "mortar_mean",
    distKey: "mortar_dist",
    maxMean: 30,
  },
  {
    label: "C · Tukang pasang bata",
    hint: "Satu durasi per siklus pasang (butuh bata + mortar di scaffold)",
    meanKey: "lay_mean",
    distKey: "lay_dist",
    maxMean: 20,
  },
];

function rebuildDist(base: DurationDist, kind: DistKind, cv: number): DurationDist {
  if (kind === "constant") return { ...base, kind: "constant", mean: base.mean, cv: 0 };
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

function ensureDist(f: BrickConfigFields, distKey: DistKey, mean: number): DurationDist {
  const existing = f[distKey];
  if (existing) return { ...existing, mean };
  return fromMeanCv(mean, DEFAULT_CV, DEFAULT_KIND);
}

function withDefaultDists(base: BrickConfigFields): BrickConfigFields {
  const next = { ...base };
  for (const t of TASKS) {
    const mean = next[t.meanKey];
    if (!next[t.distKey]) {
      next[t.distKey] = fromMeanCv(mean, DEFAULT_CV, DEFAULT_KIND);
    }
  }
  return next;
}

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

export function BricklayingPanel() {
  const [f, setF] = useState<BrickConfigFields>(() => withDefaultDists(brickDefaults()));
  const [seed, setSeed] = useState(12345);
  const [targetVolume, setTargetVolume] = useState(10);
  const [targetCycles, setTargetCycles] = useState(200);
  const [costMason, setCostMason] = useState(25_000);
  const [costHelper, setCostHelper] = useState(18_000);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const patch = (p: Partial<BrickConfigFields>) => setF((prev) => ({ ...prev, ...p }));

  const caps = useMemo(() => {
    const batch = f.batch_bricks;
    return {
      tempMax: f.temp_slots * batch,
      scafMax: f.scaffold_slots * batch,
      mortarBricks: f.mortar_buckets_max * f.mortar_covers_bricks,
    };
  }, [f]);

  const theory = useMemo(() => {
    const base = applyBrickToConfig(defaultConfig("bricklaying"), f);
    return brickTheoreticalThroughput(base);
  }, [f]);

  const run = () => {
    setRunning(true);
    requestAnimationFrame(() => {
      try {
        const base = defaultConfig("bricklaying");
        const cfg = applyBrickToConfig(
          {
            ...base,
            seed,
            target_volume: targetVolume,
            target_cycles: targetCycles,
            stop_mode: "either",
            cost_loader_per_hour: costMason,
            cost_hauler_per_hour: costHelper,
            cost_all_in: true,
          },
          f,
        );
        setResult(runSimulation(cfg));
        trackSimulation("bricklaying");
      } finally {
        setRunning(false);
      }
    });
  };

  const reset = () => {
    setF(withDefaultDists(brickDefaults()));
    setSeed(12345);
    setTargetVolume(10);
    setTargetCycles(200);
    setCostMason(25_000);
    setCostHelper(18_000);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bricklaying · 4 tugas sederhana</CardTitle>
          <CardDescription className="leading-relaxed">
            Default: <strong className="text-foreground">1 helper</strong>,{" "}
            <strong className="text-foreground">2 tukang</strong>, scaffold{" "}
            <strong className="text-foreground">{f.scaffold_slots} slot bata</strong> +{" "}
            <strong className="text-foreground">{f.mortar_buckets_max} ember mortar</strong>.
            Tiap tugas = <strong className="text-foreground">1 mean + distribusi</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted/20">
            <img
              src="/illustrations/bricklaying-cycle.jpg"
              alt="Bricklaying"
              className="mx-auto max-h-64 w-full object-contain object-center p-2 sm:max-h-80"
            />
          </figure>

          <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-muted/15 p-3 sm:p-4">
            <p className="text-sm font-medium">Resources & kapasitas</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Helper" value={f.num_helpers} min={1} max={20} onChange={(v) => patch({ num_helpers: Math.floor(v) })} />
              <Field label="Tukang" value={f.num_masons} min={1} max={12} onChange={(v) => patch({ num_masons: Math.floor(v) })} />
              <Field label="Batch angkat" unit="bata" value={f.batch_bricks} min={5} max={50} onChange={(v) => patch({ batch_bricks: Math.floor(v) })} />
              <Field label="Space bata scaffold" unit="slot" value={f.scaffold_slots} min={1} max={8} onChange={(v) => patch({ scaffold_slots: Math.floor(v) })} />
              <Field label="Space ember mortar" unit="ember" value={f.mortar_buckets_max} min={1} max={10} onChange={(v) => patch({ mortar_buckets_max: Math.floor(v) })} />
              <Field label="Slot temp ground" value={f.temp_slots} min={1} max={30} onChange={(v) => patch({ temp_slots: Math.floor(v) })} />
              <Field label="Threshold fetch jauh" unit="bata sisa" value={f.temp_refill_threshold} min={0} max={500} onChange={(v) => patch({ temp_refill_threshold: Math.floor(v) })} />
              <Field label="1 ember =" unit="bata" value={f.mortar_covers_bricks} min={5} max={100} onChange={(v) => patch({ mortar_covers_bricks: Math.floor(v) })} />
              <Field label="Bata per m²" value={f.bricks_per_m2} min={20} max={120} onChange={(v) => patch({ bricks_per_m2: Math.floor(v) })} />
              <Field label="Bata / siklus tukang" value={f.lay_bricks_per_cycle} min={1} max={10} onChange={(v) => patch({ lay_bricks_per_cycle: Math.floor(v) })} />
              <Field label="Upah tukang" unit="ribu Rp/jam" value={costMason / 1000} min={0} max={200} step={1} onChange={(v) => setCostMason(v * 1000)} />
              <Field label="Upah helper" unit="ribu Rp/jam" value={costHelper / 1000} min={0} max={200} step={1} onChange={(v) => setCostHelper(v * 1000)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Max temp {caps.tempMax} · scaffold {caps.scafMax} bata · mortar ≈ {caps.mortarBricks} bata
              ekuiv. Upah default mid-ID 2026: tukang 25 rb/jam · helper 18 rb/jam.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Tugas (mean + distribusi)</p>
            {TASKS.map((task) => {
              const mean = f[task.meanKey];
              const dist = ensureDist(f, task.distKey, mean);
              return (
                <div
                  key={task.meanKey}
                  className="space-y-3 rounded-[var(--radius-lg)] border border-border p-3 sm:p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="text-[11px] text-muted-foreground">{task.hint}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Mean (menit)</Label>
                      <Input
                        type="number"
                        className="h-9 tabular-nums"
                        min={0.1}
                        max={task.maxMean}
                        step={0.1}
                        value={mean}
                        onChange={(e) => {
                          const m = Math.max(0.1, Number(e.target.value) || 0.1);
                          const d = ensureDist(f, task.distKey, m);
                          patch({
                            [task.meanKey]: m,
                            [task.distKey]: rebuildDist({ ...d, mean: m }, d.kind, d.cv),
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Distribusi</Label>
                      <Select
                        value={dist.kind}
                        onValueChange={(kind) => {
                          const k = kind as DistKind;
                          const cv = k === "constant" ? 0 : dist.cv > 0 ? dist.cv : DEFAULT_CV;
                          patch({
                            [task.distKey]: rebuildDist({ ...dist, mean, kind: k, cv }, k, cv),
                          });
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
                    {dist.kind !== "constant" && dist.kind !== "beta" ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          CV (std/mean) · {dist.cv.toFixed(2)}
                        </Label>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[dist.cv]}
                          onValueChange={([cv]) => {
                            patch({
                              [task.distKey]: rebuildDist({ ...dist, mean, cv }, dist.kind, cv),
                            });
                          }}
                        />
                      </div>
                    ) : null}
                    {dist.kind === "beta" ? (
                      <>
                        <Field
                          label="Min bound"
                          value={dist.min_bound ?? mean * 0.5}
                          min={0.05}
                          max={(dist.max_bound ?? mean * 1.5) - 0.05}
                          step={0.05}
                          onChange={(v) =>
                            patch({
                              [task.distKey]: { ...dist, mean, kind: "beta", min_bound: v },
                            })
                          }
                        />
                        <Field
                          label="Max bound"
                          value={dist.max_bound ?? mean * 1.5}
                          min={(dist.min_bound ?? mean * 0.5) + 0.05}
                          max={task.maxMean * 2}
                          step={0.05}
                          onChange={(v) =>
                            patch({
                              [task.distKey]: { ...dist, mean, kind: "beta", max_bound: v },
                            })
                          }
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Target dinding" unit="m²" value={targetVolume} min={1} max={500} onChange={setTargetVolume} />
            <Field label="Target siklus tukang" value={targetCycles} min={1} max={400} onChange={(v) => setTargetCycles(Math.floor(v))} />
            <Field label="Seed" value={seed} min={1} step={1} onChange={(v) => setSeed(Math.floor(v))} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Teori fetch" value={`${formatNum(theory.fetch, 1)} m²/jam`} />
            <MetricCard label="Teori lift" value={`${formatNum(theory.lift, 1)} m²/jam`} />
            <MetricCard label="Teori mortar" value={`${formatNum(theory.mortar, 1)} m²/jam`} />
            <MetricCard label="Teori tukang" value={`${formatNum(theory.lay, 1)} m²/jam`} />
            <MetricCard label="Teori sistem" value={`${formatNum(theory.system, 1)} m²/jam`} />
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
          </div>
        </CardContent>
      </Card>

      {result ? <ResultsPanel result={result} /> : null}
    </div>
  );
}
