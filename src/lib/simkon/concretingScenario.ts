/**
 * Skenario site concreting: jarak & tinggi dari titik discharge truck RMC
 * ke lokasi place. Menurunkan cycle place per metode (dolly / crane / pump).
 */

import {
  applyRmcToConfig,
  type PlacementMethod,
} from "./rmcEngine";
import {
  defaultConfig,
  emissionsFromFuel,
  fromMeanCv,
  runSimulation,
  type DistKind,
  type DurationDist,
  type SimulationConfig,
  type SimulationResult,
} from "./engine";

export type SiteScenario = {
  /** Jarak horizontal truck discharge → titik place (m) */
  distance_m: number;
  /** Tinggi vertikal (m), 0 = lantai yang sama */
  height_m: number;
  /** Target volume cor (m³) */
  target_volume: number;
  /** Jumlah truck mixer (shared) */
  num_trucks: number;
  truck_capacity_m3: number;
  /** Cycle truck plant↔site (menit) — shared */
  truck_batch_mean: number;
  truck_haul_mean: number;
  truck_discharge_mean: number;
  truck_return_mean: number;
  /** Distribusi per fase truck (sama pola earthmoving) */
  truck_batch_dist: DurationDist;
  truck_haul_dist: DurationDist;
  truck_discharge_dist: DurationDist;
  truck_return_dist: DurationDist;
  cv: number;
  default_dist_kind: DistKind;
  buffer_capacity_m3: number;
  seed: number;
  target_cycles: number;
};

function truckDist(mean: number, cv = 0.2, kind: DistKind = "normal"): DurationDist {
  return fromMeanCv(mean, cv, kind);
}

export const DEFAULT_SITE: SiteScenario = {
  distance_m: 40,
  height_m: 6,
  target_volume: 40,
  num_trucks: 3,
  truck_capacity_m3: 7,
  truck_batch_mean: 5,
  truck_haul_mean: 18,
  truck_discharge_mean: 4,
  truck_return_mean: 16,
  truck_batch_dist: truckDist(5),
  truck_haul_dist: truckDist(18),
  truck_discharge_dist: truckDist(4),
  truck_return_dist: truckDist(16),
  cv: 0.2,
  default_dist_kind: "normal",
  buffer_capacity_m3: 8,
  seed: 12345,
  target_cycles: 40,
};

export type MethodProfile = {
  method: PlacementMethod;
  label: string;
  shortLabel: string;
  placeLabel: string;
  description: string;
  /** Fase siklus place (ditampilkan di tab) */
  tasks: string[];
  /** Kapasitas per cycle place (m³) */
  place_capacity_m3: number;
  /** Debit teoritis pompa (m³/jam) — hanya relevan untuk pump */
  pump_rate_m3_per_h?: number;
  num_place: number;
  /** Catatan singkat default pasar ID */
  market_note: string;
  cost_place_per_hour: number;
  cost_truck_per_hour: number;
  cost_place_op: number;
  cost_truck_op: number;
  fuel_place_work: number;
  fuel_place_idle: number;
  fuel_truck_work: number;
  fuel_truck_idle: number;
  illustration: string;
  /** false = jumlah unit fixed (mis. 1 tower crane) */
  fleet_flexible: boolean;
  max_place_units: number;
};

