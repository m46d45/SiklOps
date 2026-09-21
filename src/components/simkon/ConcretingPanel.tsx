import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  DEFAULT_SITE,
  METHOD_PROFILES,
  PLACE_METHODS,
  buildConcretingConfig,
  compareAllMethods,
  derivePlaceCycle,
  type MethodCompareRow,
  type SiteScenario,
} from "@/lib/simkon/concretingScenario";
import type { PlacementMethod } from "@/lib/simkon/rmcEngine";
import {
  DIST_LABELS,
  fromMeanCv,
  makeDist,
  runSimulation,
  type DistKind,
  type DurationDist,
  type SimulationResult,
} from "@/lib/simkon/engine";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResultsPanel } from "@/components/simkon/ResultsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatNum } from "@/lib/utils";
import { trackSimulation } from "@/lib/simkon/usageClient";

function Field({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {unit ? <span className="ml-1 opacity-70">({unit})</span> : null}
      </Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9"
      />
    </div>
  );
}

const DIST_KEYS = Object.keys(DIST_LABELS) as DistKind[];

type TruckPhase = {
  key: "batch" | "haul" | "discharge" | "return";
  label: string;
  meanKey: keyof SiteScenario;
  distKey: "truck_batch_dist" | "truck_haul_dist" | "truck_discharge_dist" | "truck_return_dist";
  maxMean: number;
};

const TRUCK_PHASES: TruckPhase[] = [
  { key: "batch", label: "Batch (plant)", meanKey: "truck_batch_mean", distKey: "truck_batch_dist", maxMean: 30 },
  { key: "haul", label: "Haul to site", meanKey: "truck_haul_mean", distKey: "truck_haul_dist", maxMean: 120 },
  { key: "discharge", label: "Discharge to buffer", meanKey: "truck_discharge_mean", distKey: "truck_discharge_dist", maxMean: 30 },
  { key: "return", label: "Return to plant", meanKey: "truck_return_mean", distKey: "truck_return_dist", maxMean: 120 },
];

type PlacePhaseKey = "fill" | "travel" | "place" | "return";

type PlaceMeans = Record<PlacePhaseKey, number>;
type PlaceDists = Record<PlacePhaseKey, DurationDist>;

type PlacePhaseMeta = {
  key: PlacePhaseKey;
  label: string;
  maxMean: number;
};

const PLACE_PHASE_META: PlacePhaseMeta[] = [
  { key: "fill", label: "Fill from buffer", maxMean: 30 },
  { key: "travel", label: "Travel", maxMean: 60 },
  { key: "place", label: "Place", maxMean: 40 },
  { key: "return", label: "Return empty", maxMean: 60 },
];

const PLACE_TASK_LABELS: Record<PlacementMethod, Record<PlacePhaseKey, string>> = {
  dolly: {
    fill: "Fill buggy",
    travel: "Travel",
    place: "Place",
    return: "Return empty",
  },
  crane: {
    fill: "Fill bucket",
    travel: "Lift / swing",
    place: "Place",
    return: "Return bucket",
  },
  pump: {
    fill: "Charge hopper",
    travel: "Pump (line)",
    place: "Place",
    return: "Reset hose tip",
  },
};

function meansFromDerived(d: {
  fill_mean: number;
  travel_mean: number;
  place_mean: number;
  return_mean: number;
}): PlaceMeans {
  return {
    fill: d.fill_mean,
    travel: d.travel_mean,
    place: d.place_mean,
    return: d.return_mean,
  };
}

function distsFromMeans(means: PlaceMeans, cv = 0.2, kind: DistKind = "normal"): PlaceDists {
  return {
    fill: fromMeanCv(means.fill, cv, kind),
    travel: fromMeanCv(means.travel, cv, kind),
    place: fromMeanCv(means.place, cv, kind),
    return: fromMeanCv(means.return, cv, kind),
  };
}

