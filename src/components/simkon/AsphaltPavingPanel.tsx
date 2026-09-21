import { useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  applyAsphaltToConfig,
  asphaltDefaults,
  asphaltTheoreticalThroughput,
  type AsphaltFields,
} from "@/lib/simkon/asphaltEngine";
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

type MeanKey =
  | "plant_load_mean"
  | "haul_mean"
  | "dump_mean"
  | "return_mean"
  | "spread_mean"
  | "breakdown_mean"
  | "finish_mean";
type DistKey =
  | "plant_load_dist"
  | "haul_dist"
  | "dump_dist"
  | "return_dist"
  | "spread_dist"
  | "breakdown_dist"
  | "finish_dist";

const TASKS: { label: string; hint: string; meanKey: MeanKey; distKey: DistKey }[] = [
  { label: "A · Plant load", hint: "Truk diisi hot mix di plant", meanKey: "plant_load_mean", distKey: "plant_load_dist" },
  { label: "A · Haul", hint: "Plant → paver", meanKey: "haul_mean", distKey: "haul_dist" },
  { label: "A · Dump ke hopper", hint: "Tuangkan ke hopper paver", meanKey: "dump_mean", distKey: "dump_dist" },
  { label: "A · Return", hint: "Paver → plant", meanKey: "return_mean", distKey: "return_dist" },
  { label: "B · Spread (paver)", hint: "Paver menyebar 1 muatan truck", meanKey: "spread_mean", distKey: "spread_dist" },
  { label: "C · Breakdown roller", hint: "Compact section (setiap N spread)", meanKey: "breakdown_mean", distKey: "breakdown_dist" },
  { label: "D · Finish roller", hint: "Finish compact setelah breakdown", meanKey: "finish_mean", distKey: "finish_dist" },
];

function runAsphalt(fields: AsphaltFields, seed: number, targetCycles: number, targetVolume: number) {
  const base = defaultConfig("asphalt_paving");
  return runSimulation(
    applyAsphaltToConfig(
      {
        ...base,
        seed,
        target_cycles: targetCycles,
        target_volume: targetVolume,
        stop_mode: "either",
      },
      fields,
    ),
  );
}

