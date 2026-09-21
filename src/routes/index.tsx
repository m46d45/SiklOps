import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  HardHat,
  Menu,
  Play,
  RotateCcw,
  Save,
  FolderOpen,
  X,
} from "lucide-react";
import {
  cycleTimeMean,
  defaultConfig,
  runSimulation,
  type SimulationConfig,
  type SimulationResult,
} from "@/lib/simkon/engine";
import { getOperation, resolveOperationId, type OperationId } from "@/lib/simkon/operations";
import {
  deleteScenario,
  listScenarios,
  saveScenario,
  type SavedScenario,
} from "@/lib/simkon/scenarios";
import { downloadCsv, resultToCsv } from "@/lib/simkon/exportResults";
import { trackSimulation } from "@/lib/simkon/usageClient";
import { OperationSidebar } from "@/components/simkon/OperationSidebar";
import { ParameterPanel } from "@/components/simkon/ParameterPanel";
import { ResultsPanel } from "@/components/simkon/ResultsPanel";
import { ConcretingPanel } from "@/components/simkon/ConcretingPanel";
import { BricklayingPanel } from "@/components/simkon/BricklayingPanel";
import { TowerCranePanel } from "@/components/simkon/TowerCranePanel";
import { AsphaltPavingPanel } from "@/components/simkon/AsphaltPavingPanel";
import { PrecastPlantPanel } from "@/components/simkon/PrecastPlantPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatNum } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: SiklOpsApp });

