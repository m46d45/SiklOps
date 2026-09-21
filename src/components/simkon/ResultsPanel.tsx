import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { resourceLabels, type SimulationResult } from "@/lib/simkon/engine";
import { buildResourceUtilByCycle } from "@/lib/simkon/utilByCycle";
import {
  analyzeSystem,
  kingmanCurve,
  theoreticalCaps,
  whatIfTips,
} from "@/lib/simkon/queueing";
import { MetricCard } from "@/components/simkon/MetricCard";
import { ComparisonPanel } from "@/components/simkon/ComparisonPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeCosts, formatMoney } from "@/lib/simkon/costs";
import { computeEmissions, formatKg } from "@/lib/simkon/emissions";
import { detectSteadyState } from "@/lib/simkon/steadyState";
import { runMultiSeed, type MultiRunSummary } from "@/lib/simkon/multiRun";
import { phaseLabelsFor } from "@/lib/simkon/operations";
import { formatNum, formatPct } from "@/lib/utils";

const PHASE_COLORS: Record<string, string> = {
  wait: "#8a8680",
  load: "#b06a2b",
  haul: "#3d6b8a",
  dump: "#2f6b4f",
  return: "#5c6b7a",
};

const PHASE_ORDER = ["wait", "load", "haul", "dump", "return"] as const;

/**
 * Standar tab hasil: Ringkasan (+ saran desain) | Perbandingan | Teori antrian
 */
