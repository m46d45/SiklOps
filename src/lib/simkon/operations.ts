/**
 * Kontrak operasi SiklOps — template standar untuk semua operasi.
 * Earthmoving · Bricklaying · Concreting (3 metode place) memakai interface yang sama.
 */

export type OperationId =
  | "earthmoving"
  | "bricklaying"
  | "concreting"
  | "tower_crane"
  | "asphalt_paving"
  | "precast_plant";

/** Alias lama skenario tersimpan (RMC 3-op → concreting) */
const LEGACY_OP: Record<string, OperationId> = {
  rmc_dolly: "concreting",
  rmc_crane: "concreting",
  rmc_pump: "concreting",
  "rmc-delivery": "concreting",
  concreting_dolly: "concreting",
};

export type OperationTask = {
  key: "load" | "haul" | "dump" | "return";
  label: string;
};

export type OperationInfo = {
  id: OperationId;
  title: string;
  shortTitle: string;
  description: string;
  /**
   * Satu baris di sidebar: model siklus & kompleksitas (sederhana → kompleks).
   */
  sidebarBlurb: string;
  tasks: OperationTask[];
  /** Alias string labels for badges */
  taskLabels: string[];
  loaderLabel: string;
  haulerLabel: string;
  loaderCapacityLabel: string;
  haulerCapacityLabel: string;
  unit: string;
  durationUnit: string;
  sinceVersion: string;
  available: boolean;
  comingIn?: string;
  /** Default cycle means (menit) */
  defaults: {
    num_loaders: number;
    num_haulers: number;
    loader_bucket: number;
    hauler_capacity: number;
    load: number;
    haul: number;
    dump: number;
    return: number;
    target_cycles: number;
    target_volume: number;
    cost_loader: number;
    cost_hauler: number;
    cost_loader_operator: number;
    cost_hauler_operator: number;
    fuel_loader_work: number;
    fuel_loader_idle: number;
    fuel_hauler_work: number;
    fuel_hauler_idle: number;
  };
  manual: {
    summary: string;
    howTo: string[];
    notes: string;
  };
  /** Path public ilustrasi proses lapangan (opsional) */
  illustration?: string;
  illustrationCaption?: string;
};