function initPlaceState(distance_m: number, height_m: number, cv = 0.2, kind: DistKind = "normal") {
  const means = {} as Record<PlacementMethod, PlaceMeans>;
  const dists = {} as Record<PlacementMethod, PlaceDists>;
  for (const m of PLACE_METHODS) {
    const d = derivePlaceCycle(m, distance_m, height_m);
    means[m] = meansFromDerived(d);
    dists[m] = distsFromMeans(means[m], cv, kind);
  }
  return { means, dists };
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



export function ConcretingPanel() {
  const [site, setSite] = useState<SiteScenario>({ ...DEFAULT_SITE });
  const [method, setMethod] = useState<PlacementMethod>("dolly");
  const [numPlace, setNumPlace] = useState<Record<PlacementMethod, number>>({
    dolly: METHOD_PROFILES.dolly.num_place,
    crane: METHOD_PROFILES.crane.num_place,
    pump: METHOD_PROFILES.pump.num_place,
  });
  /** Sewa place equipment (Rp/jam) — tampil di UI sebagai ribu Rp/jam */
  const [placeCost, setPlaceCost] = useState<Record<PlacementMethod, number>>({
    dolly: METHOD_PROFILES.dolly.cost_place_per_hour,
    crane: METHOD_PROFILES.crane.cost_place_per_hour,
    pump: METHOD_PROFILES.pump.cost_place_per_hour,
  });
  const [placeOpCost, setPlaceOpCost] = useState<Record<PlacementMethod, number>>({
    dolly: METHOD_PROFILES.dolly.cost_place_op,
    crane: METHOD_PROFILES.crane.cost_place_op,
    pump: METHOD_PROFILES.pump.cost_place_op,
  });
  /** Sewa truck mixer shared (Rp/jam) */
  const [truckCost, setTruckCost] = useState(METHOD_PROFILES.dolly.cost_truck_per_hour);
  const [truckOpCost, setTruckOpCost] = useState(METHOD_PROFILES.dolly.cost_truck_op);
  const [placeCap, setPlaceCap] = useState<Record<PlacementMethod, number>>({
    dolly: METHOD_PROFILES.dolly.place_capacity_m3,
    crane: METHOD_PROFILES.crane.place_capacity_m3,
    pump: METHOD_PROFILES.pump.place_capacity_m3,
  });
  const [pumpRate, setPumpRate] = useState(
    METHOD_PROFILES.pump.pump_rate_m3_per_h ?? 30,
  );
  const initP = initPlaceState(DEFAULT_SITE.distance_m, DEFAULT_SITE.height_m, DEFAULT_SITE.cv, DEFAULT_SITE.default_dist_kind);
  const [placeMeans, setPlaceMeans] = useState(initP.means);
  const [placeDists, setPlaceDists] = useState(initP.dists);
  const [results, setResults] = useState<
    Partial<Record<PlacementMethod, SimulationResult>>
  >({});
  const [compare, setCompare] = useState<MethodCompareRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<string>("dolly");

  const patchSite = (p: Partial<SiteScenario>) =>
    setSite((s) => ({ ...s, ...p }));

  const onTab = (v: string) => {
    setTab(v);
    if (v === "dolly" || v === "crane" || v === "pump") setMethod(v);
  };


  // Re-derive place cycle means when site geometry changes (keep dist kind/cv)
  useEffect(() => {
    setPlaceMeans((prev) => {
      const next = { ...prev };
      const nextDists: typeof placeDists = { ...placeDists };
      for (const m of PLACE_METHODS) {
        const d = derivePlaceCycle(m, site.distance_m, site.height_m);
        const means = meansFromDerived(d);
        next[m] = means;
        const old = placeDists[m];
        nextDists[m] = {
          fill: rebuildDist({ ...old.fill, mean: means.fill }, old.fill.kind, old.fill.cv),
          travel: rebuildDist({ ...old.travel, mean: means.travel }, old.travel.kind, old.travel.cv),
          place: rebuildDist({ ...old.place, mean: means.place }, old.place.kind, old.place.cv),
          return: rebuildDist({ ...old.return, mean: means.return }, old.return.kind, old.return.cv),
        };
      }
      setPlaceDists(nextDists);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only geometry
  }, [site.distance_m, site.height_m]);

  const placeOverrides = (m: PlacementMethod) => ({
    num_place: numPlace[m],
    place_fill_mean: placeMeans[m].fill,
    place_travel_mean: placeMeans[m].travel,
    place_place_mean: placeMeans[m].place,
    place_return_mean: placeMeans[m].return,
    place_fill_dist: placeDists[m].fill,
    place_travel_dist: placeDists[m].travel,
    place_place_dist: placeDists[m].place,
    place_return_dist: placeDists[m].return,
    cost_loader_per_hour: placeCost[m],
    cost_loader_operator_per_hour: placeOpCost[m],
    cost_hauler_per_hour: truckCost,
    cost_hauler_operator_per_hour: truckOpCost,
    cost_all_in: true,
    place_capacity_m3: placeCap[m],
  });
  const runCompare = () => {
    setRunning(true);
    requestAnimationFrame(() => {
      try {
        const rows: MethodCompareRow[] = PLACE_METHODS.map((method) => {
          const r = runSimulation(buildConcretingConfig(site, method, placeOverrides(method)));
          const d = derivePlaceCycle(method, site.distance_m, site.height_m);
          const hours = r.simulated_minutes / 60;
          const vol = Math.max(r.total_volume, 1e-9);
          const p = METHOD_PROFILES[method];
          const totalCost =
            hours * numPlace[method] * (placeCost[method] + placeOpCost[method]) +
            hours * site.num_trucks * (truckCost + truckOpCost);
          const totalEmission =
            hours * numPlace[method] *
              (p.fuel_place_work * 0.5 + p.fuel_place_idle * 0.5) * 2.68 +
            hours * site.num_trucks *
              (p.fuel_truck_work * 0.5 + p.fuel_truck_idle * 0.5) * 2.68;
          // Prefer result emissions if present
          const unitEmission =
            r.total_volume > 0 && "total_co2e_kg" in r && typeof (r as { total_co2e_kg?: number }).total_co2e_kg === "number"
              ? ((r as { total_co2e_kg: number }).total_co2e_kg / vol)
              : totalEmission / vol;
          return {
            method,
            label: p.label,
            suitability: d.suitability,
            note: d.note,
            cycle_place_mean:
              placeMeans[method].fill +
              placeMeans[method].travel +
              placeMeans[method].place +
              placeMeans[method].return,
            result: r,
            hours,
            unit_cost: totalCost / vol,
            unit_emission: unitEmission,
          };
        });
        setCompare(rows);
        const next: Partial<Record<PlacementMethod, SimulationResult>> = {};
        for (const row of rows) next[row.method] = row.result;
        setResults(next);
        trackSimulation("concreting");
      } finally {
        setRunning(false);
      }
    });
  };

  const resetSite = () => {
    setSite({ ...DEFAULT_SITE });
    setNumPlace({
      dolly: METHOD_PROFILES.dolly.num_place,
      crane: METHOD_PROFILES.crane.num_place,
      pump: METHOD_PROFILES.pump.num_place,
    });
    setPlaceCost({
      dolly: METHOD_PROFILES.dolly.cost_place_per_hour,
      crane: METHOD_PROFILES.crane.cost_place_per_hour,
      pump: METHOD_PROFILES.pump.cost_place_per_hour,
    });
    setPlaceOpCost({
      dolly: METHOD_PROFILES.dolly.cost_place_op,
      crane: METHOD_PROFILES.crane.cost_place_op,
      pump: METHOD_PROFILES.pump.cost_place_op,
    });
    setTruckCost(METHOD_PROFILES.dolly.cost_truck_per_hour);
    setTruckOpCost(METHOD_PROFILES.dolly.cost_truck_op);
    setPlaceCap({
      dolly: METHOD_PROFILES.dolly.place_capacity_m3,
      crane: METHOD_PROFILES.crane.place_capacity_m3,
      pump: METHOD_PROFILES.pump.place_capacity_m3,
    });
    setPumpRate(METHOD_PROFILES.pump.pump_rate_m3_per_h ?? 30);
    const p = initPlaceState(
      DEFAULT_SITE.distance_m,
      DEFAULT_SITE.height_m,
      DEFAULT_SITE.cv,
      DEFAULT_SITE.default_dist_kind,
    );
    setPlaceMeans(p.means);
    setPlaceDists(p.dists);
    setResults({});
    setCompare(null);
  };

  return (
    <div className="space-y-6">
      {/* Skenario site bersama */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Site scenario (shared)</CardTitle>
          <CardDescription>
            Reference point: truck-mixer discharge → pour location. Same distance & height for
            all three placing methods so comparison is fair.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Jarak horizontal"
              unit="m"
              value={site.distance_m}
              min={0}
              max={200}
              step={1}
              onChange={(v) => patchSite({ distance_m: v })}
            />
            <Field
              label="Tinggi vertikal"
              unit="m"
              value={site.height_m}
              min={0}
              max={100}
              step={0.5}
              onChange={(v) => patchSite({ height_m: v })}
            />
            <Field
              label="Target volume"
              unit="m³"
              value={site.target_volume}
              min={1}
              max={500}
              step={1}
              onChange={(v) => patchSite({ target_volume: v })}
            />
            <Field
              label="Target siklus (cap)"
              value={site.target_cycles}
              min={1}
              max={400}
              step={1}
              onChange={(v) => patchSite({ target_cycles: Math.floor(v) })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Jumlah truck mixer"
              value={site.num_trucks}
              min={1}
              max={20}
              step={1}
              onChange={(v) => patchSite({ num_trucks: Math.floor(v) })}
            />
            <Field
              label="Kapasitas drum"
              unit="m³"
              value={site.truck_capacity_m3}
              min={1}
              max={12}
              step={0.5}
              onChange={(v) => patchSite({ truck_capacity_m3: v })}
            />
            <Field
              label="Sewa truck mixer"
              unit="ribu Rp/jam"
              value={truckCost / 1000}
              min={0}
              max={2000}
              step={5}
              onChange={(v) => setTruckCost(v * 1000)}
            />
            <Field
              label="Operator truck mixer"
              unit="ribu Rp/jam"
              value={truckOpCost / 1000}
              min={0}
              max={1000}
              step={5}
              onChange={(v) => setTruckOpCost(v * 1000)}
            />
            <Field
              label="Seed"
              value={site.seed}
              min={1}
              step={1}
              onChange={(v) => patchSite({ seed: Math.floor(v) })}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default dist / CV</Label>
              <div className="flex gap-2">
                <Select
                  value={site.default_dist_kind}
                  onValueChange={(v) => {
                    const kind = v as DistKind;
                    const cv = kind === "constant" ? 0 : site.cv || 0.2;
                    const patch: Partial<SiteScenario> = {
                      default_dist_kind: kind,
                      cv,
                    };
                    for (const ph of TRUCK_PHASES) {
                      const mean = site[ph.meanKey] as number;
                      patch[ph.distKey] = rebuildDist(
                        { ...site[ph.distKey], mean },
                        kind,
                        cv,
                      );
                    }
                    patchSite(patch);
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
            </div>
          </div>

          {/* Site buffer resource */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,140px)_1fr] sm:items-end">
            <figure className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
              <img
                src="/illustrations/resources/site-buffer.jpg"
                alt="Site buffer"
                className="mx-auto h-28 w-full object-contain p-1"
              />
              <figcaption className="border-t border-border px-1.5 py-1 text-center text-[10px] font-medium text-muted-foreground">
                Site buffer
              </figcaption>
            </figure>
            <Field
              label="Buffer capacity"
              unit="m³"
              value={site.buffer_capacity_m3}
              min={0.5}
              max={40}
              step={0.5}
              onChange={(v) => patchSite({ buffer_capacity_m3: v })}
            />
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Cycle A · truck mixer (shared)</p>
              <p className="text-xs text-muted-foreground">
                Batch · Haul · Discharge · Return — mean (menit) + distribusi, pola sama seperti
                earthmoving.
              </p>
            </div>
            <div className="space-y-3">
              {TRUCK_PHASES.map((ph) => {
                const mean = site[ph.meanKey] as number;
                const dist = site[ph.distKey];
                return (
                  <div
                    key={ph.key}
                    className="rounded-[var(--radius-lg)] border border-border bg-card/40 p-3 sm:p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{ph.label}</p>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        μ = {mean} mnt
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_minmax(140px,180px)] sm:items-end">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Mean (menit)</Label>
                        <Slider
                          min={0.5}
                          max={ph.maxMean}
                          step={0.5}
                          value={[mean]}
                          onValueChange={([v]) => {
                            const d = rebuildDist({ ...dist, mean: v }, dist.kind, dist.cv);
                            patchSite({
                              [ph.meanKey]: v,
                              [ph.distKey]: d,
                            } as Partial<SiteScenario>);
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Distribusi</Label>
                        <Select
                          value={dist.kind}
                          onValueChange={(v) => {
                            const kind = v as DistKind;
                            const cv = kind === "constant" ? 0 : dist.cv > 0 ? dist.cv : site.cv;
                            patchSite({
                              [ph.distKey]: rebuildDist({ ...dist, mean }, kind, cv),
                            } as Partial<SiteScenario>);
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
                    </div>
                    {dist.kind !== "constant" && dist.kind !== "beta" ? (
                      <div className="mt-3 space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          CV (std/mean) = {dist.cv.toFixed(2)}
                        </Label>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[dist.cv]}
                          onValueChange={([v]) =>
                            patchSite({
                              [ph.distKey]: rebuildDist({ ...dist, mean }, dist.kind, v),
                            } as Partial<SiteScenario>)
                          }
                        />
                      </div>
                    ) : null}
                    {dist.kind === "beta" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Field
                          label="Min"
                          unit="mnt"
                          value={dist.min_bound}
                          min={0.05}
                          step={0.1}
                          onChange={(v) =>
                            patchSite({
                              [ph.distKey]: { ...dist, min_bound: v },
                            } as Partial<SiteScenario>)
                          }
                        />
                        <Field
                          label="Max"
                          unit="mnt"
                          value={dist.max_bound}
                          min={0.1}
                          step={0.1}
                          onChange={(v) =>
                            patchSite({
                              [ph.distKey]: { ...dist, max_bound: v },
                            } as Partial<SiteScenario>)
                          }
                        />
                        <Field
                          label="α"
                          value={dist.alpha}
                          min={0.1}
                          step={0.1}
                          onChange={(v) =>
                            patchSite({
                              [ph.distKey]: { ...dist, alpha: v },
                            } as Partial<SiteScenario>)
                          }
                        />
                        <Field
                          label="β"
                          value={dist.beta_shape}
                          min={0.1}
                          step={0.1}
                          onChange={(v) =>
                            patchSite({
                              [ph.distKey]: { ...dist, beta_shape: v },
                            } as Partial<SiteScenario>)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetSite}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset skenario
            </Button>
            <Button type="button" size="sm" onClick={runCompare} disabled={running}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Jalankan & bandingkan 3 metode
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs metode + perbandingan */}
      <Tabs value={tab} onValueChange={onTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {PLACE_METHODS.map((m) => (
            <TabsTrigger key={m} value={m} className="text-xs sm:text-sm">
              {METHOD_PROFILES[m].shortLabel}
            </TabsTrigger>
          ))}
          <TabsTrigger value="compare" className="text-xs sm:text-sm">
            Perbandingan
          </TabsTrigger>
        </TabsList>

        {PLACE_METHODS.map((m) => {
          const d = derivePlaceCycle(m, site.distance_m, site.height_m);
          const prof = METHOD_PROFILES[m];
          const res = results[m];
          return (
            <TabsContent key={m} value={m} className="space-y-4 pt-2">
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,280px)]">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{prof.label}</CardTitle>
                    <CardDescription>{prof.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {d.note} Mean place-cycle diturunkan dari jarak {site.distance_m} m · tinggi{" "}
                      {site.height_m} m (bisa diubah). Setiap task punya distribusi sama pola Cycle A
                      truck mixer.
                    </p>
                    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-muted/20 p-3 sm:p-4">
                      <div>
                        <p className="text-sm font-medium">Resource & biaya placing (Cycle B)</p>
                        <p className="text-xs text-muted-foreground">
                          Hanya alat place. Truck mixer (jumlah, kapasitas, sewa, operator) di Site scenario
                          — shared untuk ketiga metode. Biaya ribu Rp/jam (×1000), all-in.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {m === "crane" ? (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">
                                Tower crane
                              </Label>
                              <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm tabular-nums">
                                1{" "}
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (fixed)
                                </span>
                              </div>
                            </div>
                            <Field
                              label="Jumlah bucket"
                              value={numPlace[m]}
                              min={1}
                              max={prof.max_place_units}
                              step={1}
                              onChange={(v) =>
                                setNumPlace((p) => ({
                                  ...p,
                                  [m]: Math.min(
                                    prof.max_place_units,
                                    Math.max(1, Math.floor(v)),
                                  ),
                                }))
                              }
                            />
                          </>
                        ) : (
                          <Field
                            label={`Jumlah ${prof.placeLabel.toLowerCase()}`}
                            value={numPlace[m]}
                            min={1}
                            max={prof.max_place_units}
                            step={1}
                            onChange={(v) =>
                              setNumPlace((p) => ({
                                ...p,
                                [m]: Math.min(
                                  prof.max_place_units,
                                  Math.max(1, Math.floor(v)),
                                ),
                              }))
                            }
                          />
                        )}
                        <Field
                          label={`Sewa ${prof.placeLabel.toLowerCase()}`}
                          unit="ribu Rp/jam"
                          value={placeCost[m] / 1000}
                          min={0}
                          max={5000}
                          step={5}
                          onChange={(v) =>
                            setPlaceCost((c) => ({ ...c, [m]: v * 1000 }))
                          }
                        />
                        <Field
                          label="Operator place"
                          unit="ribu Rp/jam"
                          value={placeOpCost[m] / 1000}
                          min={0}
                          max={2000}
                          step={5}
                          onChange={(v) =>
                            setPlaceOpCost((c) => ({ ...c, [m]: v * 1000 }))
                          }
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {m === "pump" ? (
                          <>
                            <Field
                              label="Debit teoritis pompa"
                              unit="m³/jam"
                              value={pumpRate}
                              min={5}
                              max={120}
                              step={1}
                              onChange={(v) => setPumpRate(Math.max(5, v))}
                            />
                            <Field
                              label="Volume per pulse cycle"
                              unit="m³"
                              value={placeCap[m]}
                              min={0.1}
                              max={5}
                              step={0.05}
                              onChange={(v) =>
                                setPlaceCap((c) => ({
                                  ...c,
                                  [m]: Math.max(0.1, v),
                                }))
                              }
                            />
                          </>
                        ) : (
                          <Field
                            label={
                              m === "crane"
                                ? "Kapasitas bucket"
                                : "Kapasitas buggy"
                            }
                            unit="m³"
                            value={placeCap[m]}
                            min={0.1}
                            max={m === "crane" ? 3 : 1.5}
                            step={0.05}
                            onChange={(v) =>
                              setPlaceCap((c) => ({
                                ...c,
                                [m]: Math.max(0.1, v),
                              }))
                            }
                          />
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Estimasi biaya/jam alat place:{" "}
                        <strong className="text-foreground">
                          {(
                            (numPlace[m] * (placeCost[m] + placeOpCost[m])) /
                            1000
                          ).toFixed(0)}{" "}
                          ribu Rp/jam
                        </strong>
                        {" · "}truck mixer (shared):{" "}
                        <strong className="text-foreground">
                          {site.num_trucks}×{(truckCost + truckOpCost) / 1000} ribu
                          Rp/jam
                        </strong>
                        {m === "pump" ? (
                          <>
                            {" · "}Debit teoritis ≈{" "}
                            <strong className="text-foreground">
                              {pumpRate} m³/jam
                            </strong>
                            {" · "}waktu place ideal per pulse ≈{" "}
                            <strong className="text-foreground">
                              {((placeCap[m] / Math.max(pumpRate, 1)) * 60).toFixed(1)}{" "}
                              mnt
                            </strong>
                          </>
                        ) : (
                          <>
                            {" · "}Kapasitas place{" "}
                            <strong className="text-foreground">
                              {placeCap[m]} m³/cycle
                            </strong>
                          </>
                        )}
                      </p>
                      <p className="text-[10px] leading-relaxed text-muted-foreground/90">
                        {prof.market_note}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">Cycle B · placing tasks + distribution</p>
                        <p className="text-xs text-muted-foreground">
                          Fill · Travel · Place · Return — mean (menit) + distribusi + CV, sama seperti
                          Cycle A (RMC truck mixer).
                        </p>
                      </div>
                      <div className="space-y-3">
                        {PLACE_PHASE_META.map((ph) => {
                          const mean = placeMeans[m][ph.key];
                          const dist = placeDists[m][ph.key];
                          const label = PLACE_TASK_LABELS[m][ph.key];
                          return (
                            <div
                              key={ph.key}
                              className="rounded-[var(--radius-lg)] border border-border bg-card/40 p-3 sm:p-4"
                            >
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{label}</p>
                                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                  μ = {mean} mnt
                                </span>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-[1fr_minmax(140px,180px)] sm:items-end">
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Mean (menit)</Label>
                                  <Slider
                                    min={0.5}
                                    max={ph.maxMean}
                                    step={0.5}
                                    value={[mean]}
                                    onValueChange={([v]) => {
                                      const nd = rebuildDist(
                                        { ...dist, mean: v },
                                        dist.kind,
                                        dist.cv,
                                      );
                                      setPlaceMeans((pm) => ({
                                        ...pm,
                                        [m]: { ...pm[m], [ph.key]: v },
                                      }));
                                      setPlaceDists((pd) => ({
                                        ...pd,
                                        [m]: { ...pd[m], [ph.key]: nd },
                                      }));
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Distribusi</Label>
                                  <Select
                                    value={dist.kind}
                                    onValueChange={(v) => {
                                      const kind = v as DistKind;
                                      const cv =
                                        kind === "constant"
                                          ? 0
                                          : dist.cv > 0
                                            ? dist.cv
                                            : site.cv;
                                      setPlaceDists((pd) => ({
                                        ...pd,
                                        [m]: {
                                          ...pd[m],
                                          [ph.key]: rebuildDist(
                                            { ...dist, mean },
                                            kind,
                                            cv,
                                          ),
                                        },
                                      }));
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
                              </div>
                              {dist.kind !== "constant" && dist.kind !== "beta" ? (
                                <div className="mt-3 space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">
                                    CV (std/mean) = {dist.cv.toFixed(2)}
                                  </Label>
                                  <Slider
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={[dist.cv]}
                                    onValueChange={([v]) =>
                                      setPlaceDists((pd) => ({
                                        ...pd,
                                        [m]: {
                                          ...pd[m],
                                          [ph.key]: rebuildDist(
                                            { ...dist, mean },
                                            dist.kind,
                                            v,
                                          ),
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Σ place cycle ≈{" "}
                        <strong className="text-foreground">
                          {(
                            placeMeans[m].fill +
                            placeMeans[m].travel +
                            placeMeans[m].place +
                            placeMeans[m].return
                          ).toFixed(1)}{" "}
                          mnt
                        </strong>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setMethod(m);
                          setRunning(true);
                          requestAnimationFrame(() => {
                            try {
                              const r = runSimulation(
                                buildConcretingConfig(site, m, placeOverrides(m)),
                              );
                              setResults((prev) => ({ ...prev, [m]: r }));
                              trackSimulation("concreting");
                            } finally {
                              setRunning(false);
                            }
                          });
                        }}
                        disabled={running}
                      >
                        <Play className="mr-1.5 h-4 w-4" />
                        Jalankan simulasi {prof.shortLabel}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted/30">
                  <img
                    src={prof.illustration}
                    alt={`Dual-cycle schematic: RMC truck mixer → site buffer → ${prof.label}`}
                    className="mx-auto max-h-56 w-full object-contain object-center p-2 sm:max-h-72"
                  />
                  <figcaption className="border-t border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
                    <strong className="text-foreground">Cycle A</strong> truck mixer plant↔site →
                    buffer · <strong className="text-foreground">Cycle B</strong> {prof.shortLabel}{" "}
                    place · who waits whom at buffer
                  </figcaption>
                </figure>
              </div>

              <div id={m === method ? "hasil-concreting" : undefined}>
                {res ? (
                  <ResultsPanel result={res} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Belum ada hasil — jalankan simulasi metode ini, atau pakai tombol
                    bandingkan 3 metode di skenario.
                  </p>
                )}
              </div>
            </TabsContent>
          );
        })}

        <TabsContent value="compare" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Perbandingan metode placing</CardTitle>
              <CardDescription>
                Skenario sama: jarak {site.distance_m} m · tinggi {site.height_m} m · target{" "}
                {site.target_volume} m³ · {site.num_trucks} truck mixer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button type="button" onClick={runCompare} disabled={running}>
                <Play className="mr-1.5 h-4 w-4" />
                {running ? "Menghitung…" : "Hitung ulang perbandingan"}
              </Button>

              {compare ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Metode</th>
                          <th className="py-2 pr-3 font-medium">Cycle place</th>
                          <th className="py-2 pr-3 font-medium">Throughput</th>
                          <th className="py-2 pr-3 font-medium">Durasi</th>
                          <th className="py-2 pr-3 font-medium">Util place</th>
                          <th className="py-2 pr-3 font-medium">Util truck</th>
                          <th className="py-2 pr-3 font-medium">Biaya/m³</th>
                          <th className="py-2 font-medium">Emisi/m³</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compare.map((row) => (
                          <tr key={row.method} className="border-b border-border/60">
                            <td className="py-2 pr-3 font-medium">{row.label}</td>
                            <td className="py-2 pr-3">{formatNum(row.cycle_place_mean, 1)} mnt</td>
                            <td className="py-2 pr-3">
                              {formatNum(row.result.throughput_per_hour, 1)} m³/jam
                            </td>
                            <td className="py-2 pr-3">{formatNum(row.hours, 2)} jam</td>
                            <td className="py-2 pr-3">
                              {formatNum(row.result.loader_utilization * 100, 0)}%
                            </td>
                            <td className="py-2 pr-3">
                              {formatNum(row.result.hauler_utilization * 100, 0)}%
                            </td>
                            <td className="py-2 pr-3">
                              {formatNum(row.unit_cost / 1000, 0)} rb
                            </td>
                            <td className="py-2">
                              {formatNum(row.unit_emission, 2)} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Throughput (m³/jam)">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={compare.map((r) => ({
                            name: METHOD_PROFILES[r.method].shortLabel,
                            v: r.result.throughput_per_hour,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="v" name="m³/jam" fill="var(--color-chart-1)" radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="Biaya satuan (ribu Rp/m³)">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={compare.map((r) => ({
                            name: METHOD_PROFILES[r.method].shortLabel,
                            v: r.unit_cost / 1000,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="v" name="rb Rp/m³" fill="var(--color-chart-2)" radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="Utilisasi resource (%)">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={compare.map((r) => ({
                            name: METHOD_PROFILES[r.method].shortLabel,
                            place: r.result.loader_utilization * 100,
                            truck: r.result.hauler_utilization * 100,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="place" name="Place" fill="var(--color-chart-1)" radius={4} />
                          <Bar dataKey="truck" name="Truck" fill="var(--color-chart-3)" radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="Emisi satuan (kg CO₂e/m³)">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={compare.map((r) => ({
                            name: METHOD_PROFILES[r.method].shortLabel,
                            v: r.unit_emission,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="v" name="kg/m³" fill="var(--color-chart-4)" radius={4} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {compare.map((r) => (
                      <li key={r.method}>
                        <strong className="text-foreground">
                          {METHOD_PROFILES[r.method].shortLabel}:
                        </strong>{" "}
                        {r.note}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Belum ada data perbandingan. Klik hitung ulang atau tombol di skenario.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