export function AsphaltPavingPanel() {
  const [fields, setFields] = useState<AsphaltFields>(() => asphaltDefaults());
  const [seed, setSeed] = useState(12345);
  const [targetCycles, setTargetCycles] = useState(80);
  const [targetVolume, setTargetVolume] = useState(400);
  const [result, setResult] = useState<SimulationResult | null>(() =>
    runAsphalt(asphaltDefaults(), 12345, 80, 400),
  );
  const [running, setRunning] = useState(false);

  const thr = useMemo(() => asphaltTheoreticalThroughput(fields), [fields]);

  const patch = (p: Partial<AsphaltFields>) => setFields((f) => ({ ...f, ...p }));

  const setMean = (key: MeanKey, distKey: DistKey, mean: number) => {
    setFields((f) => {
      const prev = (f[distKey] as DurationDist | null | undefined) ?? fromMeanCv(mean, DEFAULT_CV, "normal");
      return {
        ...f,
        [key]: mean,
        [distKey]: { ...prev, mean },
      };
    });
  };

  const setDist = (distKey: DistKey, meanKey: MeanKey, kind: DistKind, cv: number) => {
    setFields((f) => {
      const mean = f[meanKey] as number;
      return { ...f, [distKey]: fromMeanCv(mean, kind === "constant" ? 0 : cv, kind) };
    });
  };

  const run = () => {
    setRunning(true);
    requestAnimationFrame(() => {
      try {
        setResult(runAsphalt(fields, seed, targetCycles, targetVolume));
        trackSimulation("asphalt_paving");
        requestAnimationFrame(() => {
          document.getElementById("hasil-asphalt")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } finally {
        setRunning(false);
      }
    });
  };

  const reset = () => {
    setFields(asphaltDefaults());
    setSeed(12345);
    setTargetCycles(80);
    setTargetVolume(400);
    setResult(runAsphalt(asphaltDefaults(), 12345, 80, 400));

  };

  return (
    <div className="space-y-6">
      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Model paving train</CardTitle>
          <CardDescription>
            Plant → truck → paver (hopper) → breakdown roller → finish roller. Produksi (m³) dihitung saat
            paver selesai spread. Teori thr ≈ {formatNum(thr, 1)} m³/jam.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dump truck" value={fields.num_trucks} min={1} max={40} onChange={(v) => patch({ num_trucks: Math.round(v) })} />
          <Field label="Paver" value={fields.num_pavers} min={1} max={3} onChange={(v) => patch({ num_pavers: Math.round(v) })} />
          <Field label="Breakdown roller" value={fields.num_breakdown} min={0} max={3} onChange={(v) => patch({ num_breakdown: Math.round(v) })} />
          <Field label="Finish roller" value={fields.num_finish} min={0} max={3} onChange={(v) => patch({ num_finish: Math.round(v) })} />
          <Field label="Plant bay" value={fields.plant_bays} min={1} max={3} onChange={(v) => patch({ plant_bays: Math.round(v) })} />
          <Field label="Hopper (muatan)" value={fields.hopper_loads} min={1} max={6} onChange={(v) => patch({ hopper_loads: Math.round(v) })} />
          <Field label="Kapasitas truck" unit="m³" value={fields.truck_capacity_m3} min={2} max={20} step={0.5} onChange={(v) => patch({ truck_capacity_m3: v })} />
          <Field label="Spread / breakdown" value={fields.spreads_per_breakdown} min={1} max={20} onChange={(v) => patch({ spreads_per_breakdown: Math.round(v) })} />
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tugas (task) · mean + distribusi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {TASKS.map((task) => {
            const mean = fields[task.meanKey] as number;
            const dist = (fields[task.distKey] as DurationDist | null | undefined) ?? fromMeanCv(mean, DEFAULT_CV, "normal");
            return (
              <div key={task.meanKey} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-3 sm:grid-cols-[1fr_100px_140px_80px]">
                <div>
                  <p className="text-sm font-medium">{task.label}</p>
                  <p className="text-xs text-muted-foreground">{task.hint}</p>
                </div>
                <Field label="Mean" unit="mnt" value={mean} min={0.1} max={60} step={0.1} onChange={(v) => setMean(task.meanKey, task.distKey, v)} />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Distribusi</Label>
                  <Select value={dist.kind} onValueChange={(k) => setDist(task.distKey, task.meanKey, k as DistKind, dist.cv || DEFAULT_CV)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DIST_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>{DIST_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="CV" value={dist.kind === "constant" || dist.kind === "exponential" ? (dist.kind === "exponential" ? 1 : 0) : dist.cv} min={0} max={1.5} step={0.05} onChange={(v) => setDist(task.distKey, task.meanKey, dist.kind, v)} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Biaya sewa (Rp/jam) · target · seed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Truck" unit="ribu Rp/jam" value={fields.cost_truck_per_hour / 1000} min={0} max={2000} step={10} onChange={(v) => patch({ cost_truck_per_hour: v * 1000 })} />
          <Field label="Paver" unit="ribu Rp/jam" value={fields.cost_paver_per_hour / 1000} min={0} max={5000} step={50} onChange={(v) => patch({ cost_paver_per_hour: v * 1000 })} />
          <Field label="Breakdown" unit="ribu Rp/jam" value={fields.cost_breakdown_per_hour / 1000} min={0} max={2000} step={10} onChange={(v) => patch({ cost_breakdown_per_hour: v * 1000 })} />
          <Field label="Finish roller" unit="ribu Rp/jam" value={fields.cost_finish_per_hour / 1000} min={0} max={2000} step={10} onChange={(v) => patch({ cost_finish_per_hour: v * 1000 })} />
          <Field label="Plant" unit="ribu Rp/jam" value={fields.cost_plant_per_hour / 1000} min={0} max={5000} step={50} onChange={(v) => patch({ cost_plant_per_hour: v * 1000 })} />
          <Field label="Target siklus" value={targetCycles} min={0} max={400} onChange={setTargetCycles} />
          <Field label="Target volume" unit="m³" value={targetVolume} min={0} max={20000} step={10} onChange={setTargetVolume} />
          <Field label="Seed" value={seed} min={1} max={999999} onChange={(v) => setSeed(Math.round(v))} />
        </CardContent>
        <CardContent className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Teori thr" value={`${formatNum(thr, 1)} m³/j`} />
            <MetricCard label="Truck" value={String(fields.num_trucks)} />
            <MetricCard label="Paver" value={String(fields.num_pavers)} />
            <MetricCard label="Hopper" value={`${fields.hopper_loads} load`} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button>
            <Button type="button" size="lg" onClick={run} disabled={running}>
              <Play className="h-4 w-4" />{running ? "Menjalankan…" : "Jalankan simulasi"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div id="hasil-asphalt">{result ? <ResultsPanel result={result} /> : null}</div>
    </div>
  );
}