export const OPERATIONS: OperationInfo[] = [
  {
    id: "earthmoving",
    title: "Earthmoving (galian & angkut)",
    shortTitle: "Earthmoving",
    description:
      "Excavator menggali/memuat material ke dump truck di area cut, truck mengangkut ke spoil/disposal, membongkar (dump), lalu kembali ke area galian untuk dimuat lagi.",
    sidebarBlurb: "1 siklus · excavator + dump truck",
    tasks: [
      { key: "load", label: "Load" },
      { key: "haul", label: "Haul" },
      { key: "dump", label: "Dump" },
      { key: "return", label: "Return" },
    ],
    taskLabels: ["Load", "Haul", "Dump", "Return"],
    loaderLabel: "Excavator",
    haulerLabel: "Dump Truck",
    loaderCapacityLabel: "Kapasitas bucket",
    haulerCapacityLabel: "Kapasitas bak",
    unit: "m³",
    durationUnit: "menit",
    sinceVersion: "1.0",
    available: true,
    defaults: {
      num_loaders: 1,
      num_haulers: 4,
      loader_bucket: 0.5,
      hauler_capacity: 4,
      load: 2.5,
      haul: 10,
      dump: 1.5,
      return: 9,
      target_cycles: 50,
      target_volume: 100,
      cost_loader: 160_000,
      cost_hauler: 125_000,
      cost_loader_operator: 80_000,
      cost_hauler_operator: 60_000,
      fuel_loader_work: 4.1,
      fuel_loader_idle: 1.5,
      fuel_hauler_work: 7.1,
      fuel_hauler_idle: 1.5,
    },
    manual: {
      summary:
        "Level 1 — 1 siklus multi-server. Load–Haul–Dump–Return. Pelajari match factor, util, antrian loading, biaya & emisi satuan, sweet spot fleet.",
      howTo: [
        "Atur n excavator & n dump truck + kapasitas bucket/bak.",
        "Isi mean + distribusi Load–Haul–Dump–Return (menit).",
        "Set target siklus dan/atau volume (m³); jalankan.",
        "Baca Ringkasan lalu Perbandingan (thr sim vs teori, sweet spot).",
      ],
      notes:
        "Volume/trip = kapasitas bak. Match factor ≈ kap. hauling / kap. loading. Default sewa & solar ≈ pasar ID excavator 0,5 m³ & DT 4 m³.",
    },
    illustration: "/illustrations/earthmoving-cycle.jpg",
  },
  {
    id: "bricklaying",
    title: "Bricklaying (pasangan bata)",
    shortTitle: "Bricklaying",
    description:
      "Batch bricklaying: helper fetch pile jauh → temp (slot×batch) → lift batch ke scaffold (3 slot max) + ember mortar (3) → tukang pasang. Mortar team always-ready.",
    sidebarBlurb: "3 siklus · helper + tukang + buffer",
    tasks: [
      { key: "load", label: "Helper fetch (jauh)" },
      { key: "haul", label: "Helper lift bata" },
      { key: "dump", label: "Helper supply mortar" },
      { key: "return", label: "Tukang pasang" },
    ],
    taskLabels: ["Fetch jauh", "Lift bata", "Supply mortar", "Pasang"],
    loaderLabel: "Tukang",
    haulerLabel: "Helper",
    loaderCapacityLabel: "Output pasang / siklus",
    haulerCapacityLabel: "Muatan helper / trip",
    unit: "m²",
    durationUnit: "menit",
    sinceVersion: "1.1",
    available: true,
    defaults: {
      num_loaders: 2,
      num_haulers: 1,
      loader_bucket: 0.25,
      hauler_capacity: 0.35,
      load: 2.8,
      haul: 2.5,
      dump: 0.5,
      return: 0.4,
      target_cycles: 60,
      target_volume: 20,
      cost_loader: 25_000,
      cost_hauler: 18_000,
      cost_loader_operator: 0,
      cost_hauler_operator: 0,
      fuel_loader_work: 0,
      fuel_loader_idle: 0,
      fuel_hauler_work: 0,
      fuel_hauler_idle: 0,
    },
    manual: {
      summary:
        "Level 2 — 4 tugas (fetch, lift, mortar, pasang), masing-masing 1 mean+dist. Helper shared; buffer batch di temp & scaffold; mortar ember terbatas.",
      howTo: [
        "Set helper, tukang, batch, slot scaffold/temp, threshold fetch, ember mortar.",
        "Atur mean+dist: A fetch · B lift · B′ mortar · C pasang.",
        "Set upah tukang/helper (ribu Rp/jam), target m² / siklus, jalankan.",
        "Lihat bottleneck: helper supply vs tukang vs scaffold stock.",
      ],
      notes:
        "1 slot scaffold = 1 batch. Tukang butuh bata + mortar. Volume m² = bata / bricks_per_m2. Default upah mid-ID.",
    },
    illustration: "/illustrations/bricklaying-cycle.jpg",
    illustrationCaption:
      "A Fetch jauh (threshold) · Temp slot×batch · Scaffold 3 slot bata + 3 ember mortar · C Tukang lay.",
  },
  {
    id: "concreting",
    title: "Concreting (RMC placing)",
    shortTitle: "Concreting",
    description:
      "Ready-mixed concrete: truck-mixer cycle (batching plant ↔ site) interacts with on-site placing (concrete buggy, crane bucket, or pump). Compare methods under the same distance & height scenario.",
    sidebarBlurb: "2 siklus berinteraksi · RMC + placing",
    tasks: [
      { key: "load", label: "Fill / charge" },
      { key: "haul", label: "Travel / lift / pump" },
      { key: "dump", label: "Place" },
      { key: "return", label: "Return" },
    ],
    taskLabels: ["Fill", "Travel", "Place", "Return"],
    loaderLabel: "Unit place",
    haulerLabel: "Truck mixer",
    loaderCapacityLabel: "Kapasitas place",
    haulerCapacityLabel: "Kapasitas drum",
    unit: "m³",
    durationUnit: "menit",
    sinceVersion: "1.1",
    available: true,
    defaults: {
      num_loaders: 2,
      num_haulers: 3,
      loader_bucket: 1,
      hauler_capacity: 1,
      load: 2,
      haul: 4,
      dump: 2,
      return: 3,
      target_cycles: 40,
      target_volume: 40,
      cost_loader: 450_000,
      cost_hauler: 280_000,
      cost_loader_operator: 120_000,
      cost_hauler_operator: 80_000,
      fuel_loader_work: 12,
      fuel_loader_idle: 4,
      fuel_hauler_work: 10,
      fuel_hauler_idle: 2,
    },
    manual: {
      summary:
        "Level 3 — dual-cycle: A truck mixer plant↔site + B placing (buggy / crane bucket / pump) lewat site buffer. Skenario jarak & tinggi shared.",
      howTo: [
        "Set site scenario (jarak horizontal + tinggi) dari discharge truk ke pour.",
        "Isi cycle A truck (batch/haul/discharge/return) — shared.",
        "Pilih tab metode placing; atur unit place, kapasitas/sewa; jalankan.",
        "Bandingkan thr, util, biaya satuan, emisi antar metode pada skenario sama.",
      ],
      notes:
        "Truck antri jika buffer penuh; place antri jika buffer kosong. Produksi = place selesai. Crane: 1 TC fixed, bucket ≤ kapasitas angkat.",
    },
  },
  {
    id: "tower_crane",
    title: "Tower Crane (multi-front)",
    shortTitle: "Tower Crane",
    description:
      "Satu tower crane (single server) melayani 1–5 front. Permintaan per front = proses Poisson (Exp). Service = 1 durasi mean+distribusi per front. Prioritas non-preemptive. Stop: waktu operasi (default 8 jam).",
    sidebarBlurb: "Banyak request · 1 server · prioritas",
    tasks: [
      { key: "load", label: "Service crane" },
      { key: "haul", label: "Inter-arrival request" },
      { key: "dump", label: "—" },
      { key: "return", label: "—" },
    ],
    taskLabels: ["Service", "Request interval", "—", "—"],
    loaderLabel: "Tower crane",
    haulerLabel: "Work front",
    loaderCapacityLabel: "Kapasitas angkat (ton)",
    haulerCapacityLabel: "Volume per lift",
    unit: "unit",
    durationUnit: "menit",
    sinceVersion: "1.2",
    available: true,
    defaults: {
      num_loaders: 1,
      num_haulers: 3,
      loader_bucket: 1,
      hauler_capacity: 1,
      load: 1.5,
      haul: 2.5,
      dump: 2,
      return: 1.5,
      target_cycles: 0,
      target_volume: 0,
      cost_loader: 500_000,
      cost_hauler: 0,
      cost_loader_operator: 150_000,
      cost_hauler_operator: 0,
      fuel_loader_work: 12,
      fuel_loader_idle: 4,
      fuel_hauler_work: 0,
      fuel_hauler_idle: 0,
    },
    manual: {
      summary:
        "Level 4 — banyak front minta lift (Poisson/Exp), 1 crane service (1 dist per front), prioritas non-preemptive. Stop = waktu operasi (default 8 jam).",
      howTo: [
        "Aktifkan front A/B/C…; set prioritas 1→9 (default 1,2,3).",
        "Set mean inter-arrival (Exp) + mean service per front; tarif crew untuk waste.",
        "Set waktu operasi maks (jam) + sewa crane; jalankan.",
        "Baca wait request→service, starvation %, wait vs prio-1, waste crew.",
      ],
      notes:
        "KPI khusus TC: util crane, antrian request, starvation, fairness prioritas, biaya crane+waste, emisi crane. Bukan model hauler.",
    },
    illustration: "/illustrations/tower-crane-multi-front.jpg",
    illustrationCaption:
      "MATERIAL YARD (kiri, terpisah) → Tower crane (single server) → Front A/B/C di bangunan (lokasi berbeda). Prioritas 1 = tertinggi.",
  },
  {
    id: "asphalt_paving",
    title: "Asphalt paving (paving train)",
    shortTitle: "Asphalt paving",
    description:
      "Paving train linear: asphalt plant mengisi dump truck → haul ke site → dump ke hopper paver → spread → breakdown roller → finish roller. Produksi dihitung saat paver selesai spread (m³ hot mix).",
    sidebarBlurb: "Paving train · plant + truck + paver + roller",
    tasks: [
      { key: "load", label: "Plant load" },
      { key: "haul", label: "Haul" },
      { key: "dump", label: "Dump hopper" },
      { key: "return", label: "Return" },
    ],
    taskLabels: ["Plant load", "Haul", "Dump", "Return"],
    loaderLabel: "Paver",
    haulerLabel: "Dump truck",
    loaderCapacityLabel: "Kapasitas spread / load",
    haulerCapacityLabel: "Kapasitas bak",
    unit: "m³",
    durationUnit: "menit",
    sinceVersion: "1.3",
    available: true,
    defaults: {
      num_loaders: 1,
      num_haulers: 6,
      loader_bucket: 8,
      hauler_capacity: 8,
      load: 4,
      haul: 12,
      dump: 1.5,
      return: 11,
      target_cycles: 80,
      target_volume: 400,
      cost_loader: 1_200_000,
      cost_hauler: 350_000,
      cost_loader_operator: 150_000,
      cost_hauler_operator: 90_000,
      fuel_loader_work: 18,
      fuel_loader_idle: 5,
      fuel_hauler_work: 12,
      fuel_hauler_idle: 2.5,
    },
    manual: {
      summary:
        "Level linear train — plant, truck, paver (hopper), breakdown & finish roller. Mirip Halpin Ch.11 asphalt paving.",
      howTo: [
        "Set n truck, paver, roller, plant bay, hopper capacity, payload m³.",
        "Isi mean+dist: plant load, haul, dump, return, spread, breakdown, finish.",
        "Set spreads per breakdown section; target siklus/volume; jalankan.",
        "Baca bottleneck (plant / truck / paver / roller) dan thr vs teori.",
      ],
      notes:
        "Produksi m³ = spread selesai. Roller mengikuti section; antrian hopper jika paver lambat.",
    },
    illustration: "/illustrations/asphalt-paving-cycle.jpg",
    illustrationCaption:
      "Plant (kiri, terpisah) → haul → dump ke hopper paver → spread → breakdown roller → finish roller.",
  },
  {
    id: "precast_plant",
    title: "Precast plant (fabrikasi)",
    shortTitle: "Precast plant",
    description:
      "Pabrik precast: form cycle prepare → pour (crew+crane) → cure (slot terbatas) → strip (crew+crane) → clean. Bottleneck klasik: crane, cure slots, crew, atau jumlah form.",
    sidebarBlurb: "Form cycle · crew + crane + cure slots",
    tasks: [
      { key: "load", label: "Prepare" },
      { key: "haul", label: "Pour" },
      { key: "dump", label: "Cure" },
      { key: "return", label: "Strip + clean" },
    ],
    taskLabels: ["Prepare", "Pour", "Cure", "Strip+clean"],
    loaderLabel: "Crew",
    haulerLabel: "Form",
    loaderCapacityLabel: "Volume elemen",
    haulerCapacityLabel: "Volume elemen",
    unit: "m³",
    durationUnit: "menit",
    sinceVersion: "1.3",
    available: true,
    defaults: {
      num_loaders: 2,
      num_haulers: 6,
      loader_bucket: 2.5,
      hauler_capacity: 2.5,
      load: 45,
      haul: 25,
      dump: 720,
      return: 35,
      target_cycles: 20,
      target_volume: 50,
      cost_loader: 180_000,
      cost_hauler: 25_000,
      cost_loader_operator: 0,
      cost_hauler_operator: 0,
      fuel_loader_work: 4,
      fuel_loader_idle: 1.5,
      fuel_hauler_work: 0,
      fuel_hauler_idle: 0,
    },
    manual: {
      summary:
        "Level plant — form, crew, crane, cure slots. Prioritas strip→pour→clean→prepare. Mirip Halpin Ch.13–14 precast plant.",
      howTo: [
        "Set n form, crew, cure slots, crane, volume elemen m³.",
        "Isi mean+dist prepare / pour / cure / strip / clean.",
        "Cure default 12 jam — turunkan untuk demo kelas.",
        "Jalankan; bandingkan util crew, form, crane, cure vs thr teori.",
      ],
      notes:
        "Produksi dihitung saat strip selesai. Cure slots penuh = antrian wait_cure. Crane melayani pour & strip.",
    },
    illustration: "/illustrations/precast-plant-cycle.jpg",
    illustrationCaption:
      "FORM → POUR+CRANE → CURE SLOTS (terbatas) → STRIP → CLEAN → STOCK. Form cycle pabrik precast.",
  },

];

export function resolveOperationId(id: string | undefined | null): OperationId {
  if (!id) return "earthmoving";
  if (id in LEGACY_OP) return LEGACY_OP[id];
  if (OPERATIONS.some((o) => o.id === id)) return id as OperationId;
  return "earthmoving";
}

export function getOperation(id: OperationId | string): OperationInfo {
  const resolved = resolveOperationId(id);
  return OPERATIONS.find((o) => o.id === resolved) ?? OPERATIONS[0];
}

export function listAvailableOperations(): OperationInfo[] {
  return OPERATIONS.filter((o) => o.available);
}

export function phaseLabelsFor(op: OperationId): Record<string, string> {
  const info = getOperation(op);
  const map: Record<string, string> = { wait: "Tunggu" };
  for (const t of info.tasks) map[t.key] = t.label;
  return map;
}
