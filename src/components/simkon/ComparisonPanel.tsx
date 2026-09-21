import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import {
  bestFleetHints,
  COMPARE_HAULERS_MAX,
  runComparisonGrid,
  type ComparisonGrid,
} from "@/lib/simkon/comparison";
import type { SimulationConfig } from "@/lib/simkon/engine";
import { resourceLabels } from "@/lib/simkon/engine";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNum } from "@/lib/utils";

/** Warna seri per jumlah place unit / loader */
const SERIES_COLORS: Record<number, string> = {
  1: "#b06a2b",
  2: "#2f6b4f",
  3: "#3d6b8a",
  4: "#7a4f8a",
};

type Props = {
  baseConfig: SimulationConfig;
};

export function ComparisonPanel({ baseConfig }: Props) {
  const labels = resourceLabels(
    baseConfig.operation,
    baseConfig.placement_method ?? null,
  );
  const unit = labels.unit;
  const [cvSense, setCvSense] = useState(baseConfig.cv ?? 0.2);
  const [grid, setGrid] = useState<ComparisonGrid | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGrid(null);
  }, [baseConfig]);

  const runGrid = () => {
    setBusy(true);
    requestAnimationFrame(() => {
      try {
        setGrid(runComparisonGrid({ ...baseConfig, cv: cvSense }));
      } finally {
        setBusy(false);
      }
    });
  };

  const hints = useMemo(
    () => (grid ? bestFleetHints(grid, labels.loader) : []),
    [grid, labels.loader],
  );

  // Sweet spots per loader/place count
  const sweet = useMemo(() => {
    const out: Array<{ nL: number; costH: number; emiH: number; thrH: number }> = [];
    if (!grid) return out;
    for (const nL of grid.loaders) {
      const cells = grid.cells.filter((c) => c.num_loaders === nL);
      if (!cells.length) continue;
      let cBest = cells[0];
      let eBest = cells[0];
      let tBest = cells[0];
      for (const c of cells) {
        if (c.unit_cost > 0 && c.unit_cost < cBest.unit_cost) cBest = c;
        if (c.unit_emission > 0 && c.unit_emission < eBest.unit_emission) eBest = c;
        if (c.throughput > tBest.throughput) tBest = c;
      }
      out.push({
        nL,
        costH: cBest.num_haulers,
        emiH: eBest.num_haulers,
        thrH: tBest.num_haulers,
      });
    }
    return out;
  }, [grid]);

  return (
    <div className="space-y-4">
      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Apa yang dibandingkan?</CardTitle>
          <CardDescription className="leading-relaxed">
            Parameter cycle, kapasitas, distribusi, target, dan seed diambil dari setup
            simulasi saat ini. Yang di-sweep:{" "}
            <strong className="text-foreground">{labels.loader} 1–3</strong> dan{" "}
            <strong className="text-foreground">{labels.hauler} 1–{COMPARE_HAULERS_MAX}</strong>.{" "}
            Sumbu X = jumlah {labels.hauler}; tiap warna = jumlah {labels.loader}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Grafik yang ditampilkan</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Throughput ({unit}/jam)</strong> —
              simulasi (tebal) vs{" "}
              <strong className="text-foreground">teoritis</strong> (putus-putus):{" "}
              min(kap. loading, kap. hauling) tanpa antrian & variasi.
            </li>
            <li>
              <strong className="text-foreground">Utilisasi {labels.loader}</strong> —
              loading bottleneck vs under-utilized.
            </li>
            <li>
              <strong className="text-foreground">Utilisasi {labels.hauler}</strong> —
              apakah armada angkut jenuh.
            </li>
            <li>
              <strong className="text-foreground">Waktu tunggu antri rata-rata</strong> —
              trade-off hauler ekstra vs antrian di loading.
            </li>
            <li>
              <strong className="text-foreground">Panjang antrian rata-rata</strong> —
              kepadatan antrian di loading.
            </li>
            <li>
              <strong className="text-foreground">Biaya satuan pekerjaan</strong> —
              biaya fleet total ÷ volume (cari yang rendah).
            </li>
            <li>
              <strong className="text-foreground">Biaya waiting (waste)</strong> —
              jam·unit antri × tarif truck (pemborosan).
            </li>
            <li>
              <strong className="text-foreground">Emisi satuan (kg CO₂e/m³)</strong> —
              intensitas karbon; bandingkan sweet spot vs biaya.
            </li>
            <li>
              <strong className="text-foreground">Emisi waiting (waste karbon)</strong> —
              CO₂e dari truck mengantri.
            </li>
          </ol>
          <p className="pt-1 text-xs">
            {baseConfig.operation === "concreting" ? (
              <>
                Teori dual-cycle: place = n<sub>P</sub> × (60 / t<sub>place</sub>) ×
                place_cap; truck = n<sub>T</sub> × (60 / t<sub>truck</sub>) × drum_cap;
                sistem = min(place, truck). Place cycle mean ≈{" "}
                <span className="font-mono tabular-nums">
                  {formatNum(grid?.cycleMeanMin ?? 0, 1)}
                </span>{" "}
                mnt.
              </>
            ) : (
              <>
                Teori loading: n<sub>L</sub> × (60 / t<sub>load</sub>) × payload. Teori
                hauling: n<sub>H</sub> × (60 / t<sub>cycle</sub>) × payload (cycle =
                load+haul+dump+return, tanpa tunggu). Cycle mean setup ≈{" "}
                <span className="font-mono tabular-nums">
                  {formatNum(grid?.cycleMeanMin ?? 0, 1)}
                </span>{" "}
                mnt.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sensitivitas CV (variabilitas)</CardTitle>
          <CardDescription>
            Ulangi grid dengan CV global {cvSense.toFixed(2)} (distribusi non-konstan memakai CV ini
            lewat re-sim). Bandingkan bentuk kurva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label>CV</Label>
              <span className="font-mono tabular-nums">{cvSense.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={0.6}
              step={0.05}
              value={[cvSense]}
              onValueChange={([v]) => {
                setCvSense(v);
                setGrid(null);
              }}
            />
            <Button type="button" onClick={runGrid} disabled={busy} className="mt-2">
              {busy ? "Menghitung grid…" : "Hitung perbandingan"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Grid menjalankan puluhan simulasi di browser. Tidak jalan otomatis
              agar HP/Chromebook di kelas tidak freeze.
            </p>
          </div>
        </CardContent>
      </Card>

      {!grid ? (
        <p className="text-sm text-muted-foreground">
          Tekan <strong className="text-foreground">Hitung perbandingan</strong> untuk
          menggambar kurva fleet.
        </p>
      ) : (
        <>

      <ThroughputChart
        unit={unit}
        data={grid.byHauler}
        loaders={grid.loaders}
        loaderCeilings={grid.loaderCeilings}
        op={baseConfig.operation}
        method={baseConfig.placement_method}
      />

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sweet spot fleet</CardTitle>
          <CardDescription>
            Titik optimal per jumlah {labels.loader} — throughput puncak vs min biaya vs min emisi
            (bisa beda).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {sweet.map((s) => (
              <li key={s.nL}>
                <strong className="text-foreground">
                  {labels.loader} ×{s.nL}:
                </strong>{" "}
                max thr @ {s.thrH} {labels.hauler.toLowerCase()} · min biaya @ {s.costH} · min
                emisi @ {s.emiH}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompareChart
          title={`Utilisasi ${labels.loader} (%)`}
          description="Sibuk loading. Turun tajam saat truck kurang (menunggu haul)."
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="utilL_"
          yUnit="%"
          yDomain={[0, 100]}
        />
        <CompareChart
          title={`Utilisasi ${labels.hauler} (%)`}
          description="Sibuk load+haul+dump+return. Turun saat truck berlebih (antrian/idle)."
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="utilH_"
          yUnit="%"
          yDomain={[0, 100]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompareChart
          title="Waktu tunggu antri rata-rata (mnt)"
          description={`Rata-rata ${labels.hauler.toLowerCase()} menunggu ${labels.loader.toLowerCase()} per cycle.`}
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="wait_"
          yUnit="mnt"
          yDomain={[0, "auto"]}
        />
        <CompareChart
          title="Panjang antrian rata-rata"
          description={`Time-weighted rata-rata jumlah ${labels.hauler.toLowerCase()} mengantri di place/loading.`}
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="qlen_"
          yUnit="unit"
          yDomain={[0, "auto"]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompareChart
          title={`Biaya satuan pekerjaan (${baseConfig.cost_currency || "Rp"}/${unit})`}
          description="Biaya sewa fleet selama sim ÷ volume. Ideal: turun lalu naik (U-shape) saat truck berlebih."
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="ucost_"
          yUnit={`${baseConfig.cost_currency || "Rp"}/${unit}`}
          yDomain={[0, "auto"]}
          money
        />
        <CompareChart
          title={`Biaya waiting / waste (${baseConfig.cost_currency || "Rp"})`}
          description={`Jam·unit tunggu × tarif ${labels.hauler.toLowerCase()}. Naik saat armada hauler menumpuk di antrian.`}
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="wcost_"
          yUnit={baseConfig.cost_currency || "Rp"}
          yDomain={[0, "auto"]}
          money
        />
      </div>

      <CompareChart
        title={`Waste waiting per volume (${baseConfig.cost_currency || "Rp"}/${unit})`}
        description="Biaya waiting ÷ volume — intensitas pemborosan per m³."
        data={grid.byHauler}
        loaders={grid.loaders}
        yKeyPrefix="wucost_"
        yUnit={`${baseConfig.cost_currency || "Rp"}/${unit}`}
        yDomain={[0, "auto"]}
        money
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CompareChart
          title={`Emisi satuan (kg CO₂e/${unit})`}
          description="Total emisi ÷ volume. Cari titik rendah; bandingkan dengan min biaya satuan."
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="uemi_"
          yUnit={`kg/${unit}`}
          yDomain={[0, "auto"]}
        />
        <CompareChart
          title="Emisi waiting / waste karbon (kg CO₂e)"
          description={`Jam antri ${labels.hauler.toLowerCase()} × EF idle. Naik saat fleet hauler berlebih.`}
          data={grid.byHauler}
          loaders={grid.loaders}
          yKeyPrefix="wemi_"
          yUnit="kg CO₂e"
          yDomain={[0, "auto"]}
        />
      </div>

      <CompareChart
        title={`Waste karbon per volume (kg CO₂e/${unit})`}
        description="Emisi waiting ÷ volume — intensitas pemborosan karbon."
        data={grid.byHauler}
        loaders={grid.loaders}
        yKeyPrefix="wuemi_"
        yUnit={`kg/${unit}`}
        yDomain={[0, "auto"]}
      />

      <Card className="rounded-[var(--radius-xl)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Petunjuk fleet (throughput · biaya · emisi)</CardTitle>
          <CardDescription>
            Puncak produksi, min biaya satuan, dan min emisi satuan bisa di truck count berbeda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Basis: {baseConfig.num_loaders} {labels.loader.toLowerCase()} ·{" "}
            {baseConfig.num_haulers} {labels.hauler.toLowerCase()} ·
            payload {formatNum(baseConfig.payload_per_trip, 2)} {unit}/trip · seed{" "}
            {baseConfig.seed ?? "—"} · target {baseConfig.target_cycles} siklus /{" "}
            {formatNum(baseConfig.target_volume ?? 0, 0)} {unit}
          </p>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}

function ThroughputChart({
  unit,
  data,
  loaders,
  loaderCeilings,
  op,
  method,
}: {
  unit: string;
  data: Array<Record<string, number>>;
  loaders: readonly number[];
  loaderCeilings: Record<number, number>;
  op?: SimulationConfig["operation"];
  method?: SimulationConfig["placement_method"];
}) {
  const labels = resourceLabels(op, method ?? null);
  return (
    <Card className="rounded-[var(--radius-xl)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Throughput ({unit}/jam) — sim vs teoritis</CardTitle>
        <CardDescription className="leading-relaxed">
          <strong className="text-foreground">Tebal</strong> = DES (antrian, buffer, variasi, who-waits).{" "}
          <strong className="text-foreground">Putus-putus</strong> = batas atas teoritis tanpa
          antrian: min(kap. place, kap. truck). Dual-cycle RMC: place = n<sub>P</sub>×(60/t
          <sub>place</sub>)×place_cap; truck = n<sub>T</sub>×(60/t<sub>truck</sub>)×drum. Sim
          biasanya <em>di bawah</em> teori (gap 5–25% normal); gap besar berarti masih ada
          bottleneck/interferensi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="haulers"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
              label={{
                value: `Jumlah ${labels.hauler}`,
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
              }}
            />
            <YAxis
              domain={[0, "auto"]}
              tick={{ fontSize: 11 }}
              width={52}
              tickFormatter={(v) => Number(v).toFixed(0)}
              label={{
                value: `${unit}/jam`,
                angle: -90,
                position: "insideLeft",
                offset: 8,
                style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
              }}
            />
            <Tooltip
              formatter={(v: number, name: string) => [
                `${Number(v).toFixed(1)} ${unit}/jam`,
                name,
              ]}
              labelFormatter={(h) => `${labels.hauler}: ${h}`}
            />
            <Legend />
            {loaders.map((nL) => (
              <Line
                key={`sim-${nL}`}
                type="monotone"
                dataKey={`thr_${nL}`}
                name={`${labels.loader} ×${nL} (sim)`}
                stroke={SERIES_COLORS[nL] ?? "#555"}
                strokeWidth={2.75}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
            {loaders.map((nL) => (
              <Line
                key={`th-${nL}`}
                type="monotone"
                dataKey={`thrT_${nL}`}
                name={`${labels.loader} ×${nL} (teori)`}
                stroke={SERIES_COLORS[nL] ?? "#555"}
                strokeWidth={2}
                strokeDasharray="7 4"
                dot={false}
                opacity={0.85}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {loaders.map((nL) => (
            <li key={nL}>
              Plafon place teori ×{nL}:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatNum(loaderCeilings[nL] ?? 0, 1)}
              </span>{" "}
              {unit}/jam
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatAxisMoney(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return n.toFixed(0);
}

function CompareChart({
  title,
  description,
  data,
  loaders,
  yKeyPrefix,
  yUnit,
  yDomain,
  money = false,
}: {
  title: string;
  description: string;
  data: Array<Record<string, number>>;
  loaders: readonly number[];
  yKeyPrefix: string;
  yUnit: string;
  yDomain: [number, number | "auto"];
  money?: boolean;
}) {
  const labels = resourceLabels();
  return (
    <Card className="rounded-[var(--radius-xl)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="haulers"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
              label={{
                value: `Jumlah ${labels.hauler}`,
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "var(--color-muted-foreground)" },
              }}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 11 }}
              width={money ? 56 : 48}
              tickFormatter={(v) =>
                money
                  ? formatAxisMoney(Number(v))
                  : yUnit === "%"
                    ? `${v}`
                    : Number(v).toFixed(yUnit === "mnt" ? 1 : 0)
              }
            />
            <Tooltip
              formatter={(v: number, name: string) => [
                money
                  ? `${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 0 })} ${yUnit}`
                  : yUnit === "%"
                    ? `${Number(v).toFixed(1)}%`
                    : `${Number(v).toFixed(2)} ${yUnit}`,
                name,
              ]}
              labelFormatter={(h) => `${labels.hauler}: ${h}`}
            />
            <Legend />
            {loaders.map((nL) => (
              <Line
                key={nL}
                type="monotone"
                dataKey={`${yKeyPrefix}${nL}`}
                name={`${labels.loader} ×${nL}`}
                stroke={SERIES_COLORS[nL] ?? "#555"}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