export const METHOD_PROFILES: Record<PlacementMethod, MethodProfile> = {
  dolly: {
    method: "dolly",
    label: "Concrete Buggy",
    shortLabel: "Buggy",
    placeLabel: "Concrete buggy",
    description:
      "Power/hand concrete buggy from truck-mixer discharge to pour point. Best for short distance and low height.",
    tasks: ["Fill buggy", "Travel", "Place", "Return empty"],
    // Power buggy ~16 cu ft ≈ 0,45–0,5 m³ (pasar alat Indonesia / setara)
    place_capacity_m3: 0.5,
    num_place: 4,
    // Sewa power buggy kasar ID: ~Rp 50–100 rb/jam; default mid + operator
    cost_place_per_hour: 75_000,
    cost_truck_per_hour: 350_000,
    cost_place_op: 60_000,
    cost_truck_op: 100_000,
    fuel_place_work: 1.5,
    fuel_place_idle: 0.3,
    fuel_truck_work: 10,
    fuel_truck_idle: 2,
    illustration: "/illustrations/rmc-dolly-cycle.jpg",
    fleet_flexible: true,
    max_place_units: 20,
    market_note:
      "Default ID: power buggy ~0,5 m³; sewa ±Rp 75 rb/jam + operator ±Rp 60 rb/jam (estimasi edukatif).",
  },
  crane: {
    method: "crane",
    label: "Tower Crane + Bucket",
    shortLabel: "Crane",
    placeLabel: "Crane bucket",
    description:
      "1 tower crane tetap; bucket diisi di ground lalu diangkat. Jumlah bucket 1–3 (sirkulasi), tidak melebihi kapasitas angkat crane.",
    tasks: ["Fill bucket", "Lift / swing", "Place", "Return bucket"],
    // Bucket beton crane umum 0,5–1,5 m³; default 1 m³
    place_capacity_m3: 1,
    num_place: 1,
    // TC sewa bulanan ~Rp 80–100 jt / ~200 jam kerja ≈ Rp 400–500 rb/jam + op
    cost_place_per_hour: 500_000,
    cost_truck_per_hour: 350_000,
    cost_place_op: 150_000,
    cost_truck_op: 100_000,
    fuel_place_work: 12,
    fuel_place_idle: 4,
    fuel_truck_work: 10,
    fuel_truck_idle: 2,
    illustration: "/illustrations/rmc-crane-cycle.jpg",
    // Jumlah yang di-sweep = bucket (bukan crane); crane fixed 1
    fleet_flexible: true,
    max_place_units: 3,
    market_note:
      "Default ID: 1 tower crane + bucket 1 m³; sewa TC ±Rp 500 rb/jam + op ±Rp 150 rb/jam. Bucket max 3 (kapasitas angkat crane).",
  },
  pump: {
    method: "pump",
    label: "Concrete Pump",
    shortLabel: "Pump",
    placeLabel: "Concrete pump",
    description:
      "Pompa mobile/line dari hopper (isi truck) ke titik cor. Cocok jarak/tinggi besar, volume kontinu.",
    tasks: ["Charge hopper", "Pump (line)", "Place", "Reset hose tip"],
    // Volume per pulse cycle DES; debit teoritis terpisah
    place_capacity_m3: 0.75,
    pump_rate_m3_per_h: 30,
    num_place: 1,
    // Mini/mobile pump ~Rp 3,5–4 jt / 8 jam → ±Rp 450 rb/jam
    cost_place_per_hour: 450_000,
    cost_truck_per_hour: 350_000,
    cost_place_op: 120_000,
    cost_truck_op: 100_000,
    fuel_place_work: 18,
    fuel_place_idle: 5,
    fuel_truck_work: 10,
    fuel_truck_idle: 2,
    illustration: "/illustrations/rmc-pump-cycle.jpg",
    fleet_flexible: true,
    max_place_units: 4,
    market_note:
      "Default ID: mobile/line pump debit teoritis ±30 m³/jam; sewa ±Rp 450 rb/jam (setara ~Rp 3,6 jt/shift 8 jam) + crew.",
  },
};

export type DerivedPlaceCycle = {
  fill_mean: number;
  travel_mean: number;
  place_mean: number;
  return_mean: number;
  /** total place cycle menit */
  cycle_mean: number;
  feasible: boolean;
  suitability: "baik" | "sedang" | "buruk";
  note: string;
};

