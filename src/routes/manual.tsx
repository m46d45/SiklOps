import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { DIESEL_KG_CO2_PER_L } from "@/lib/simkon/engine";
import { OPERATIONS } from "@/lib/simkon/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/manual")({ component: ManualPage });

function ManualPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Manual SiklOps
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Panduan lengkap · DES operasi konstruksi · sederhana → kompleks
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

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {/* TOC */}
        <Card className="rounded-[var(--radius-xl)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daftar isi</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                <a href="#apa" className="text-foreground hover:underline">
                  Apa itu SiklOps?
                </a>
              </li>
              <li>
                <a href="#jalur" className="text-foreground hover:underline">
                  Jalur pembelajaran
                </a>
              </li>
              <li>
                <a href="#alur" className="text-foreground hover:underline">
                  Alur kerja
                </a>
              </li>
              <li>
                <a href="#parameter" className="text-foreground hover:underline">
                  Parameter umum
                </a>
              </li>
              <li>
                <a href="#hasil" className="text-foreground hover:underline">
                  Cara membaca hasil
                </a>
              </li>
              <li>
                <a href="#rumus" className="text-foreground hover:underline">
                  Rumus singkat
                </a>
              </li>
              <li>
                <a href="#earthmoving" className="text-foreground hover:underline">
                  Earthmoving
                </a>
              </li>
              <li>
                <a href="#bricklaying" className="text-foreground hover:underline">
                  Bricklaying
                </a>
              </li>
              <li>
                <a href="#concreting" className="text-foreground hover:underline">
                  Concreting
                </a>
              </li>
              <li>
                <a href="#tower" className="text-foreground hover:underline">
                  Tower Crane
                </a>
              </li>
              <li>
                <a href="#asphalt" className="text-foreground hover:underline">
                  Asphalt paving
                </a>
              </li>
              <li>
                <a href="#precast" className="text-foreground hover:underline">
                  Precast plant
                </a>
              </li>
              <li>
                <a href="#tips" className="text-foreground hover:underline">
                  Tips & FAQ
                </a>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* —— Intro —— */}
        <Card id="apa" className="scroll-mt-20 rounded-[var(--radius-xl)]">
          <CardHeader>
            <CardTitle className="text-base">1. Apa itu SiklOps?</CardTitle>
            <CardDescription className="leading-relaxed">
              <strong className="text-foreground">SiklOps</strong> (Siklus Operasi) adalah
              aplikasi pembelajaran{" "}
              <strong className="text-foreground">Discrete Event Simulation (DES)</strong>{" "}
              untuk operasi konstruksi yang berulang.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Fokus:{" "}
              <strong className="text-foreground">
                throughput, utilisasi resource, antrian, prioritas, buffer, biaya, emisi
              </strong>
              — bukan penjadwalan proyek (WBS / CPM / Gantt).
            </p>
            <p>
              Empat operasi diurutkan dari{" "}
              <strong className="text-foreground">sederhana → kompleks</strong> agar konsep
              DES diperkenalkan bertahap.
            </p>
          </CardContent>
        </Card>

        {/* —— Learning path —— */}
        <section id="jalur" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">2. Jalur pembelajaran</h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Operasi</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Konsep utama</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2">1</td>
                  <td className="px-3 py-2 font-medium text-foreground">Earthmoving</td>
                  <td className="px-3 py-2">1 siklus · multi-server</td>
                  <td className="px-3 py-2">Load–Haul–Dump–Return, match factor, fleet</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2">2</td>
                  <td className="px-3 py-2 font-medium text-foreground">Bricklaying</td>
                  <td className="px-3 py-2">3 siklus · buffer batch</td>
                  <td className="px-3 py-2">Helper multi-tugas, slot scaffold, mortar</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2">3</td>
                  <td className="px-3 py-2 font-medium text-foreground">Concreting</td>
                  <td className="px-3 py-2">2 siklus berinteraksi</td>
                  <td className="px-3 py-2">RMC ↔ placing, site buffer, 3 metode</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2">4</td>
                  <td className="px-3 py-2 font-medium text-foreground">Tower Crane</td>
                  <td className="px-3 py-2">Banyak request · 1 server</td>
                  <td className="px-3 py-2">Poisson, prioritas, starvation, waste crew</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2">5</td>
                  <td className="px-3 py-2 font-medium text-foreground">Asphalt paving</td>
                  <td className="px-3 py-2">Paving train linear</td>
                  <td className="px-3 py-2">Plant–truck–paver–roller, hopper</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">6</td>
                  <td className="px-3 py-2 font-medium text-foreground">Precast plant</td>
                  <td className="px-3 py-2">Form + cure slots</td>
                  <td className="px-3 py-2">Crew, crane, buffer curing</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Sama seperti urutan di sidebar: mulailah dari atas jika baru mengenal DES.
          </p>
        </section>

        <Separator />

        {/* —— Alur —— */}
        <section id="alur" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">3. Alur kerja</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Pilih operasi</strong> di sidebar (Earthmoving
              → Bricklaying → Concreting → Tower Crane).
            </li>
            <li>
              Baca deskripsi, ilustrasi, resource, dan parameter di halaman utama.
            </li>
            <li>
              Atur parameter (resource, mean + distribusi, biaya, target / waktu operasi).
            </li>
            <li>
              Tekan <strong className="text-foreground">Jalankan simulasi</strong>.
            </li>
            <li>
              Baca tab hasil (Ringkasan, Perbandingan, Antrian / Teori — tergantung operasi).
            </li>
            <li>
              Opsional: multi-seed, simpan skenario, export CSV (jika tersedia di operasi itu).
            </li>
          </ol>
        </section>

        <Separator />

        {/* —— Parameter —— */}
        <section id="parameter" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">4. Parameter umum</h2>

          <Card className="rounded-[var(--radius-lg)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Distribusi durasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 text-sm text-muted-foreground">
              <p>
                Hampir semua tugas punya <strong className="text-foreground">mean (menit)</strong>{" "}
                + <strong className="text-foreground">distribusi</strong>:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">Konstan</strong> — tidak acak
                </li>
                <li>
                  <strong className="text-foreground">Normal / Log-normal / Gamma / Beta</strong> —
                  + CV (std/mean)
                </li>
                <li>
                  <strong className="text-foreground">Eksponensial (Poisson)</strong> — inter-arrival
                  request (Tower Crane); CV tetap 1
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[var(--radius-lg)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Biaya & emisi</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1.5 pl-5 text-xs sm:text-sm">
                <li>
                  Input sewa sering dalam <strong className="text-foreground">ribuan Rp/jam</strong>{" "}
                  (×1000). Contoh: 160 = Rp 160.000/jam.
                </li>
                <li>
                  <strong className="text-foreground">All-in</strong> = sewa + operator (jika
                  diaktifkan).
                </li>
                <li>
                  Emisi diesel ≈ L/jam × {DIESEL_KG_CO2_PER_L} kg CO₂/L (kerja & idle terpisah).
                </li>
                <li>
                  Bricklaying default: upah tukang & helper (bukan mesin berat).
                </li>
                <li>
                  Tower Crane: sewa crane + <strong className="text-foreground">waste crew</strong>{" "}
                  per front (tarif crew × jam tunggu).
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[var(--radius-lg)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Kapan simulasi berhenti?</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
              <ul className="list-disc space-y-1.5 pl-5 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">Earthmoving / Bricklaying / Concreting</strong>
                  — target siklus dan/atau target volume (yang lebih dulu), plus batas waktu
                  pengaman.
                </li>
                <li>
                  <strong className="text-foreground">Tower Crane</strong> —{" "}
                  <strong className="text-foreground">waktu operasi maksimum</strong> (default 8
                  jam). Tidak memakai target volume.
                </li>
                <li>
                  <strong className="text-foreground">Seed</strong> — bilangan acak tetap (default
                  12345) agar hasil reproducible.
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* —— Hasil —— */}
        <section id="hasil" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">5. Cara membaca hasil</h2>

          <Card className="rounded-[var(--radius-lg)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Earthmoving · Bricklaying · Concreting</CardTitle>
              <CardDescription>Tab standar: Ringkasan · Perbandingan · Teori antrian</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">Ringkasan</strong> — KPI (trip, volume,
                  thr, util), bottleneck, biaya, emisi, learning curve, util per siklus,
                  antrian, multi-seed, saran desain.
                </li>
                <li>
                  <strong className="text-foreground">Perbandingan</strong> — grid jumlah
                  resource (what-if fleet): thr sim vs teori, util, biaya satuan, emisi satuan,
                  sweet spot.
                </li>
                <li>
                  <strong className="text-foreground">Teori antrian</strong> — Little & Kingman vs
                  DES (modul lanjutan).
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[var(--radius-lg)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Tower Crane (panel khusus)</CardTitle>
              <CardDescription>
                Bukan metafor excavator/hauler — hasil disesuaikan multi-front.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">Ringkasan</strong> — lift, thr, util crane,
                  wait antrian, starvation, wait vs prio-1, biaya crane + waste crew, emisi.
                </li>
                <li>
                  <strong className="text-foreground">Per front</strong> — requests vs lifts, wait
                  avg/p50/p90/max, waste per front.
                </li>
                <li>
                  <strong className="text-foreground">Antrian</strong> — panjang antrian request di
                  crane vs waktu + hist wait.
                </li>
                <li>
                  <strong className="text-foreground">Multi-seed</strong> — sebaran thr / util.
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* —— Rumus —— */}
        <section id="rumus" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">6. Rumus singkat</h2>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Metrik</th>
                  <th className="px-3 py-2 font-medium">Rumus / arti</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Throughput</td>
                  <td className="px-3 py-2">Volume selesai ÷ jam simulasi</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Utilisasi</td>
                  <td className="px-3 py-2">Busy ÷ (n unit × durasi)</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Match factor</td>
                  <td className="px-3 py-2">Kap. hauling / kap. loading (≈1 seimbang)</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Wait (request→service)</td>
                  <td className="px-3 py-2">Waktu dari minta lift sampai crane mulai melayani</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Starvation %</td>
                  <td className="px-3 py-2">Request belum dilayani di akhir shift ÷ total request</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Wait vs prio-1</td>
                  <td className="px-3 py-2">Wait avg front ÷ wait avg front prioritas terbaik</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Waste crew</td>
                  <td className="px-3 py-2">(Σ wait menit / 60) × tarif crew front (Rp/jam)</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Biaya satuan</td>
                  <td className="px-3 py-2">Biaya total ÷ volume</td>
                </tr>
                <tr className="border-b border-border/80">
                  <td className="px-3 py-2 font-medium text-foreground">Emisi</td>
                  <td className="px-3 py-2">
                    Jam kerja × EF kerja + jam idle × EF idle; EF ≈ L/jam × {DIESEL_KG_CO2_PER_L}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-medium text-foreground">Poisson request</td>
                  <td className="px-3 py-2">
                    Inter-arrival ~ Exp(mean); rate λ = 1/mean (permintaan/menit)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <Separator />

        {/* —— Per operasi detail —— */}
        <section className="space-y-6">
          <h2 className="text-sm font-semibold tracking-tight">7. Manual per operasi</h2>

          {/* EARTHMOVING */}
          <Card id="earthmoving" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Earthmoving</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 1 · paling sederhana
                </Badge>
              </div>
              <CardDescription>
                1 siklus · excavator (server load) + dump truck (cycle hauler)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
                <img
                  src="/illustrations/earthmoving-cycle.jpg"
                  alt="Earthmoving"
                  className="mx-auto max-h-48 w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <p>
                <strong className="text-foreground">Siklus:</strong> Load → Haul → Dump → Return.
                Volume per trip = kapasitas bak truck. Produksi dihitung saat dump selesai.
              </p>
              <p>
                <strong className="text-foreground">Parameter kunci:</strong> n excavator, n
                truck, bucket m³, bak m³, mean+dist tiap fase, target siklus/volume, sewa, solar.
              </p>
              <p>
                <strong className="text-foreground">Yang dipelajari:</strong> match factor,
                bottleneck excavator vs truck, util, antrian di loading, biaya & emisi satuan,
                sweet spot fleet di tab Perbandingan.
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                <li>Jalankan default → baca util excavator & truck + bottleneck.</li>
                <li>Ubah n truck ±2 → lihat thr, wait, biaya satuan.</li>
                <li>Buka Perbandingan: cari sweet spot thr vs biaya vs emisi.</li>
                <li>Naikkan CV → antrian dan gap sim–teori biasanya naik.</li>
              </ol>
            </CardContent>
          </Card>

          {/* BRICKLAYING */}
          <Card id="bricklaying" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Bricklaying</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 2 · multi-siklus + buffer
                </Badge>
              </div>
              <CardDescription>
                3 siklus · helper (shared) + tukang + slot buffer batch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
                <img
                  src="/illustrations/bricklaying-cycle.jpg"
                  alt="Bricklaying"
                  className="mx-auto max-h-48 w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <p>
                <strong className="text-foreground">Tugas (masing-masing 1 mean + dist):</strong>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">A Fetch</strong> — helper ambil batch dari
                  pile jauh → temp (jika temp ≤ threshold)
                </li>
                <li>
                  <strong className="text-foreground">B Lift bata</strong> — temp → slot scaffold
                  (hanya jika ada slot kosong 1 batch)
                </li>
                <li>
                  <strong className="text-foreground">B′ Mortar</strong> — ember mortar ke scaffold
                  (tim mortar always-ready di ground)
                </li>
                <li>
                  <strong className="text-foreground">C Pasang</strong> — tukang; butuh bata +
                  mortar di scaffold
                </li>
              </ul>
              <p>
                <strong className="text-foreground">Default buffer:</strong> batch 20 bata ·
                scaffold 3 slot (max 60) · temp 10 slot (max 200) · threshold fetch 60 · 3 ember
                mortar (1 ember ≈ 20 bata) · 1 helper · 2 tukang.
              </p>
              <p>
                <strong className="text-foreground">Yang dipelajari:</strong> shared resource
                (helper multi-tugas), buffer terbatas, siapa menunggu siapa (tukang nunggu stock
                scaffold).
              </p>
            </CardContent>
          </Card>

          {/* CONCRETING */}
          <Card id="concreting" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Concreting (RMC placing)</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 3 · dual-cycle berinteraksi
                </Badge>
              </div>
              <CardDescription>
                2 siklus: truck mixer plant↔site + placing di site (lewat buffer)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Siklus A — Truck mixer:</strong> Batch (plant)
                → Haul → Discharge ke site buffer → Return. Shared untuk semua metode placing.
              </p>
              <p>
                <strong className="text-foreground">Siklus B — Placing</strong> (pilih tab):
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">Buggy</strong> — concrete buggy; jumlah
                  buggy bisa ditambah
                </li>
                <li>
                  <strong className="text-foreground">Crane bucket</strong> — 1 tower crane tetap;
                  jumlah bucket terbatas kapasitas angkat
                </li>
                <li>
                  <strong className="text-foreground">Pump</strong> — mobile pump; jumlah/kecepatan
                  place bisa diubah
                </li>
              </ul>
              <p>
                <strong className="text-foreground">Site scenario (shared):</strong> jarak
                horizontal & tinggi dari titik discharge truk ke pour point — membedakan cycle
                time placing antar metode.
              </p>
              <p>
                <strong className="text-foreground">Coupling:</strong> truck antri jika buffer
                penuh; unit place antri jika buffer kosong. Produksi dihitung saat place selesai.
              </p>
              <p>
                <strong className="text-foreground">Yang dipelajari:</strong> dual-cycle, buffer
                sebagai coupling, perbandingan metode di skenario jarak/tinggi yang sama, biaya
                place vs thr.
              </p>
            </CardContent>
          </Card>

          {/* TOWER CRANE */}
          <Card id="tower" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Tower Crane (multi-front)</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 4 · paling kompleks
                </Badge>
              </div>
              <CardDescription>
                Banyak request · single server · prioritas non-preemptive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
                <img
                  src="/illustrations/tower-crane-multi-front.jpg"
                  alt="Tower crane"
                  className="mx-auto max-h-48 w-full object-contain"
                  loading="lazy"
                />
                <figcaption className="border-t border-border px-3 py-2 text-xs">
                  Yard (material) terpisah → crane → Front A/B/C di bangunan
                </figcaption>
              </figure>
              <p>
                <strong className="text-foreground">Permintaan per front:</strong> proses Poisson
                → inter-arrival default <strong className="text-foreground">Eksponensial</strong>{" "}
                (mean menit antar minta).
              </p>
              <p>
                <strong className="text-foreground">Service:</strong> satu durasi full trip
                yard→front→return (mean + dist). Beda front = beda lokasi = beda mean.
              </p>
              <p>
                <strong className="text-foreground">Antrian:</strong> prioritas 1 (tinggi) → 9
                (rendah), non-preemptive, lalu FIFO. Default front A/B/C = prio 1/2/3.
              </p>
              <p>
                <strong className="text-foreground">Stop:</strong> waktu operasi maks (default 8
                jam). Tidak ada target volume.
              </p>
              <p>
                <strong className="text-foreground">Indikator khusus:</strong>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>
                  <strong className="text-foreground">Wait request→service</strong> (avg, p50,
                  p90, max) per front
                </li>
                <li>
                  <strong className="text-foreground">Starvation %</strong> — request belum
                  dilayani di akhir shift
                </li>
                <li>
                  <strong className="text-foreground">Wait vs prio-1</strong> — seberapa “terhukum”
                  front prioritas rendah
                </li>
                <li>
                  <strong className="text-foreground">Waste crew</strong> — jam tunggu × tarif
                  crew front (Rp/jam, bisa diedit)
                </li>
                <li>Util crane, antrian request, biaya crane + waste, emisi crane</li>
              </ul>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                <li>Jalankan 8 jam default → bandingkan wait & starvation A vs C.</li>
                <li>Tukar prioritas C=1, A=3 → lihat siapa yang “terhukum”.</li>
                <li>Perpendek service mean / naikkan inter-arrival → turunkan util.</li>
                <li>Coba 2 crane → util & wait turun; bandingkan waste crew.</li>
              </ol>
            </CardContent>
          </Card>
        </section>


          {/* ASPHALT */}
          <Card id="asphalt" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Asphalt paving</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 5 · paving train
                </Badge>
              </div>
              <CardDescription>
                Plant → truck → paver hopper → spread → breakdown → finish
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
                <img
                  src="/illustrations/asphalt-paving-cycle.jpg"
                  alt="Asphalt paving"
                  className="mx-auto max-h-48 w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <p>
                <strong className="text-foreground">Model (Halpin Ch.11):</strong> paving train
                linear. Truk hauling hot mix; paver menyebar; roller compact. Produksi m³ dihitung
                saat spread selesai.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>Siklus truck: plant load → haul → dump hopper → return</li>
                <li>Paver: spread 1 muatan; hopper terbatas</li>
                <li>Setiap N spread → breakdown section → finish roller</li>
                <li>What-if: n truck × n paver (tab Perbandingan)</li>
              </ul>
            </CardContent>
          </Card>

          {/* PRECAST */}
          <Card id="precast" className="scroll-mt-20 rounded-[var(--radius-lg)]">
            <CardHeader className="space-y-1 p-4 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm">Precast plant</CardTitle>
                <Badge variant="outline" className="font-normal">
                  Level 6 · form + cure buffer
                </Badge>
              </div>
              <CardDescription>
                Prepare → pour (crane) → cure slots → strip (crane) → clean
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <figure className="mx-auto max-w-md overflow-hidden rounded-[var(--radius-md)] border border-border bg-muted/20">
                <img
                  src="/illustrations/precast-plant-cycle.jpg"
                  alt="Precast plant"
                  className="mx-auto max-h-48 w-full object-contain"
                  loading="lazy"
                />
              </figure>
              <p>
                <strong className="text-foreground">Model (Halpin Ch.13–14):</strong> form cycle di
                pabrik. Slot curing terbatas; crane shared pour+strip. Prioritas dispatch:
                strip → pour → clean → prepare.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
                <li>Resource: form, crew, crane, cure slots</li>
                <li>Produksi dihitung saat strip selesai</li>
                <li>Cure default 12 jam — turunkan untuk demo kelas</li>
                <li>Bottleneck tipikal: crane atau cure slots</li>
              </ul>
            </CardContent>
          </Card>

        {/* Dynamic catalog extras from OPERATIONS */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Ringkasan katalog (otomatis dari app)
          </h2>
          <ul className="space-y-3">
            {OPERATIONS.map((op) => (
              <li key={op.id}>
                <Card className="rounded-[var(--radius-lg)]">
                  <CardHeader className="space-y-1 p-4 pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-sm">{op.shortTitle}</CardTitle>
                      <Badge variant="secondary" className="font-normal text-[10px]">
                        {op.sidebarBlurb}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 p-4 pt-0 text-xs text-muted-foreground">
                    <p className="leading-relaxed">{op.manual.summary}</p>
                    <ol className="list-decimal space-y-1 pl-5">
                      {op.manual.howTo.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                    <p className="leading-relaxed">{op.manual.notes}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        {/* —— Tips —— */}
        <section id="tips" className="scroll-mt-20 space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">8. Tips & FAQ</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Ikuti urutan sidebar: Earthmoving dulu, Tower Crane terakhir.
            </li>
            <li>
              Jangan andalkan satu seed untuk kesimpulan — pakai multi-seed bila ada.
            </li>
            <li>
              Gap sim vs teori besar? Cek variabilitas (CV), antrian, buffer penuh/kosong, atau
              prioritas starvation.
            </li>
            <li>
              <strong className="text-foreground">Earthmoving:</strong> util excavator tinggi +
              truck idle → tambah truck; sebaliknya util truck tinggi + excavator idle → kurangi
              truck atau tambah excavator.
            </li>
            <li>
              <strong className="text-foreground">Bricklaying:</strong> tukang sering wait →
              scaffold/mortar kosong; helper util tinggi → bottleneck supply.
            </li>
            <li>
              <strong className="text-foreground">Concreting:</strong> truck antri = buffer penuh
              (place lambat); place idle = buffer kosong (supply lambat).
            </li>
            <li>
              <strong className="text-foreground">Tower Crane:</strong> starvation tinggi di prio
              rendah = crane jenuh; turunkan laju request, perpendek service, naikkan prio, atau
              tambah crane.
            </li>
            <li>
              Biaya & emisi satuan membantu memutuskan: thr maksimum jarang = biaya/emisi
              minimum.
            </li>
          </ul>
        </section>

        <Separator />

        <section className="space-y-2 text-sm text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">Catatan pengembang</h2>
          <p className="leading-relaxed">
            Operasi baru = entri di katalog <code className="rounded bg-muted px-1 text-xs">operations.ts</code>{" "}
            (termasuk <code className="rounded bg-muted px-1 text-xs">sidebarBlurb</code> + manual)
            + engine DES + panel parameter + (opsional) panel hasil khusus. Sidebar otomatis
            mengikuti urutan array OPERATIONS.
          </p>
        </section>

        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link to="/">Kembali ke simulasi</Link>
          </Button>
        </div>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          SiklOps · Manual lengkap · 6 operasi · DES pembelajaran
        </p>
      </main>
    </div>
  );
}
