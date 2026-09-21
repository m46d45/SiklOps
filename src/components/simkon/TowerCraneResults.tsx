/**
 * Hasil khusus Tower Crane — tanpa metafor excavator/hauler/dump truck.
 */
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimulationResult } from "@/lib/simkon/engine";
import { computeCosts, formatMoney } from "@/lib/simkon/costs";
import { computeEmissions, formatKg } from "@/lib/simkon/emissions";
import { runMultiSeed, type MultiRunSummary } from "@/lib/simkon/multiRun";
import { MetricCard } from "@/components/simkon/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNum, formatPct } from "@/lib/utils";

export type TowerFrontStat = {
  id: number;
  name: string;
  priority: number;
  lifts: number;
  volume: number;
  wait_avg: number;
  wait_max: number;
  wait_p50: number;
  wait_p90: number;
  wait_total: number;
  requests: number;
  unserved: number;
  starvation_rate: number;
  wait_ratio_vs_p1: number;
  crew_cost_per_hour: number;
  waste_cost: number;
};

type Props = {
  result: SimulationResult & {
    front_stats?: TowerFrontStat[];
    total_waste_cost?: number;
    total_cost_with_waste?: number;
    p1_wait_avg?: number;
  };
};

export function TowerCraneResults({ result }: Props) {
  const unit = "unit";
  const hours = result.simulated_minutes / 60;
  const frontStats = result.front_stats ?? [];
  const costs = computeCosts(result);
  const emissions = computeEmissions(result);

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

  const stopMsg = `Berhenti karena waktu operasi habis (${formatNum(hours, 2)} jam · ${result.total_trips} lift).`;

  const utilData = [
    {
      name: "Tower crane",
      util: Math.round(result.loader_utilization * 1000) / 10,
      fill: "#b06a2b",
    },
  ];

  const frontBar = frontStats.map((s) => ({
    name: s.name.replace(/^Front\s*/, "").slice(0, 18),
    lifts: s.lifts,
    requests: s.requests,
    wait_avg: Math.round((s.wait_avg ?? 0) * 10) / 10,
    wait_max: Math.round((s.wait_max ?? 0) * 10) / 10,
    wait_p90: Math.round((s.wait_p90 ?? 0) * 10) / 10,
    priority: s.priority,
  }));

  const volumeData = result.timeline_volume.map(([t, v]) => ({
    jam: Math.round((t / 60) * 100) / 100,
    volume: Math.round(v * 100) / 100,
  }));

  const queueData = result.queue_over_time.map(([t, q]) => ({
    jam: Math.round((t / 60) * 100) / 100,
    antrian: q,
  }));

  const waitHist = (() => {
    const samples = result.wait_samples ?? [];
    if (!samples.length) return [];
    const max = Math.max(...samples, 1);
    const bins = 8;
    const w = max / bins;
    const counts = Array.from({ length: bins }, () => 0);
    for (const x of samples) {
      const i = Math.min(bins - 1, Math.floor(x / w));
      counts[i] += 1;
    }
    return counts.map((c, i) => ({
      bin: `${formatNum(i * w, 0)}–${formatNum((i + 1) * w, 0)}`,
      count: c,
    }));
  })();

  const servedRate =
    frontStats.reduce((s, f) => s + f.requests, 0) > 0
      ? result.total_trips / frontStats.reduce((s, f) => s + f.requests, 0)
      : 0;

  return (
    <section className="space-y-3" aria-label="Hasil tower crane">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Hasil · Tower Crane</h2>
          <p className="text-sm text-muted-foreground">
            Single server · permintaan Poisson · prioritas non-preemptive
          </p>
        </div>
        <Badge variant="outline" className="font-normal">
          {result.total_trips} lift · {formatNum(result.throughput_per_hour)} {unit}/jam
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{stopMsg}</p>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="h-auto min-h-10 w-full flex-wrap justify-start">
          <TabsTrigger value="summary">Ringkasan</TabsTrigger>
          <TabsTrigger value="fronts">Per front</TabsTrigger>
          <TabsTrigger value="queue">Antrian</TabsTrigger>
          <TabsTrigger value="multi">Multi-seed</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Total lift" value={formatNum(result.total_trips, 0)} />
            <MetricCard
              label={`Volume (${unit})`}
              value={formatNum(result.total_volume, 1)}
            />
            <MetricCard
              label={`Throughput (${unit}/jam)`}
              value={formatNum(result.throughput_per_hour, 1)}
            />
            <MetricCard label="Durasi operasi (jam)" value={formatNum(hours, 2)} />
            <MetricCard
              label="Util tower crane"
              value={formatPct(result.loader_utilization)}
              hint={`${result.config.num_loaders} crane · sibuk ${formatNum(result.loader_busy_minutes, 0)} mnt`}
            />
            <MetricCard
              label="Wait antrian (avg)"
              value={`${formatNum(result.avg_queue_wait, 1)} mnt`}
              hint={`Lq avg ${formatNum(result.avg_queue_length, 2)} · max ${result.max_queue_length}`}
            />
            <MetricCard
              label="Request terlayani"
              value={formatPct(servedRate)}
              hint="Lift / total permintaan front"
            />
            <MetricCard
              label="Bottleneck"
              value={result.bottleneck}
              hint={result.bottleneck_reason}
            />
          </div>

          <Card className="border-primary/25 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Waktu tunggu per front (request → dilayani)</CardTitle>
              <CardDescription>
                Dihitung dari saat front meminta lift sampai crane mulai service. Ini metrik
                utama dampak prioritas & kesibukan crane.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {frontStats.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-[var(--radius-md)] border border-border bg-card/80 p-3"
                  >
                    <p className="text-xs font-medium text-foreground">{s.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Prio {s.priority} · {s.requests} request · {s.lifts} lift
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                      {formatNum(s.wait_avg, 1)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">mnt</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      avg · p50 {formatNum(s.wait_p50 ?? 0, 1)} · p90{" "}
                      {formatNum(s.wait_p90 ?? 0, 1)} · max {formatNum(s.wait_max ?? 0, 1)} mnt
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Starvation{" "}
                      <strong className="text-foreground">
                        {formatPct(s.starvation_rate ?? 0)}
                      </strong>{" "}
                      ({s.unserved ?? 0} unserved) · Wait vs prio-1{" "}
                      <strong className="text-foreground">
                        ×{formatNum(s.wait_ratio_vs_p1 ?? 1, 2)}
                      </strong>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Waste crew{" "}
                      <strong className="text-foreground">
                        {formatMoney(s.waste_cost ?? 0, costs.currency)}
                      </strong>
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Biaya crane"
              value={formatMoney(costs.cost_loader, costs.currency)}
              hint={`${result.config.num_loaders} × ${formatMoney(costs.loader_rate, costs.currency)}/jam × ${formatNum(costs.hours, 2)} jam`}
            />
            <MetricCard
              label="Waste crew (tunggu)"
              value={formatMoney(result.total_waste_cost ?? 0, costs.currency)}
              hint="Σ (wait jam × tarif crew front)"
            />
            <MetricCard
              label="Biaya total + waste"
              value={formatMoney(
                result.total_cost_with_waste ?? costs.cost_total,
                costs.currency,
              )}
              hint="Sewa crane + waste crew di front"
            />
            <MetricCard
              label="Biaya total (crane saja)"
              value={formatMoney(costs.cost_total, costs.currency)}
              hint="Tanpa waste front"
            />
            <MetricCard
              label="Biaya satuan"
              value={
                result.total_volume > 0
                  ? formatMoney(costs.cost_total / result.total_volume, costs.currency)
                  : "—"
              }
              hint={`per ${unit}`}
            />
            <MetricCard
              label="Emisi crane"
              value={formatKg(emissions.emission_loader)}
              hint={`Kerja ${formatNum(emissions.loader_busy_h, 2)} j + idle ${formatNum(emissions.loader_idle_h, 2)} j`}
            />
            <MetricCard
              label="Emisi total"
              value={formatKg(emissions.emission_total)}
            />
            <MetricCard
              label="Emisi satuan"
              value={
                result.total_volume > 0
                  ? `${formatNum(emissions.emission_total / result.total_volume, 2)} kg/${unit}`
                  : "—"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Utilisasi tower crane</CardTitle>
                <CardDescription>Fraksi waktu crane sibuk melayani lift</CardDescription>
              </CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `${formatNum(v, 1)}%`} />
                    <Bar dataKey="util" radius={4}>
                      {utilData.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Volume kumulatif</CardTitle>
                <CardDescription>Unit kerja terlayani vs waktu (jam)</CardDescription>
              </CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="jam" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="volume"
                      name="Volume"
                      stroke="#b06a2b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fronts" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lift & permintaan per front</CardTitle>
              <CardDescription>
                Prio rendah sering wait lebih lama saat crane jenuh (non-preemptive priority).
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frontBar}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="requests" name="Requests" fill="#8a8680" radius={4} />
                  <Bar dataKey="lifts" name="Lifts" fill="#b06a2b" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Waktu tunggu request → service (avg, mnt)</CardTitle>
            </CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frontBar}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="wait_avg" name="Wait avg (request→service)" fill="#3d6b8a" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-x-auto pt-4">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Front</th>
                    <th className="py-2 pr-3 font-medium">Prio</th>
                    <th className="py-2 pr-3 font-medium">Requests</th>
                    <th className="py-2 pr-3 font-medium">Lifts</th>
                    <th className="py-2 pr-3 font-medium">Volume</th>
                    <th className="py-2 pr-3 font-medium">Wait avg</th>
                    <th className="py-2 pr-3 font-medium">vs prio-1</th>
                    <th className="py-2 pr-3 font-medium">Starvation</th>
                    <th className="py-2 pr-3 font-medium">Waste</th>
                    <th className="py-2 pr-3 font-medium">Wait p90</th>
                    <th className="py-2 font-medium">Wait max</th>
                  </tr>
                </thead>
                <tbody>
                  {frontStats.map((s) => (
                    <tr key={s.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">{s.name}</td>
                      <td className="py-2 pr-3">{s.priority}</td>
                      <td className="py-2 pr-3">{s.requests}</td>
                      <td className="py-2 pr-3">{s.lifts}</td>
                      <td className="py-2 pr-3">{formatNum(s.volume, 1)}</td>
                      <td className="py-2 pr-3 font-medium tabular-nums">{formatNum(s.wait_avg, 1)} mnt</td>
                      <td className="py-2 pr-3 tabular-nums">×{formatNum(s.wait_ratio_vs_p1 ?? 1, 2)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatPct(s.starvation_rate ?? 0)} ({s.unserved ?? 0})</td>
                      <td className="py-2 pr-3 tabular-nums">{formatMoney(s.waste_cost ?? 0, costs.currency)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatNum(s.wait_p90 ?? 0, 1)} mnt</td>
                      <td className="py-2 tabular-nums">{formatNum(s.wait_max ?? 0, 1)} mnt</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Panjang antrian request di crane</CardTitle>
              <CardDescription>
                Jumlah front yang menunggu dilayani (bukan hauler di loading)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={queueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="jam" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="stepAfter"
                    dataKey="antrian"
                    name="Antrian"
                    stroke="#3d6b8a"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {waitHist.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribusi waktu tunggu (mnt)</CardTitle>
              </CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitHist}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bin" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Jumlah" fill="#5c6b7a" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Wq rata-rata"
              value={`${formatNum(result.avg_queue_wait, 1)} mnt`}
            />
            <MetricCard
              label="Lq rata-rata"
              value={formatNum(result.avg_queue_length, 2)}
            />
            <MetricCard label="Lq maksimum" value={formatNum(result.max_queue_length, 0)} />
          </div>
        </TabsContent>

        <TabsContent value="multi" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Multi-seed (replikasi)</CardTitle>
              <CardDescription>
                Throughput tower crane — rata-rata ± std dev antar seed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">N seed:</span>
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
                <Button type="button" size="sm" onClick={runMulti} disabled={multiBusy}>
                  {multiBusy ? "Menghitung…" : "Hitung sebaran"}
                </Button>
              </div>
              {multi ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Throughput mean"
                  value={`${formatNum(multi.throughput.mean, 1)} ${unit}/jam`}
                />
                <MetricCard
                  label="Throughput std"
                  value={formatNum(multi.throughput.std, 2)}
                />
                <MetricCard
                  label="Util crane (mean seed)"
                  value={formatPct(
                    multi.results.reduce((s, r) => s + r.loader_utilization, 0) /
                      Math.max(1, multi.results.length),
                  )}
                />
              </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Tekan hitung sebaran untuk mereplikasi seed (maks. 10).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