/** Turunkan cycle place (menit) dari jarak & tinggi skenario site */
export function derivePlaceCycle(
  method: PlacementMethod,
  distance_m: number,
  height_m: number,
): DerivedPlaceCycle {
  const D = Math.max(0, distance_m);
  const H = Math.max(0, height_m);

  if (method === "dolly") {
    // dorong ~25–35 m/mnt; naik tangga/rampa lambat
    const vHoriz = 30; // m/mnt
    const vClimb = 6; // m/mnt (tangga/rampa)
    const oneWay = D / vHoriz + H / vClimb;
    const fill = 1.2 + 0.3 * Math.min(H, 3);
    const travel = Math.max(0.8, oneWay);
    const place = 1.2;
    const ret = Math.max(0.7, oneWay * 0.85);
    const cycle = fill + travel + place + ret;
    let suitability: DerivedPlaceCycle["suitability"] = "baik";
    let feasible = true;
    let note = "Buggy is efficient for short distance and low height.";
    if (H > 4 || D > 60) {
      suitability = "buruk";
      note =
        "Large distance/height — buggy is slow. Prefer crane or pump.";
    } else if (H > 2 || D > 35) {
      suitability = "sedang";
      note = "Buggy still possible, but travel time becomes significant.";
    }
    if (H > 12) {
      feasible = false;
      note = "Extreme height for manual buggy — not realistic without hoist.";
    }
    return {
      fill_mean: round1(fill),
      travel_mean: round1(travel),
      place_mean: round1(place),
      return_mean: round1(ret),
      cycle_mean: round1(cycle),
      feasible,
      suitability,
      note,
    };
  }

  if (method === "crane") {
    // hoist ~20 m/mnt, trolley/swing horizontal ~40 m/mnt
    const vHoist = 22;
    const vTrolley = 40;
    const oneWay = H / vHoist + D / vTrolley;
    const fill = 1.8;
    const travel = Math.max(1.2, oneWay + 0.5); // +hook change
    const place = 1.5;
    const ret = Math.max(1.0, oneWay * 0.9);
    const cycle = fill + travel + place + ret;
    let suitability: DerivedPlaceCycle["suitability"] = "baik";
    let note = "Crane fits multi-storey structures and medium bucket volume.";
    if (H < 2 && D < 15) {
      suitability = "sedang";
      note = "Low/close pour — crane may be overspec; buggy or mini-pump can be cheaper.";
    } else if (D > 80) {
      suitability = "sedang";
      note = "Large horizontal reach — check crane radius.";
    }
    if (H > 80) {
      note = "Very large height — check hoist capacity and lift cycle.";
      suitability = "sedang";
    }
    return {
      fill_mean: round1(fill),
      travel_mean: round1(travel),
      place_mean: round1(place),
      return_mean: round1(ret),
      cycle_mean: round1(cycle),
      feasible: true,
      suitability,
      note,
    };
  }

  // pump — cycle per pulse volume; waktu place mendekati debit teoritis (~30 m³/jam default)
  // setup charge + pumping line + tip place + reset; line time naik dengan D & H
  const fill = 0.5; // charge hopper dari buffer
  const line = Math.max(0.4, D / 120 + H / 60); // resistansi pipa (mnt)
  const place = 0.6; // di ujung hose
  const ret = 0.35; // reset tip
  const travel = Math.max(0.6, 0.5 + line); // "pump through line"
  const cycle = fill + travel + place + ret;
  let suitability: DerivedPlaceCycle["suitability"] = "baik";
  let note = "Pump excels for significant distance/height and continuous volume.";
  if (D < 15 && H < 3) {
    suitability = "sedang";
    note = "Small distance/height — pump cost may not justify vs buggy.";
  } else if (D > 120 || H > 40) {
    suitability = "sedang";
    note = "Extreme reach — check boom/line pressure specs.";
  }
  return {
    fill_mean: round1(fill),
    travel_mean: round1(travel),
    place_mean: round1(place),
    return_mean: round1(ret),
    cycle_mean: round1(cycle),
    feasible: true,
    suitability,
    note,
  };
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

export const PLACE_METHODS: PlacementMethod[] = ["dolly", "crane", "pump"];

/** Bangun config simulasi dari skenario site + metode place */
export function buildConcretingConfig(
  site: SiteScenario,
  method: PlacementMethod,
  overrides?: Partial<SimulationConfig> & { num_place?: number },
): SimulationConfig {
  const profile = METHOD_PROFILES[method];
  const derived = derivePlaceCycle(method, site.distance_m, site.height_m);
  const base = defaultConfig("concreting");
  const numPlace = overrides?.num_place ?? profile.num_place;

  return applyRmcToConfig(
    {
      ...base,
      operation: "concreting",
      placement_method: method,
      place_distance_m: site.distance_m,
      place_height_m: site.height_m,
      target_volume: site.target_volume,
      target_cycles: site.target_cycles,
      seed: site.seed,
      stop_mode: "either",
      cv: site.cv,
      default_dist_kind: site.default_dist_kind,
      truck_batch_dist: site.truck_batch_dist,
      truck_haul_dist: site.truck_haul_dist,
      truck_discharge_dist: site.truck_discharge_dist,
      truck_return_dist: site.truck_return_dist,
      cost_loader_per_hour: profile.cost_place_per_hour,
      cost_hauler_per_hour: profile.cost_truck_per_hour,
      cost_loader_operator_per_hour: profile.cost_place_op,
      cost_hauler_operator_per_hour: profile.cost_truck_op,
      fuel_loader_work_lph: profile.fuel_place_work,
      fuel_loader_idle_lph: profile.fuel_place_idle,
      fuel_hauler_work_lph: profile.fuel_truck_work,
      fuel_hauler_idle_lph: profile.fuel_truck_idle,
      emission_loader_work_kg_per_h: emissionsFromFuel(profile.fuel_place_work),
      emission_loader_idle_kg_per_h: emissionsFromFuel(profile.fuel_place_idle),
      emission_hauler_work_kg_per_h: emissionsFromFuel(profile.fuel_truck_work),
      emission_hauler_idle_kg_per_h: emissionsFromFuel(profile.fuel_truck_idle),
      ...overrides,
    },
    {
      operation: "concreting",
      placement_method: method,
      num_trucks: site.num_trucks,
      num_place: numPlace,
      truck_capacity_m3: site.truck_capacity_m3,
      place_capacity_m3:
        overrides?.place_capacity_m3 ?? profile.place_capacity_m3,
      buffer_capacity_m3: site.buffer_capacity_m3,
      truck_batch_mean: site.truck_batch_mean,
      truck_haul_mean: site.truck_haul_mean,
      truck_discharge_mean: site.truck_discharge_mean,
      truck_return_mean: site.truck_return_mean,
      place_fill_mean: overrides?.place_fill_mean ?? derived.fill_mean,
      place_travel_mean: overrides?.place_travel_mean ?? derived.travel_mean,
      place_place_mean: overrides?.place_place_mean ?? derived.place_mean,
      place_return_mean: overrides?.place_return_mean ?? derived.return_mean,
    },
  );
}

export function runMethod(
  site: SiteScenario,
  method: PlacementMethod,
  overrides?: Partial<SimulationConfig> & { num_place?: number },
): SimulationResult {
  return runSimulation(buildConcretingConfig(site, method, overrides));
}

export type MethodCompareRow = {
  method: PlacementMethod;
  label: string;
  suitability: string;
  note: string;
  cycle_place_mean: number;
  result: SimulationResult;
  hours: number;
  unit_cost: number;
  unit_emission: number;
};

export function compareAllMethods(site: SiteScenario): MethodCompareRow[] {
  return PLACE_METHODS.map((method) => {
    const derived = derivePlaceCycle(method, site.distance_m, site.height_m);
    const result = runMethod(site, method);
    const hours = result.simulated_minutes / 60;
    const vol = Math.max(result.total_volume, 1e-9);
    // rough unit cost from busy-time style: use fleet hours * rate
    const profile = METHOD_PROFILES[method];
    const costPlace =
      hours *
      profile.num_place *
      (profile.cost_place_per_hour + profile.cost_place_op);
    const costTruck =
      hours *
      site.num_trucks *
      (profile.cost_truck_per_hour + profile.cost_truck_op);
    const totalCost = costPlace + costTruck;
    const emPlace =
      (result.loader_busy_minutes / 60) * emissionsFromFuel(profile.fuel_place_work) +
      ((hours * profile.num_place - result.loader_busy_minutes / 60) *
        emissionsFromFuel(profile.fuel_place_idle));
    const emTruck =
      (result.hauler_busy_minutes / 60) * emissionsFromFuel(profile.fuel_truck_work) +
      ((hours * site.num_trucks - result.hauler_busy_minutes / 60) *
        emissionsFromFuel(profile.fuel_truck_idle));
    return {
      method,
      label: METHOD_PROFILES[method].label,
      suitability: derived.suitability,
      note: derived.note,
      cycle_place_mean: derived.cycle_mean,
      result,
      hours,
      unit_cost: totalCost / vol,
      unit_emission: (emPlace + emTruck) / vol,
    };
  });
}
