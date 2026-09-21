import { useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  applyPrecastToConfig,
  precastDefaults,
  precastTheoreticalThroughput,
  type PrecastFields,
} from "@/lib/simkon/precastEngine";
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
const DEFAULT_CV = 0.15;

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

type MeanKey = "prepare_mean" | "pour_mean" | "cure_mean" | "strip_mean" | "clean_mean";
type DistKey = "prepare_dist" | "pour_dist" | "cure_dist" | "strip_dist" | "clean_dist";

const TASKS: { label: string; hint: string; meanKey: MeanKey; distKey: DistKey; max: number }[] = [
  { label: "1 · Prepare / set form", hint: "Crew menyiapkan form & tulangan", meanKey: "prepare_mean", distKey: "prepare_dist", max: 180 },
  { label: "2 · Pour", hint: "Crew + crane menuang beton ke form", meanKey: "pour_mean", distKey: "pour_dist", max: 120 },
  { label: "3 · Cure", hint: "Elemen di slot curing (bisa 12 jam)", meanKey: "cure_mean", distKey: "cure_dist", max: 1440 },
  { label: "4 · Strip", hint: "Crew + crane mengangkat elemen dari form", meanKey: "strip_mean", distKey: "strip_dist", max: 120 },
  { label: "5 · Clean form", hint: "Crew membersihkan form untuk siklus berikutnya", meanKey: "clean_mean", distKey: "clean_dist", max: 60 },
];

function runPrecast(fields: PrecastFields, seed: number, targetCycles: number, targetVolume: number) {
  const base = defaultConfig("precast_plant");
  return runSimulation(
    applyPrecastToConfig(
      {
        ...base,
        seed,
        target_cycles: targetCycles,
        target_volume: targetVolume,
        stop_mode: "either",
        simulation_duration: 14 * 24 * 60,
      },
      fields,
    ),
  );
}

export function PrecastPlantPanel() {
  const [fields, setFields] = useState<PrecastFields>(() => precastDefaults());
  const [seed, setSeed] = useState(12345);
  const [targetCycles, setTargetCycles] = useState(20);
  const [targetVolume, setTargetVolume] = useState(50);
  const [result, setResult] = useState<SimulationResult | null>(() =>
    runPrecast(precastDefaults(), 12345, 20, 50),
  );
  const [running, setRunning] = useState(false);

  const thr = useMemo(() => precastTheoreticalThroughput(fields), [fields]);

  const patch = (p: Partial<PrecastFields>) => setFields((f) => ({ ...f, ...p }));

  const setMean = (key: MeanKey, distKey: DistKey, mean: number) => {
    setFields((f) => {
      const prev = (f[distKey] as DurationDist | null | undefined) ?? fromMeanCv(mean, DEFAULT_CV, "normal");
      return { ...f, [key]: mean, [distKey]: { ...prev, mean } };
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
        setResult(runPrecast(fields, seed, targetCycles, targetVolume));
        trackSimulation("precast_plant");

        requestAnimationFrame(() => {
          document.getElementById("hasil-precast")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } finally {
        setRunning(false);
      }
    });
  };

  const reset = () => {
    setFields(precastDefaults());
    setSeed(12345);
    setTargetCycles(20);
    setTargetVolume(50);
    setResult(runPrecast(precastDefaults(), 12345, 20, 50));

  };

  return (
    <div className="space-y-6">
      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Model precast plant</CardTitle>
          <CardDescription>
            Form cycle: prepare → pour (crane) → cure (slot terbatas) → strip (crane) → clean.
            Prioritas dispatch: strip → pour → clean → prepare. Teori thr ≈ {formatNum(thr, 2)} m³/jam
            ({formatNum(thr / Math.max(fields.element_volume_m3, 0.1), 2)} elemen/jam).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Jumlah form" value={fields.num_forms} min={1} max={20} onChange={(v) => patch({ num_forms: Math.round(v) })} />
          <Field label="Crew (regu)" value={fields.num_crews} min={1} max={8} onChange={(v) => patch({ num_crews: Math.round(v) })} />
          <Field label="Cure slots" value={fields.num_cure_slots} min={1} max={30} onChange={(v) => patch({ num_cure_slots: Math.round(v) })} />
          <Field label="Crane pabrik" value={fields.num_cranes} min={1} max={3} onChange={(v) => patch({ num_cranes: Math.round(v) })} />
          <Field label="Volume elemen" unit="m³" value={fields.element_volume_m3} min={0.2} max={20} step={0.1} onChange={(v) => patch({ element_volume_m3: v })} />
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tugas (task) · mean + distribusi</CardTitle>
          <CardDescription>Cure default 720 mnt (12 jam) — turunkan untuk demo cepat di kelas.</CardDescription>
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
                <Field label="Mean" unit="mnt" value={mean} min={0.5} max={task.max} step={0.5} onChange={(v) => setMean(task.meanKey, task.distKey, v)} />
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
          <CardTitle className="text-base">Biaya · target · seed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Crew" unit="ribu Rp/jam" value={fields.cost_crew_per_hour / 1000} min={0} max={1000} step={5} onChange={(v) => patch({ cost_crew_per_hour: v * 1000 })} />
          <Field label="Crane" unit="ribu Rp/jam" value={fields.cost_crane_per_hour / 1000} min={0} max={2000} step={10} onChange={(v) => patch({ cost_crane_per_hour: v * 1000 })} />
          <Field label="Form (amort.)" unit="ribu Rp/jam" value={fields.cost_form_per_hour / 1000} min={0} max={200} step={1} onChange={(v) => patch({ cost_form_per_hour: v * 1000 })} />
          <Field label="Cure space" unit="ribu Rp/jam" value={fields.cost_cure_per_hour / 1000} min={0} max={200} step={1} onChange={(v) => patch({ cost_cure_per_hour: v * 1000 })} />
          <Field label="Target elemen (siklus)" value={targetCycles} min={0} max={400} onChange={setTargetCycles} />
          <Field label="Target volume" unit="m³" value={targetVolume} min={0} max={5000} step={5} onChange={setTargetVolume} />
          <Field label="Seed" value={seed} min={1} max={999999} onChange={(v) => setSeed(Math.round(v))} />
        </CardContent>
        <CardContent className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="Teori thr" value={`${formatNum(thr, 2)} m³/j`} />
            <MetricCard label="Form" value={String(fields.num_forms)} />
            <MetricCard label="Cure slots" value={String(fields.num_cure_slots)} />
            <MetricCard label="Crew" value={String(fields.num_crews)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" />Reset</Button>
            <Button type="button" size="lg" onClick={run} disabled={running}>
              <Play className="h-4 w-4" />{running ? "Menjalankan…" : "Jalankan simulasi"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div id="hasil-precast">{result ? <ResultsPanel result={result} /> : null}</div>
    </div>
  );
}