export function ResultsPanel({ result }: { result: SimulationResult }) {
  const labels = resourceLabels(
    result.operation,
    result.config.placement_method ?? null,
  );
  const unit = labels.unit;
  const PHASE_LABELS = phaseLabelsFor(result.operation);
  const sys = analyzeSystem(result);
  const caps = theoreticalCaps(result);
  const tips = whatIfTips(result);
  const errPct = (pred: number | null | undefined, obs: number) => {
    if (pred == null || !Number.isFinite(pred) || Math.abs(obs) < 1e-12) return null;
    return ((pred - obs) / obs) * 100;
  };
  const wqErr = errPct(sys.W_q_kingman, sys.W_q_sim);
  const lqErr = errPct(sys.L_q_little, sys.L_q_sim);
  const littleNErr =
    sys.little_N_error_rel != null ? sys.little_N_error_rel * 100 : null;

  const [multiN, setMultiN] = useState(5);
  const [multi, setMulti] = useState<MultiRunSummary | null>(null);
  const [multiBusy, setMultiBusy] = useState(false);

  const runMulti = () => {
    setMultiBusy(true);
    requestAnimationFrame(() => {
      try {
        setMulti(runMultiSeed(result.config, multiN));
      } finally {
        setMultiBusy(false);
      }
    });
  };

  const stopMsg = (() => {
    const mins = formatNum(result.simulated_minutes, 1);
    const hours = formatNum(result.simulated_minutes / 60, 2);
    const volT = result.target_volume ?? 0;
    const cycT = result.target_cycles ?? 0;
    switch (result.stop_reason) {
      case "target_cycles":
        return `Berhenti karena target ${cycT} siklus tercapai (${mins} mnt · volume ${formatNum(result.total_volume, 2)} ${unit}).`;
      case "target_volume":
        return `Berhenti karena target pekerjaan ${formatNum(volT, 2)} m³ tercapai (${mins} mnt · ${result.total_trips} siklus).`;
      case "target_both":
        return `Berhenti karena target siklus (${cycT}) dan volume (${formatNum(volT, 2)} ${unit}) tercapai bersamaan (${mins} mnt).`;
      case "duration_cap":
        return `Target belum tercapai (siklus ${result.total_trips}/${cycT || "—"}, volume ${formatNum(result.total_volume, 2)}/${volT || "—"} ${unit}); berhenti di batas waktu (${hours} jam).`;
      default:
        return `Berhenti karena durasi habis (${hours} jam).`;
    }
  })();

  const avg = result.avg_cycle_components;
  const phasePie = PHASE_ORDER.filter((p) => avg[p] != null).map((p) => ({
    name: PHASE_LABELS[p],
    value: avg[p] as number,
    fill: PHASE_COLORS[p],
  }));
  const phaseTotalMin = phasePie.reduce((s, p) => s + p.value, 0);
  const phaseBars = phasePie.map((p) => ({
    ...p,
    minutes: Math.round(p.value * 100) / 100,
    pct: phaseTotalMin > 0 ? Math.round((p.value / phaseTotalMin) * 1000) / 10 : 0,
  }));

  const utilData = [
    { name: labels.loader, util: result.loader_utilization * 100, fill: "#b06a2b" },
    { name: labels.hauler, util: result.hauler_utilization * 100, fill: "#3d6b8a" },
  ];

  const volumeData = result.timeline_volume.map(([t, v]) => ({
    jam: Math.round((t / 60) * 100) / 100,
    volume: Math.round(v * 100) / 100,
  }));

  const queueData = result.queue_over_time.map(([t, q]) => ({
    jam: t / 60,
    antrian: q,
  }));

  // Mulai dari siklus 0 (produktivitas 0) agar kurva naik dari origin
  const learningFromLog = result.cycle_log.map((c, i) => {
    const window = result.cycle_log.slice(Math.max(0, i - 4), i + 1);
    const prod = window.reduce((s, x) => s + x.productivity, 0) / window.length;
    return {
      trip: c.trip,
      productivity: Math.round(c.productivity * 10) / 10,
      rolling: Math.round(prod * 10) / 10,
    };
  });
  const learning =
    learningFromLog.length > 0
      ? [{ trip: 0, productivity: 0, rolling: 0 }, ...learningFromLog]
      : learningFromLog;

  const utilByCycle = buildResourceUtilByCycle(result);
  const costs = computeCosts(result);
  const emissions = computeEmissions(result);
  const prodSeries = result.cycle_log.map((c) => c.productivity);
  const ss = detectSteadyState(prodSeries, 10, 0.1, Math.min(10, Math.max(5, Math.floor(prodSeries.length / 3))));
  const idealTrucks =
    caps.loaderProd > 0 && result.config.load_time_mean + result.config.haul_time_mean + result.config.dump_time_mean + result.config.return_time_mean > 0
      ? Math.max(
          1,
          Math.round(
            (result.config.load_time_mean +
              result.config.haul_time_mean +
              result.config.dump_time_mean +
              result.config.return_time_mean) /
              Math.max(0.05, result.config.load_time_mean),
          ) * result.config.num_loaders,
        )
      : result.config.num_haulers;

  const kingman = kingmanCurve(sys.t_s_sys, sys.c_a_sys, sys.c_s_sys).map((r) => ({
    rho: Math.round(r.rho_pct),
    Wq: Number.isFinite(r.W_q) ? Math.round(r.W_q * 100) / 100 : null,
  }));


  return (
    <section className="space-y-3" aria-label="Hasil simulasi">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Hasil simulasi</h2>
          <p className="text-sm text-muted-foreground">
            Standar tab hasil — sama untuk setiap operasi di versi berikutnya.
          </p>
        </div>
        <Badge variant="outline" className="font-normal">
          {result.total_trips} trip · {formatNum(result.throughput_per_hour)} {unit}/jam
        </Badge>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start">
          <TabsTrigger value="summary">Ringkasan</TabsTrigger>
          <TabsTrigger value="compare">Perbandingan</TabsTrigger>
          <TabsTrigger value="queueing">Teori antrian</TabsTrigger>
        </TabsList>

        {/* —— Ringkasan KPI + bottleneck + overview charts —— */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Total trip" value={formatNum(result.total_trips, 0)} />
            <MetricCard label={`Volume (${unit})`} value={formatNum(result.total_volume, 1)} />
            <MetricCard
              label={`Throughput (${unit}/jam)`}
              value={formatNum(result.throughput_per_hour, 1)}
            />
            <MetricCard
              label="Durasi sim (jam)"
              value={formatNum(result.simulated_minutes / 60, 2)}
            />
            <MetricCard
              label={`Util ${labels.loader}`}
              value={formatPct(result.loader_utilization)}
            />
            <MetricCard
              label={`Util ${labels.hauler}`}
              value={formatPct(result.hauler_utilization)}
            />
            <MetricCard
              label="Tunggu antri rata-rata"
              value={`${formatNum(result.avg_queue_wait, 2)} mnt`}
            />
            <MetricCard
              label="Antrian maks"
              value={formatNum(result.max_queue_length, 0)}
            />
            <MetricCard
              label="Match factor"
              value={formatNum(caps.match, 2)}
              hint="Kap. hauling / kap. loading (≈1 seimbang)"
            />
            <MetricCard
              label="Gap sim vs teori"
              value={
                caps.loaderProd > 0 || caps.haulerProd > 0
                  ? formatPct(
                      1 -
                        result.throughput_per_hour /
                          Math.max(1e-9, Math.min(caps.loaderProd, caps.haulerProd)),
                    )
                  : "—"
              }
              hint="1 − throughput_sim / min(kap. teori)"
            />
            <MetricCard
              label="Waktu ke target"
              value={`${formatNum(result.simulated_minutes / 60, 2)} jam`}
              hint={`${result.total_trips} trip · ${formatNum(result.total_volume, 1)} ${unit}`}
            />
            <MetricCard
              label={`${labels.hauler} / ${labels.loader}`}
              value={formatNum(result.config.num_haulers / Math.max(1, result.config.num_loaders), 2)}
              hint="Rasio armada aktual"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Biaya</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <MetricCard
                label={`Biaya ${labels.loader}`}
                value={formatMoney(costs.cost_loader, costs.currency)}
                hint={`${result.config.num_loaders} × ${formatMoney(costs.loader_rate, costs.currency)}/jam × ${formatNum(costs.hours, 2)} jam`}
              />
              <MetricCard
                label={`Biaya ${labels.hauler}`}
                value={formatMoney(costs.cost_hauler, costs.currency)}
                hint={`${result.config.num_haulers} × ${formatMoney(costs.hauler_rate, costs.currency)}/jam × ${formatNum(costs.hours, 2)} jam`}
              />
              <MetricCard
                label="Biaya waiting (waste)"
                value={formatMoney(costs.cost_wait, costs.currency)}
                hint="Jam·unit tunggu truck × tarif truck"
              />
              <MetricCard
                label="Biaya total fleet"
                value={formatMoney(costs.cost_total, costs.currency)}
                hint={`${labels.loader} + ${labels.hauler} (sewa selama sim)`}
              />
              <MetricCard
                label={`Biaya satuan (${costs.currency}/${unit})`}
                value={formatMoney(costs.unit_cost, costs.currency)}
                hint="Biaya total ÷ volume"
              />
              <MetricCard
                label={`Waste per ${unit}`}
                value={formatMoney(costs.wait_unit_cost, costs.currency)}
                hint="Biaya waiting ÷ volume"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Emisi CO₂e</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <MetricCard
                label={`Emisi ${labels.loader}`}
                value={formatKg(emissions.emission_loader)}
                hint={`Kerja ${formatNum(emissions.loader_busy_h, 2)} j + idle ${formatNum(emissions.loader_idle_h, 2)} j`}
              />
              <MetricCard
                label={`Emisi ${labels.hauler}`}
                value={formatKg(emissions.emission_hauler)}
                hint={`Kerja ${formatNum(emissions.hauler_busy_h, 2)} j + antri ${formatNum(emissions.hauler_wait_h, 2)} j + idle ${formatNum(emissions.hauler_idle_h, 2)} j`}
              />
              <MetricCard
                label="Emisi waiting (waste)"
                value={formatKg(emissions.emission_wait)}
                hint="Jam antri truck × EF idle truck"
              />
              <MetricCard
                label="Emisi total"
                value={formatKg(emissions.emission_total)}
                hint={`${labels.loader} + ${labels.hauler}`}
              />
              <MetricCard
                label={`Emisi satuan (kg/${unit})`}
                value={formatNum(emissions.unit_emission, 3)}
                hint="Total emisi ÷ volume"
              />
              <MetricCard
                label={`Waste karbon / ${unit}`}
                value={formatNum(emissions.wait_unit_emission, 3)}
                hint="Emisi waiting ÷ volume"
              />
            </div>
          </div>

          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Bottleneck</CardTitle>
                <Badge variant="warn">{result.bottleneck}</Badge>
              </div>
              <CardDescription>{result.bottleneck_reason}</CardDescription>
              <p className="pt-1 text-sm text-muted-foreground">{stopMsg}</p>
            </CardHeader>
          </Card>

                    {learning.length > 0 ? (
            <ChartCard
              title={`Learning curve produktivitas (${unit}/jam)`}
              description={`Produktivitas ekuivalen per siklus dalam ${unit}/jam (volume trip ÷ cycle time). Mulai dari siklus 0 = 0. Moving avg 5 siklus.`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={learning}
                  margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="trip"
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    label={{
                      value: "Siklus",
                      position: "insideBottom",
                      offset: -2,
                      style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={[0, "auto"]}
                    width={56}
                    tickFormatter={(v) => Number(v).toFixed(0)}
                    label={{
                      value: `${unit}/jam`,
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fontSize: 12, fontWeight: 600, fill: "var(--color-foreground)" },
                    }}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${Number(v).toFixed(1)} ${unit}/jam`,
                      name,
                    ]}
                    labelFormatter={(trip) => `Siklus ${trip}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="productivity"
                    name={`Per siklus (${unit}/jam)`}
                    stroke="#1f4d3a"
                    dot={{ r: 3, fill: "#1f4d3a", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    strokeWidth={3}
                  />
                  <Line
                    type="monotone"
                    dataKey="rolling"
                    name={`Moving avg (${unit}/jam)`}
                    stroke="#8a8680"
                    strokeDasharray="6 4"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Steady state"
              value={ss.reached ? `Siklus ${ss.ss_start_cycle}` : "Belum"}
              hint={ss.reason}
            />
            <MetricCard
              label={`Prod. SS (${unit}/jam)`}
              value={ss.ss_mean != null ? formatNum(ss.ss_mean, 1) : "—"}
              hint={ss.ss_cv != null ? `CV zona ${(ss.ss_cv * 100).toFixed(1)}%` : undefined}
            />
            <MetricCard
              label={`${labels.hauler} ideal (teori)`}
              value={formatNum(idealTrucks, 0)}
              hint={`≈ cycle/load × ${labels.loader.toLowerCase()} (match ~1)`}
            />
            <MetricCard
              label="Match factor"
              value={formatNum(caps.match, 2)}
              hint={
                caps.match < 0.9
                  ? `${labels.hauler} kurang`
                  : caps.match > 1.1
                    ? `${labels.hauler} berlebih`
                    : "relatif seimbang"
              }
            />
          </div>

          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Multi-run (sebaran seed)</CardTitle>
              <CardDescription>
                Tidak dihitung otomatis — tekan tombol agar laptop kelas tidak
                membeku. {multiN} run dari seed {result.config.seed ?? 12345}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Jumlah run</span>
                {[5, 10].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={multiN === n ? "default" : "outline"}
                    onClick={() => {
                      setMultiN(n);
                      setMulti(null);
                    }}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  onClick={runMulti}
                  disabled={multiBusy}
                >
                  {multiBusy ? "Menghitung…" : "Hitung sebaran"}
                </Button>
              </div>
              {multi ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricCard
                  label={`Throughput (${unit}/jam)`}
                  value={`${formatNum(multi.throughput.mean, 1)} ± ${formatNum(multi.throughput.std, 1)}`}
                  hint={`${formatNum(multi.throughput.min, 1)} – ${formatNum(multi.throughput.max, 1)}`}
                />
                <MetricCard
                  label="Biaya satuan"
                  value={`${formatNum(multi.unit_cost.mean, 0)} ± ${formatNum(multi.unit_cost.std, 0)}`}
                  hint={`${formatNum(multi.unit_cost.min, 0)} – ${formatNum(multi.unit_cost.max, 0)}`}
                />
                <MetricCard
                  label={`Emisi satuan (kg/${unit})`}
                  value={`${formatNum(multi.unit_emission.mean, 3)} ± ${formatNum(multi.unit_emission.std, 3)}`}
                  hint={`${formatNum(multi.unit_emission.min, 3)} – ${formatNum(multi.unit_emission.max, 3)}`}
                />
              </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Hasil satu seed sudah di atas. Multi-run menampilkan sebaran antar seed.
                </p>
              )}
            </CardContent>
          </Card>

          {utilByCycle.length > 0 ? (
            <ChartCard
              title="Utilisasi resource per siklus"
              description={`Semua resource dalam satu grafik. Garis tebal = kumulatif; putus-putus = jendela antar-siklus. Y = utilisasi (%).`}
            >
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={utilByCycle}
                  margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="siklus"
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                    label={{
                      value: "Siklus",
                      position: "insideBottom",
                      offset: -2,
                      style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
                    }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    width={48}
                    tickFormatter={(v) => `${v}%`}
                    label={{
                      value: "%",
                      angle: -90,
                      position: "insideLeft",
                      offset: 8,
                      style: { fontSize: 12, fontWeight: 600, fill: "var(--color-foreground)" },
                    }}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${Number(v).toFixed(1)}%`,
                      name,
                    ]}
                    labelFormatter={(s) => `Siklus ${s}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="loader_cum"
                    name={`${labels.loader} (kumulatif)`}
                    stroke="#b06a2b"
                    strokeWidth={3}
                    dot={{ r: 2, fill: "#b06a2b", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="hauler_cum"
                    name={`${labels.hauler} (kumulatif)`}
                    stroke="#3d6b8a"
                    strokeWidth={3}
                    dot={{ r: 2, fill: "#3d6b8a", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="wait_cum"
                    name={`Tunggu antri (kumulatif)`}
                    stroke="#8a8680"
                    strokeWidth={2.5}
                    dot={{ r: 2, fill: "#8a8680", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="loader_cycle"
                    name={`${labels.loader} (per siklus)`}
                    stroke="#b06a2b"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                    opacity={0.55}
                  />
                  <Line
                    type="monotone"
                    dataKey="hauler_cycle"
                    name={`${labels.hauler} (per siklus)`}
                    stroke="#3d6b8a"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                    opacity={0.55}
                  />
                  <Line
                    type="monotone"
                    dataKey="wait_cycle"
                    name="Tunggu antri (per siklus)"
                    stroke="#8a8680"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                    opacity={0.55}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Utilisasi resource" description="Persen busy time dalam horizon.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={utilData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="util" name="Utilisasi %" radius={[6, 6, 0, 0]}>
                    {utilData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                    <LabelList
                      dataKey="util"
                      position="top"
                      formatter={(v: number) => `${Number(v).toFixed(1)}%`}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        fill: "var(--color-foreground)",
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Volume kumulatif (produksi)"
              description={`Akumulasi material yang sudah di-dump (${unit}), 2 desimal.`}
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="jam" tick={{ fontSize: 11 }} unit=" j" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => Number(v).toFixed(2)}
                  />
                  <Tooltip
                    formatter={(v: number) => [
                      `${Number(v).toFixed(2)} ${unit}`,
                      "Produksi",
                    ]}
                    labelFormatter={(j) => `t = ${Number(j).toFixed(2)} jam`}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="volume"
                    name={`Produksi (${unit})`}
                    stroke="#2f4a3e"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {phaseBars.length ? (
            <ChartCard
              title="Komposisi siklus"
              description={
                avg.cycle_time != null
                  ? `Rata-rata komponen cycle time (${formatNum(avg.cycle_time)} mnt). Label = porsi terhadap total siklus.`
                  : "Rata-rata komponen cycle time. Label = porsi terhadap total siklus."
              }
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={phaseBars}
                  margin={{ top: 28, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                    label={{
                      value: "menit",
                      angle: -90,
                      position: "insideLeft",
                      offset: 10,
                      style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
                    }}
                  />
                  <Tooltip
                    formatter={(v: number, _n: string, item: { payload?: { pct?: number } }) => {
                      const pct = item?.payload?.pct;
                      return [
                        `${Number(v).toFixed(2)} mnt${pct != null ? ` (${pct}%)` : ""}`,
                        "Durasi",
                      ];
                    }}
                  />
                  <Bar dataKey="minutes" name="Menit" radius={[6, 6, 0, 0]}>
                    {phaseBars.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                    <LabelList
                      dataKey="pct"
                      position="top"
                      formatter={(v: number) => `${Number(v).toFixed(1)}%`}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        fill: "var(--color-foreground)",
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          <ChartCard
            title={`Antrian ${labels.hauler} di loading`}
            description="Panjang antrian seiring waktu (step chart)."
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={queueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="jam"
                  tick={{ fontSize: 11 }}
                  unit=" j"
                  tickFormatter={(v) => Number(v).toFixed(2)}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [formatNum(Number(v), 0), "Antrian"]}
                  labelFormatter={(j) => `t = ${Number(j).toFixed(2)} jam`}
                />
                <Line
                  type="stepAfter"
                  dataKey="antrian"
                  name="Antrian"
                  stroke="#b06a2b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Antrian rata-rata"
              value={formatNum(result.avg_queue_length, 2)}
            />
            <MetricCard
              label="Fraksi tunggu hauler"
              value={formatPct(result.hauler_wait_ratio)}
            />
            <MetricCard
              label="Total tunggu (mnt·unit)"
              value={formatNum(result.total_wait_time, 1)}
            />
            <MetricCard
              label="Load mulai / masih antri"
              value={`${result.completed_load_requests} / ${result.censored_waits}`}
            />
          </div>

          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Saran desain</CardTitle>
              <CardDescription>
                Berdasarkan bottleneck <Badge variant="warn" className="mx-1 align-middle">{result.bottleneck}</Badge>
                dan match factor — coba what-if lalu jalankan ulang.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label={`Kap. ${labels.loader} (${unit}/jam)`}
                  value={formatNum(caps.loaderProd, 1)}
                />
                <MetricCard
                  label={`Kap. ${labels.hauler} (${unit}/jam)`}
                  value={formatNum(caps.haulerProd, 1)}
                />
                <MetricCard
                  label="Match factor"
                  value={formatNum(caps.match, 2)}
                  hint="≈1 seimbang; <1 hauler kurang; >1 hauler berlebih"
                />
                <MetricCard
                  label={`${labels.hauler} ideal teori`}
                  value={formatNum(idealTrucks, 0)}
                  hint={`Aktual ${result.config.num_haulers} · selisih ${idealTrucks - result.config.num_haulers}`}
                />
              </div>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Cara membaca metrik lengkap ada di{" "}
                <a href="/manual" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Manual
                </a>
                . Bandingkan juga prediksi teori di tab <strong className="text-foreground">Teori antrian</strong>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* —— Perbandingan fleet —— */}
        <TabsContent value="compare" className="space-y-4">
          <ComparisonPanel baseConfig={result.config} />
        </TabsContent>

        {/* —— Teori antrian (Little + Kingman) —— */}
        <TabsContent value="queueing" className="space-y-4">
          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Simulasi vs teori antrian</CardTitle>
              <CardDescription className="leading-relaxed">
                <strong className="text-foreground">Little's Law</strong> menghubungkan
                stok antrian (L) dengan laju (λ) dan waktu (W): L = λ·W.{" "}
                <strong className="text-foreground">Kingman (VUT)</strong> memperkirakan
                waktu tunggu dari utilisasi × variabilitas kedatangan/pelayanan. Prediksi
                bisa beda dari DES (horizon terbatas, multi-server, fleet tertutup).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <p>
                Bottleneck:{" "}
                <strong className="text-foreground">{sys.bottleneck}</strong>
              </p>
              <p>
                Utilisasi sistem ρ ≈{" "}
                <strong className="text-foreground">{formatPct(sys.rho_sys)}</strong>
                {sys.stable ? " (stabil)" : " (mendekati jenuh)"}
              </p>
              <p>
                λ trip ≈{" "}
                <strong className="text-foreground">
                  {formatNum(sys.lambda_trip_per_hour, 1)}
                </strong>{" "}
                /jam
              </p>
            </CardContent>
          </Card>

          <div>
            <p className="mb-2 text-sm font-medium">Little's Law — cek konsistensi</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="W_q DES (mnt)"
                value={formatNum(sys.W_q_sim, 3)}
                hint="Rata-rata tunggu dari simulasi"
              />
              <MetricCard
                label="L_q DES"
                value={formatNum(sys.L_q_sim, 3)}
                hint="Panjang antri rata-rata (sim)"
              />
              <MetricCard
                label="L_q = λ·W_q"
                value={formatNum(sys.L_q_little, 3)}
                hint={
                  lqErr != null
                    ? `vs DES: ${lqErr > 0 ? "+" : ""}${lqErr.toFixed(1)}%`
                    : "Little dari W_q sim"
                }
              />
              <MetricCard
                label="λ·W_cycle ≈ N armada"
                value={formatNum(sys.L_sys_little, 2)}
                hint={
                  littleNErr != null
                    ? `N=${sys.N_fleet} · error ${littleNErr > 0 ? "+" : ""}${littleNErr.toFixed(1)}%`
                    : `N armada = ${sys.N_fleet}`
                }
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Kingman — prediksi vs DES</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="W_q Kingman"
                value={
                  sys.W_q_kingman != null
                    ? `${formatNum(sys.W_q_kingman, 3)} mnt`
                    : "∞"
                }
                hint={
                  wqErr != null
                    ? `vs DES: ${wqErr > 0 ? "+" : ""}${wqErr.toFixed(1)}%`
                    : "Prediksi VUT × M/M/c"
                }
              />
              <MetricCard
                label="W_q tanpa variasi"
                value={
                  sys.W_q_kingman_no_var != null
                    ? `${formatNum(sys.W_q_kingman_no_var, 3)} mnt`
                    : "∞"
                }
                hint="cₐ=cₛ=0 → antrian ideal 0 di model ini"
              />
              <MetricCard
                label="Cycle time DES"
                value={`${formatNum(sys.CT_sim, 1)} mnt`}
                hint="Rata-rata siklus sim"
              />
              <MetricCard
                label="CT tanpa variasi"
                value={`${formatNum(sys.CT_no_var, 1)} mnt`}
                hint="≈ waktu produktif saja"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Parameter VUT: tₛ={formatNum(sys.t_s_sys, 2)} mnt · cₐ (variasi datang)=
              {formatNum(sys.c_a_sys, 2)} · cₛ (variasi layan)={formatNum(sys.c_s_sys, 2)} ·
              faktor VUT={formatNum(sys.vut_factor, 3)}. ρ {labels.loader}{" "}
              {formatPct(sys.rho_excavator)} · ρ {labels.hauler} {formatPct(sys.rho_truck)}.
            </p>
          </div>

          <ChartCard
            title="Kurva Kingman — W_q vs utilisasi ρ"
            description="Jika ρ naik (armada loading sibuk), waktu tunggu prediksi naik tajam. Titik operasi sim tidak digambar di sumbu X; bandingkan W_q angka di atas."
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={kingman}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="rho"
                  tick={{ fontSize: 11 }}
                  unit="%"
                  label={{
                    value: "Utilisasi ρ (%)",
                    position: "insideBottom",
                    offset: -2,
                    style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "W_q (mnt)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 8,
                    style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
                  }}
                />
                <Tooltip
                  formatter={(v: number) => [
                    Number.isFinite(v) ? `${Number(v).toFixed(2)} mnt` : "∞",
                    "W_q Kingman",
                  ]}
                  labelFormatter={(r) => `ρ ≈ ${r}%`}
                />
                <Line
                  type="monotone"
                  dataKey="Wq"
                  name="W_q Kingman (mnt)"
                  stroke="#2f4a3e"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cara memakai tab ini</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  Little mendekati: L_q DES ≈ λ·W_q → data antrian sim konsisten.
                </li>
                <li>
                  Kingman lebih besar dari DES sering terjadi saat fleet tertutup / horizon pendek /
                  multi-server tidak persis M/M/c.
                </li>
                <li>
                  Naikkan CV di parameter atau di Perbandingan → cₐ/cₛ naik → W_q prediksi naik
                  (efek variabilitas).
                </li>
                <li>
                  Keputusan fleet tetap dari <strong className="text-foreground">Ringkasan</strong>{" "}
                  dan <strong className="text-foreground">Perbandingan</strong>; tab ini untuk
                  validasi konsep.
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-[var(--radius-xl)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}


