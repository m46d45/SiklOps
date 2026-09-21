import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Play, Users } from "lucide-react";
import { OPERATIONS } from "@/lib/simkon/operations";
import { useUsageSnapshot } from "@/components/simkon/UsageTracker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNum } from "@/lib/utils";

export const Route = createFileRoute("/statistik")({ component: StatistikPage });

function StatistikPage() {
  const { stats, ready } = useUsageSnapshot();
  const maxRuns = Math.max(1, ...stats.perOperation.map((r) => r.runs));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
              <BarChart3 className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Statistik pemakaian
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Pengunjung & simulasi per operasi
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Simulasi
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4" />
                Pengunjung
              </CardTitle>
              <CardDescription>Pengunjung unik (per perangkat/browser)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Unik (total)" value={ready ? stats.uniqueVisitors : "—"} />
              <Stat label="Kunjungan" value={ready ? stats.totalVisits : "—"} />
              <Stat label="Unik hari ini" value={ready ? stats.uniqueToday : "—"} />
              <Stat label="Kunjungan hari ini" value={ready ? stats.visitsToday : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Play className="h-4 w-4" />
                Simulasi
              </CardTitle>
              <CardDescription>Tombol Jalankan (bukan auto-preview)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Stat label="Total run" value={ready ? stats.totalSimulations : "—"} />
              <Stat label="Hari ini" value={ready ? stats.simulationsToday : "—"} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Simulasi per operasi</CardTitle>
            <CardDescription>Jumlah kali model dijalankan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.perOperation.map((row) => {
              const pct = (row.runs / maxRuns) * 100;
              const op = OPERATIONS.find((o) => o.id === row.id);
              return (
                <div key={row.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{op?.shortTitle ?? row.title}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNum(row.runs, 0)} run
                      {row.lastRun ? (
                        <span className="ml-2 text-[11px]">
                          · terakhir {formatWhen(row.lastRun)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${row.runs ? Math.max(4, pct) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {ready && !stats.persistent ? (
          <p className="rounded-[var(--radius-md)] border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Statistik memakai penyimpanan sementara (PGLite) — angka hilang
            setiap instance serverless. Untuk kuliah masal: di project Vercel{" "}
            <strong>siklops</strong>, buat database Neon lewat{" "}
            <strong>Storage</strong> (atau tempel URI dari console.neon.tech
            sebagai <code className="font-mono">DATABASE_URL</code>), lalu
            Redeploy.
          </p>
        ) : null}
        {ready && stats.persistent ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Backend: Neon/Postgres — angka bertahan antar deploy.
          </p>
        ) : null}

        <p className="pb-6 text-center text-xs text-muted-foreground">
          Satu pengunjung = satu browser (ID acak). Kunjungan di-dedup 15 menit.
          Simulasi per perangkat dibatasi 80/hari agar dashboard tidak di-spam.
          Tidak ada nama atau email.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border/80 bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