function SiklOpsApp() {
  const [operationId, setOperationId] = useState<OperationId>("earthmoving");
  const [draft, setDraft] = useState<SimulationConfig>(() => defaultConfig());
  const [result, setResult] = useState<SimulationResult | null>(() =>
    runSimulation(defaultConfig()),
  );
  const [running, setRunning] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarios, setScenarios] = useState<SavedScenario[]>(() =>
    typeof localStorage !== "undefined" ? listScenarios() : [],
  );
  const [showScenarios, setShowScenarios] = useState(false);

  const operation = getOperation(operationId);
  const cycleMean = useMemo(() => cycleTimeMean(draft), [draft]);

  const selectOperation = (id: OperationId) => {
    const op = getOperation(id);
    if (!op.available) return;
    const d = defaultConfig(id);
    setOperationId(id);
    setDraft(d);
    setResult(runSimulation(d));
    setOpsOpen(false);
  };

  const run = () => {
    setRunning(true);
    requestAnimationFrame(() => {
      try {
        const r = runSimulation({ ...draft, operation: operationId });
        setResult(r);
        trackSimulation(operationId);
        requestAnimationFrame(() => {
          document
            .getElementById("hasil-simulasi")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } finally {
        setRunning(false);
      }
    });
  };

  const reset = () => {
    const d = defaultConfig(operationId);
    setDraft(d);
    setResult(runSimulation(d));
  };

  const onSave = () => {
    saveScenario(scenarioName || `${operation.shortTitle} ${new Date().toLocaleString("id-ID")}`, {
      ...draft,
      operation: operationId,
    });
    setScenarios(listScenarios());
    setScenarioName("");
  };

  const onLoad = (s: SavedScenario) => {
    const op = resolveOperationId(s.config.operation);
    setOperationId(op);
    setDraft(s.config);
    setResult(runSimulation(s.config));
    setShowScenarios(false);
  };

  const onExport = () => {
    if (!result) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`siklops-${result.operation}-${stamp}.csv`, resultToCsv(result));
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
              <HardHat className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  SiklOps
                </h1>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                Simulasi siklus operasi konstruksi
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setOpsOpen(true)}>
              <Menu className="h-4 w-4" />
              Operasi
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowScenarios((v) => !v)}>
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Skenario</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onExport} disabled={!result}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/statistik">Statistik</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/manual">Manual</Link>
            </Button>
          </div>
        </div>
      </header>

      {showScenarios ? (
        <div className="border-b border-border bg-muted/30">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Simpan skenario saat ini</p>
                <Input
                  placeholder="Nama skenario…"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                />
              </div>
              <Button type="button" size="sm" onClick={onSave}>
                <Save className="h-4 w-4" />
                Simpan
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Muat skenario tersimpan</p>
              {scenarios.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada skenario di browser ini.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {scenarios.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2"
                    >
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onLoad(s)}>
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.config.operation} · {new Date(s.savedAt).toLocaleString("id-ID")}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          deleteScenario(s.id);
                          setScenarios(listScenarios());
                        }}
                      >
                        Hapus
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border lg:block">
          <div className="sticky top-[4.25rem] flex h-[calc(100dvh-4.25rem)] flex-col p-4">
            <OperationSidebar selected={operationId} onSelect={selectOperation} />
          </div>
        </aside>

        <div className={cn("fixed inset-0 z-50 lg:hidden", opsOpen ? "pointer-events-auto" : "pointer-events-none")}>
          <div
            className={cn(
              "absolute inset-0 bg-foreground/30 transition-opacity duration-[var(--motion-fast)]",
              opsOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setOpsOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(100%,300px)] flex-col bg-card shadow-xl transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              opsOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Pilih operasi</h2>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <OperationSidebar
                selected={operationId}
                onSelect={selectOperation}
                onNavigate={() => setOpsOpen(false)}
              />
            </div>
          </div>
        </div>

        <main className="min-w-0 space-y-6 p-4 pb-16 sm:p-6 lg:pb-10">
          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{operation.title}</CardTitle>
              </div>
              <CardDescription className="max-w-3xl leading-relaxed">
                {operation.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {operation.illustration && operation.id !== "concreting" ? (
                <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-border bg-muted/20 sm:max-w-lg">
                  <img
                    src={operation.illustration}
                    alt={`Ilustrasi proses ${operation.shortTitle}`}
                    className="mx-auto h-auto max-h-48 w-full object-contain object-center sm:max-h-56"
                    loading="lazy"
                  />
                  {operation.illustrationCaption ? (
                    <figcaption className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                      {operation.illustrationCaption}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
              {operation.id !== "concreting" &&
              operation.id !== "bricklaying" &&
              operation.id !== "tower_crane" &&
              operation.id !== "asphalt_paving" &&
              operation.id !== "precast_plant" ? (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Tugas (task)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {operation.tasks.map((step, i) => (
                      <Badge key={step.key} variant="outline" className="font-normal">
                        {i + 1}. {step.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <MetaItem
                  label="Resource"
                  value={
                    operation.id === "concreting"
                      ? "Batching plant · Truck mixer · Buggy / Crane / Pump"
                      : operation.id === "bricklaying"
                        ? "Helper (fetch+lift) · Tukang · Temp & scaffold buffer"
                        : operation.id === "tower_crane"
                          ? "Tower crane · 1–5 work fronts · priority queue"
                          : operation.id === "asphalt_paving"
                            ? "Plant · Dump truck · Paver · Breakdown & finish roller"
                            : operation.id === "precast_plant"
                              ? "Form · Crew · Crane · Cure slots"
                          : `${operation.loaderLabel} · ${operation.haulerLabel}`
                  }
                />
                <MetaItem label="Satuan volume" value={operation.unit} />
                <MetaItem
                  label={
                    operation.id === "concreting" ||
                    operation.id === "bricklaying" ||
                    operation.id === "tower_crane" ||
                    operation.id === "asphalt_paving" ||
                    operation.id === "precast_plant"
                      ? "Model"
                      : "Durasi"
                  }
                  value={
                    operation.id === "concreting"
                      ? "Dual-cycle · 3 metode place"
                      : operation.id === "bricklaying"
                        ? "Triple-cycle · helper A/B + tukang"
                        : operation.id === "tower_crane"
                          ? "Single-server · multi-front priority"
                          : operation.id === "asphalt_paving"
                            ? "Paving train · plant–truck–paver–roller"
                            : operation.id === "precast_plant"
                              ? "Form cycle · crane + cure buffer"
                          : operation.durationUnit
                  }
                />
              </div>
              {operation.id === "concreting" ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Resources
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      {
                        src: "/illustrations/resources/mixing-plant.jpg",
                        label: "Mixing plant",
                      },
                      {
                        src: "/illustrations/resources/truck-mixer.jpg",
                        label: "Truck mixer",
                      },
                      {
                        src: "/illustrations/resources/concrete-buggy.jpg",
                        label: "Concrete buggy",
                      },
                      {
                        src: "/illustrations/resources/tower-crane-bucket.jpg",
                        label: "Tower crane + bucket",
                      },
                      {
                        src: "/illustrations/resources/concrete-pump.jpg",
                        label: "Mobile pump",
                      },
                      {
                        src: "/illustrations/resources/site-buffer.jpg",
                        label: "Site buffer",
                      },
                    ].map((r) => (
                      <figure
                        key={r.label}
                        className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20"
                      >
                        <img
                          src={r.src}
                          alt={r.label}
                          className="mx-auto h-24 w-full object-contain object-center p-1 sm:h-28"
                          loading="lazy"
                        />
                        <figcaption className="border-t border-border px-1.5 py-1.5 text-center text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs">
                          {r.label}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {operation.id === "concreting" ? (
            <ConcretingPanel />
          ) : operation.id === "bricklaying" ? (
            <BricklayingPanel />
          ) : operation.id === "tower_crane" ? (
            <TowerCranePanel />
          ) : operation.id === "asphalt_paving" ? (
            <AsphaltPavingPanel />
          ) : operation.id === "precast_plant" ? (
            <PrecastPlantPanel />
          ) : (
            <>
          <Card className="rounded-[var(--radius-xl)]">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
              <div>
                <CardTitle className="text-base">Parameter simulasi</CardTitle>
                <CardDescription>
                  Resource · tugas · target · seed · biaya · solar/emisi.
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset default
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <ParameterPanel
                draft={draft}
                onChange={setDraft}
                operationId={operationId}
              />
              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground sm:max-w-md">
                  Cycle mean ≈{" "}
                  <span className="font-mono tabular-nums">{formatNum(cycleMean, 1)}</span>{" "}
                  mnt · {draft.num_loaders} {operation.loaderLabel.toLowerCase()} ·{" "}
                  {draft.num_haulers} {operation.haulerLabel.toLowerCase()} · target{" "}
                  {draft.target_cycles} siklus /{" "}
                  <span className="font-mono tabular-nums">{draft.target_volume ?? 0}</span>{" "}
                  {operation.unit} · seed {draft.seed ?? 12345}
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={run}
                  disabled={running || !operation.available}
                >
                  <Play className="h-4 w-4" />
                  {running ? "Menjalankan…" : "Jalankan simulasi"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div id="hasil-simulasi">
            {result ? (
              <ResultsPanel result={result} />
            ) : (
              <Card className="rounded-[var(--radius-xl)]">
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Belum ada hasil. Isi parameter lalu tekan{" "}
                  <strong className="text-foreground">Jalankan simulasi</strong>.
                </CardContent>
              </Card>
            )}
          </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border/80 bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium leading-snug">{value}</p>
    </div>
  );
}
