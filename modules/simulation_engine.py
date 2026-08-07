"""
Modul 3 — Simulation Engine (inti) — SiklOps v1.0

Discrete Event Simulation (DES) untuk operasi **Earthmoving**
(galian & angkut: excavator + dump truck).

Tidak memakai library DES eksternal — hanya heapq (event queue) + random.

Metrik waktu:
  - Busy/wait di-clip ke horizon simulasi [0, duration] agar utilisasi
    tidak overcount aktivitas yang belum selesai di akhir shift.
  - Wait antrian mencakup observasi tersensor (masih mengantri saat t=T).
  - Panjang antrian rata-rata dihitung time-weighted (integral).
"""

from __future__ import annotations

import heapq
import math
import random
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


# Versi aplikasi (multi-operation template; earthmoving engine core)
APP_VERSION = "1.2.0"


class OperationType(str, Enum):
    """Earthmoving engine (core). Enum disimpan untuk kompatibilitas hasil/serialisasi."""

    EARTHMOVING = "earthmoving"


class EventType(str, Enum):
    """Jenis event dalam DES."""

    REQUEST_LOAD = "request_load"  # unit minta dilayani loader
    LOAD_FINISH = "load_finish"  # loading selesai
    TRAVEL_TO_DUMP = "travel_to_dump"  # tiba di dump/place
    DUMP_FINISH = "dump_finish"  # dumping/placing selesai
    TRAVEL_TO_LOAD = "travel_to_load"  # kembali ke area loading


class DistKind(str, Enum):
    """Jenis distribusi probabilitas untuk durasi aktivitas (menit)."""

    CONSTANT = "constant"
    NORMAL = "normal"
    LOGNORMAL = "lognormal"
    GAMMA = "gamma"
    BETA = "beta"


DIST_LABELS: dict[DistKind, str] = {
    DistKind.CONSTANT: "Konstan",
    DistKind.NORMAL: "Normal",
    DistKind.LOGNORMAL: "Log-normal",
    DistKind.GAMMA: "Gamma",
    DistKind.BETA: "Beta",
}


@dataclass
class DurationDist:
    """
    Spesifikasi distribusi durasi satu aktivitas (load/haul/dump/return).

    Parameter umum:
      - mean: nilai tengah / ekspektasi (menit) — dipakai constant, normal,
        lognormal, gamma
      - cv: koefisien variasi = std/mean — dipakai normal, lognormal, gamma
      - std: jika diisi (>0), override std untuk normal (abaikan cv*mean)

    Parameter Beta (dukungan [min_bound, max_bound]):
      - alpha, beta_shape: parameter bentuk Beta(α, β)
      - min_bound, max_bound: batas bawah/atas (menit)
    """

    kind: DistKind = DistKind.NORMAL
    mean: float = 3.0
    cv: float = 0.20
    std: float | None = None
    # Beta
    min_bound: float = 0.5
    max_bound: float = 10.0
    alpha: float = 2.0
    beta_shape: float = 5.0

    def expected_mean(self) -> float:
        """Ekspektasi teoretis (menit)."""
        if self.kind == DistKind.CONSTANT:
            return max(0.05, float(self.mean))
        if self.kind == DistKind.BETA:
            a, b = max(1e-6, self.alpha), max(1e-6, self.beta_shape)
            lo, hi = float(self.min_bound), float(self.max_bound)
            if hi <= lo:
                hi = lo + 0.1
            return lo + (hi - lo) * (a / (a + b))
        return max(0.05, float(self.mean))

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["kind"] = self.kind.value if isinstance(self.kind, DistKind) else str(self.kind)
        d["label"] = DIST_LABELS.get(self.kind, str(self.kind))
        d["expected_mean"] = round(self.expected_mean(), 3)
        return d

    @staticmethod
    def from_mean_cv(
        mean: float,
        cv: float = 0.2,
        kind: DistKind | str = DistKind.NORMAL,
    ) -> "DurationDist":
        k = DistKind(kind) if not isinstance(kind, DistKind) else kind
        if k == DistKind.CONSTANT or cv <= 0:
            return DurationDist(kind=DistKind.CONSTANT, mean=mean, cv=0.0)
        if k == DistKind.BETA:
            # default beta support ~ mean ± 2*cv*mean
            spread = max(0.5, 2.0 * abs(cv) * mean) if mean > 0 else 1.0
            return DurationDist(
                kind=DistKind.BETA,
                mean=mean,
                cv=cv,
                min_bound=max(0.05, mean - spread),
                max_bound=mean + spread,
                alpha=2.0,
                beta_shape=5.0,
            )
        return DurationDist(kind=k, mean=mean, cv=cv)


def sample_duration(dist: DurationDist, rng: random.Random) -> float:
    """
    Sample durasi (menit) > 0 dari distribusi yang dipilih.
    Hasil di-clamp minimum 0.05 menit.
    """
    kind = dist.kind if isinstance(dist.kind, DistKind) else DistKind(str(dist.kind))
    min_t = 0.05

    if kind == DistKind.CONSTANT:
        return max(min_t, float(dist.mean))

    if kind == DistKind.NORMAL:
        mean = float(dist.mean)
        if mean <= 0:
            return min_t
        if dist.std is not None and dist.std > 0:
            sigma = float(dist.std)
        else:
            cv = max(0.0, float(dist.cv))
            if cv <= 0:
                return max(min_t, mean)
            sigma = mean * cv
        # Tolak sampel non-positif (truncated normal)
        for _ in range(50):
            x = rng.gauss(mean, sigma)
            if x >= min_t:
                return x
        return max(min_t, mean)

    if kind == DistKind.LOGNORMAL:
        mean = float(dist.mean)
        cv = max(0.0, float(dist.cv))
        if mean <= 0:
            return min_t
        if cv <= 0:
            return max(min_t, mean)
        # E[X]=mean, CV=cv → σ² = ln(1+cv²), μ = ln(mean) - σ²/2
        sigma2 = math.log(1.0 + cv * cv)
        sigma = math.sqrt(sigma2)
        mu = math.log(mean) - 0.5 * sigma2
        x = math.exp(rng.gauss(mu, sigma))
        return max(min_t, x)

    if kind == DistKind.GAMMA:
        mean = float(dist.mean)
        cv = max(0.0, float(dist.cv))
        if mean <= 0:
            return min_t
        if cv <= 1e-9:
            return max(min_t, mean)
        # shape k = 1/cv², scale θ = mean * cv²
        # random.gammavariate(alpha, beta) dengan beta = scale
        shape = 1.0 / (cv * cv)
        scale = mean * cv * cv
        if shape <= 0 or scale <= 0:
            return max(min_t, mean)
        x = rng.gammavariate(shape, scale)
        return max(min_t, x)

    if kind == DistKind.BETA:
        a = max(1e-6, float(dist.alpha))
        b = max(1e-6, float(dist.beta_shape))
        lo = float(dist.min_bound)
        hi = float(dist.max_bound)
        if hi <= lo:
            hi = lo + max(0.1, abs(lo) * 0.1 + 0.1)
        u = rng.betavariate(a, b)  # on (0, 1)
        x = lo + (hi - lo) * u
        return max(min_t, x)

    # fallback
    return max(min_t, float(dist.mean))


@dataclass
class SimulationConfig:
    """Parameter input untuk satu skenario simulasi."""

    operation: OperationType = OperationType.EARTHMOVING

    # Fleet earthmoving
    num_loaders: int = 1  # excavator
    num_haulers: int = 3  # dump truck

    # Durasi siklus (menit) — mean; dipakai fallback & ringkasan
    load_time_mean: float = 3.0
    haul_time_mean: float = 8.0
    dump_time_mean: float = 1.5
    return_time_mean: float = 7.0

    # Distribusi per fase (None → diturunkan dari mean + cv global)
    load_dist: DurationDist | None = None
    haul_dist: DurationDist | None = None
    dump_dist: DurationDist | None = None
    return_dist: DurationDist | None = None

    # Kapasitas muatan per trip (m³ atau ton, tergantung operasi)
    payload_per_trip: float = 10.0

    # Durasi simulasi maksimum (menit) — juga pengaman jika mode siklus
    simulation_duration: float = 480.0  # 8 jam kerja

    # Target jumlah siklus/trip selesai (dump complete).
    # 0 = tidak membatasi (berhenti hanya karena durasi).
    target_cycles: int = 0

    # Mode berhenti: "duration" | "cycles"
    # - duration: berhenti saat t > simulation_duration
    # - cycles: berhenti saat total_trips >= target_cycles (atau durasi max)
    stop_mode: str = "duration"

    # Variabilitas default (jika dist per-fase tidak diisi)
    cv: float = 0.20
    # Jenis distribusi default untuk semua fase (jika dist None)
    default_dist_kind: DistKind | str = DistKind.NORMAL

    # Seed untuk reproducibility (None = acak)
    seed: int | None = 42

    def cycle_time_mean(self) -> float:
        return (
            self.resolved_load_dist().expected_mean()
            + self.resolved_haul_dist().expected_mean()
            + self.resolved_dump_dist().expected_mean()
            + self.resolved_return_dist().expected_mean()
        )

    def _default_kind(self) -> DistKind:
        k = self.default_dist_kind
        if isinstance(k, DistKind):
            return k
        try:
            return DistKind(str(k))
        except ValueError:
            return DistKind.NORMAL

    def _resolve(self, explicit: DurationDist | None, mean: float) -> DurationDist:
        if explicit is not None:
            return explicit
        kind = self._default_kind()
        cv = float(self.cv)
        if kind == DistKind.CONSTANT or cv <= 0:
            return DurationDist(kind=DistKind.CONSTANT, mean=mean, cv=0.0)
        return DurationDist.from_mean_cv(mean, cv, kind)

    def resolved_load_dist(self) -> DurationDist:
        return self._resolve(self.load_dist, self.load_time_mean)

    def resolved_haul_dist(self) -> DurationDist:
        return self._resolve(self.haul_dist, self.haul_time_mean)

    def resolved_dump_dist(self) -> DurationDist:
        return self._resolve(self.dump_dist, self.dump_time_mean)

    def resolved_return_dist(self) -> DurationDist:
        return self._resolve(self.return_dist, self.return_time_mean)

    def distributions_summary(self) -> dict[str, Any]:
        return {
            "load": self.resolved_load_dist().to_dict(),
            "haul": self.resolved_haul_dist().to_dict(),
            "dump": self.resolved_dump_dist().to_dict(),
            "return": self.resolved_return_dist().to_dict(),
        }


@dataclass
class SimulationResult:
    """Keluaran metrik dari Simulation Engine."""

    operation: OperationType
    config: SimulationConfig

    # Produktivitas
    total_trips: int = 0
    total_volume: float = 0.0
    throughput_per_hour: float = 0.0  # volume / jam
    simulated_minutes: float = 0.0
    stop_reason: str = ""  # "duration" | "target_cycles" | "no_events"
    target_cycles: int = 0

    # Utilisasi resource (0–1) — busy time ter-clip / (n_resource × horizon)
    loader_utilization: float = 0.0
    hauler_utilization: float = 0.0

    # Busy time absolut (menit·unit, sudah di-clip ke horizon)
    loader_busy_minutes: float = 0.0
    hauler_busy_minutes: float = 0.0

    # Antrian & waktu tunggu (menit)
    avg_queue_wait: float = 0.0  # rata-rata wait per kali minta load
    avg_queue_length: float = 0.0  # time-weighted
    max_queue_length: int = 0
    total_wait_time: float = 0.0  # total hauler-menit menunggu
    hauler_wait_ratio: float = 0.0  # fraksi waktu hauler di antrian (0–1)
    completed_load_requests: int = 0  # berapa kali load berhasil dimulai
    censored_waits: int = 0  # masih mengantri di akhir sim

    # Identifikasi bottleneck
    bottleneck: str = ""
    bottleneck_reason: str = ""

    # Deret waktu untuk visualisasi
    timeline_volume: list[tuple[float, float]] = field(default_factory=list)
    # (time_min, cumulative_volume)
    queue_over_time: list[tuple[float, int]] = field(default_factory=list)
    # (time_min, queue_length)

    # Log aktivitas & siklus (untuk Gantt + komposisi cycle + produktivitas)
    # activity_log: {hauler_id, phase, start, end} — phase: wait|load|haul|dump|return
    activity_log: list[dict[str, Any]] = field(default_factory=list)
    # cycle_log: siklus lengkap per trip (dump selesai dalam horizon)
    # {hauler_id, trip, wait, load, haul, dump, return, cycle_time,
    #  productive_time, finish_time, volume}
    cycle_log: list[dict[str, Any]] = field(default_factory=list)
    # Rata-rata komponen siklus (menit) dari cycle_log
    avg_cycle_components: dict[str, float] = field(default_factory=dict)

    # Detail per hauler
    hauler_trips: list[int] = field(default_factory=list)
    hauler_busy_per_unit: list[float] = field(default_factory=list)
    hauler_wait_per_unit: list[float] = field(default_factory=list)

    # Jejak antrian (untuk Little's Law & Kingman)
    arrival_times: list[float] = field(default_factory=list)  # REQUEST_LOAD
    service_times: list[float] = field(default_factory=list)  # durasi load yang dimulai
    wait_samples: list[float] = field(default_factory=list)  # tunggu per load start

    def to_dict(self) -> dict[str, Any]:
        return {
            "operation": self.operation.value,
            "total_trips": self.total_trips,
            "total_volume": round(self.total_volume, 2),
            "throughput_per_hour": round(self.throughput_per_hour, 2),
            "simulated_minutes": round(self.simulated_minutes, 1),
            "stop_reason": self.stop_reason,
            "target_cycles": self.target_cycles,
            "loader_utilization_pct": round(self.loader_utilization * 100, 1),
            "hauler_utilization_pct": round(self.hauler_utilization * 100, 1),
            "loader_busy_minutes": round(self.loader_busy_minutes, 2),
            "hauler_busy_minutes": round(self.hauler_busy_minutes, 2),
            "avg_queue_wait_min": round(self.avg_queue_wait, 2),
            "avg_queue_length": round(self.avg_queue_length, 2),
            "max_queue_length": self.max_queue_length,
            "total_wait_time_min": round(self.total_wait_time, 2),
            "hauler_wait_ratio_pct": round(self.hauler_wait_ratio * 100, 1),
            "completed_load_requests": self.completed_load_requests,
            "censored_waits": self.censored_waits,
            "avg_cycle_components": {
                k: round(v, 2) for k, v in self.avg_cycle_components.items()
            },
            "completed_cycles": len(self.cycle_log),
            "bottleneck": self.bottleneck,
            "bottleneck_reason": self.bottleneck_reason,
            "distributions": self.config.distributions_summary(),
        }


def _label_resources(operation: OperationType | None = None) -> tuple[str, str, str]:
    """(loader_name, hauler_name, volume_unit) — v1.0 selalu Earthmoving."""
    return "Excavator", "Dump Truck", "m³"


def _clip_interval(start: float, end: float, horizon: float) -> float:
    """Panjang irisan [start, end] ∩ [0, horizon]."""
    s = max(0.0, start)
    e = min(horizon, end)
    return max(0.0, e - s)


def run_simulation(config: SimulationConfig) -> SimulationResult:
    """
    Jalankan DES Earthmoving (v1.0).

    Model multi-excavator multi-dump-truck:
      Truck antri → diload excavator → haul → dump → return → antri lagi.

    Berhenti karena:
      - stop_mode=duration: t > simulation_duration
      - stop_mode=cycles: total_trips >= target_cycles (atau cap durasi)

    Busy/wait dihitung hanya di [0, T_efektif] (interval di-clip di akhir).
    """
    # Earthmoving engine path
    if config.operation != OperationType.EARTHMOVING:
        config.operation = OperationType.EARTHMOVING

    rng = random.Random(config.seed)
    max_horizon = float(config.simulation_duration)
    if max_horizon <= 0:
        max_horizon = 1.0

    stop_mode = (config.stop_mode or "duration").lower()
    target_cycles = max(0, int(config.target_cycles or 0))
    if stop_mode == "cycles" and target_cycles <= 0:
        target_cycles = 1

    n_loaders = max(1, int(config.num_loaders))
    n_haulers = max(1, int(config.num_haulers))
    # Jaga config konsisten (UI / metrik) — 1 dump truck valid & harus jalan
    config.num_loaders = n_loaders
    config.num_haulers = n_haulers

    # --- event queue: (time, seq, event_type, hauler_id) ---
    events: list[tuple[float, int, EventType, int]] = []
    seq = 0

    def schedule(t: float, etype: EventType, hauler_id: int) -> None:
        nonlocal seq
        seq += 1
        heapq.heappush(events, (t, seq, etype, hauler_id))

    free_loaders = n_loaders
    queue: list[tuple[float, int]] = []

    # Interval busy (start, end) — dijumlah & di-clip di akhir ke end_time
    loader_intervals: list[tuple[float, float]] = []
    hauler_intervals: list[list[tuple[float, float]]] = [[] for _ in range(n_haulers)]
    wait_intervals: list[list[tuple[float, float]]] = [[] for _ in range(n_haulers)]

    hauler_trips = [0] * n_haulers
    wait_samples: list[float] = []
    arrival_times: list[float] = []
    service_times: list[float] = []
    completed_loads = 0
    censored_waits = 0

    total_trips = 0
    total_volume = 0.0
    stop_reason = "duration"
    end_time = max_horizon  # T efektif (bisa lebih pendek jika mode cycles)

    timeline_volume: list[tuple[float, float]] = [(0.0, 0.0)]
    queue_over_time: list[tuple[float, int]] = [(0.0, 0)]
    activity_log: list[dict[str, Any]] = []
    cycle_log: list[dict[str, Any]] = []
    cycle_state: list[dict[str, float]] = [{} for _ in range(n_haulers)]

    last_change_t = 0.0
    queue_time_integral = 0.0
    max_queue = 0
    reached_cycle_target = False

    def integrate_queue_to(t: float) -> None:
        nonlocal last_change_t, queue_time_integral
        t = min(t, max_horizon)
        if t > last_change_t:
            queue_time_integral += len(queue) * (t - last_change_t)
            last_change_t = t

    def record_queue_snapshot(t: float) -> None:
        nonlocal max_queue
        qlen = len(queue)
        max_queue = max(max_queue, qlen)
        if not queue_over_time or queue_over_time[-1][1] != qlen:
            queue_over_time.append((min(t, max_horizon), qlen))

    def record_activity(hid: int, phase: str, start: float, duration: float) -> None:
        end = start + duration
        s = max(0.0, start)
        e = min(max_horizon, end)
        if e <= s:
            return
        activity_log.append(
            {
                "hauler_id": hid,
                "phase": phase,
                "start": s,
                "end": e,
                "duration": e - s,
            }
        )

    def accrue_loader_busy(start: float, duration: float) -> None:
        loader_intervals.append((start, start + duration))

    def accrue_hauler_busy(hid: int, start: float, duration: float) -> None:
        hauler_intervals[hid].append((start, start + duration))

    def try_start_load(now: float) -> None:
        nonlocal free_loaders, completed_loads
        if now > max_horizon or reached_cycle_target:
            return
        while free_loaders > 0 and queue:
            arrive_t, hid = queue.pop(0)
            integrate_queue_to(now)

            wait = max(0.0, now - arrive_t)
            wait_samples.append(wait)
            if wait > 1e-9:
                wait_intervals[hid].append((arrive_t, now))
                record_activity(hid, "wait", arrive_t, wait)
            completed_loads += 1

            st = cycle_state[hid]
            st["arrive"] = arrive_t
            st["wait"] = wait
            st["load_start"] = now

            free_loaders -= 1
            load_t = sample_duration(load_dist, rng)
            st["load"] = load_t
            service_times.append(load_t)
            accrue_loader_busy(now, load_t)
            accrue_hauler_busy(hid, now, load_t)
            record_activity(hid, "load", now, load_t)
            schedule(now + load_t, EventType.LOAD_FINISH, hid)
            record_queue_snapshot(now)

    # Distribusi durasi per fase (diselesaikan sekali di awal)
    load_dist = config.resolved_load_dist()
    haul_dist = config.resolved_haul_dist()
    dump_dist = config.resolved_dump_dist()
    return_dist = config.resolved_return_dist()

    for hid in range(n_haulers):
        schedule(0.0, EventType.REQUEST_LOAD, hid)

    while events:
        t, _, etype, hid = heapq.heappop(events)

        if t > max_horizon:
            stop_reason = "duration"
            break

        if reached_cycle_target:
            break

        if etype == EventType.REQUEST_LOAD:
            if reached_cycle_target:
                continue
            integrate_queue_to(t)
            arrival_times.append(t)
            queue.append((t, hid))
            record_queue_snapshot(t)
            try_start_load(t)

        elif etype == EventType.LOAD_FINISH:
            free_loaders += 1
            try_start_load(t)
            if reached_cycle_target:
                continue
            haul_t = sample_duration(haul_dist, rng)
            cycle_state[hid]["haul"] = haul_t
            accrue_hauler_busy(hid, t, haul_t)
            record_activity(hid, "haul", t, haul_t)
            schedule(t + haul_t, EventType.TRAVEL_TO_DUMP, hid)

        elif etype == EventType.TRAVEL_TO_DUMP:
            dump_t = sample_duration(dump_dist, rng)
            cycle_state[hid]["dump"] = dump_t
            accrue_hauler_busy(hid, t, dump_t)
            record_activity(hid, "dump", t, dump_t)
            schedule(t + dump_t, EventType.DUMP_FINISH, hid)

        elif etype == EventType.DUMP_FINISH:
            total_trips += 1
            hauler_trips[hid] += 1
            total_volume += config.payload_per_trip
            timeline_volume.append((t, total_volume))

            st = cycle_state[hid]
            st["dump_finish"] = t
            st["trip_no"] = total_trips

            ret_t = sample_duration(return_dist, rng)
            st["return"] = ret_t
            accrue_hauler_busy(hid, t, ret_t)
            record_activity(hid, "return", t, ret_t)
            schedule(t + ret_t, EventType.TRAVEL_TO_LOAD, hid)
            st["_partial_ready"] = 1.0

            # Target jumlah siklus tercapai
            if stop_mode == "cycles" and target_cycles > 0 and total_trips >= target_cycles:
                reached_cycle_target = True
                end_time = t
                stop_reason = "target_cycles"
                # Jangan mulai load baru; biarkan finalisasi cycle_log untuk trip ini

        elif etype == EventType.TRAVEL_TO_LOAD:
            st = cycle_state[hid]
            if st.get("_partial_ready"):
                wait_c = float(st.get("wait", 0.0))
                load_c = float(st.get("load", 0.0))
                haul_c = float(st.get("haul", 0.0))
                dump_c = float(st.get("dump", 0.0))
                ret_c = float(st.get("return", 0.0))
                productive = load_c + haul_c + dump_c + ret_c
                cycle_log.append(
                    {
                        "hauler_id": hid,
                        "trip": int(st.get("trip_no", 0)),
                        "wait": wait_c,
                        "load": load_c,
                        "haul": haul_c,
                        "dump": dump_c,
                        "return": ret_c,
                        "cycle_time": wait_c + productive,
                        "productive_time": productive,
                        "finish_time": float(st.get("dump_finish", t)),
                        "return_finish": t,
                        "volume": config.payload_per_trip,
                        "productivity": (
                            config.payload_per_trip
                            / max(wait_c + productive, 0.05)
                            * 60.0
                        ),
                    }
                )
                cycle_state[hid] = {}
            # Setelah target siklus, jangan mulai siklus baru
            if not reached_cycle_target:
                schedule(t, EventType.REQUEST_LOAD, hid)

    if not reached_cycle_target:
        end_time = max_horizon
        stop_reason = "duration" if events or total_trips >= 0 else "no_events"
        # Jika mode cycles tapi target tak tercapai sampai cap waktu
        if stop_mode == "cycles" and total_trips < target_cycles:
            stop_reason = "duration_cap"

    # Clip activity log ke end_time
    clipped_activity: list[dict[str, Any]] = []
    for a in activity_log:
        s = a["start"]
        e = min(a["end"], end_time)
        if e > s and s < end_time:
            clipped_activity.append(
                {
                    **a,
                    "end": e,
                    "duration": e - s,
                }
            )
    activity_log = clipped_activity

    # --- tutup horizon efektif ---
    integrate_queue_to(end_time)
    # Koreksi integral: last_change mungkin > end jika bug; pastikan
    for arrive_t, hid in queue:
        wait_left = max(0.0, end_time - arrive_t)
        wait_samples.append(wait_left)
        if wait_left > 1e-9:
            wait_intervals[hid].append((arrive_t, end_time))
            record_activity(hid, "wait", arrive_t, wait_left)
        censored_waits += 1
    if queue:
        record_queue_snapshot(end_time)

    # Finalisasi siklus dump selesai tapi return belum (termasuk early stop)
    for hid, st in enumerate(cycle_state):
        if not st.get("_partial_ready"):
            continue
        wait_c = float(st.get("wait", 0.0))
        load_c = float(st.get("load", 0.0))
        haul_c = float(st.get("haul", 0.0))
        dump_c = float(st.get("dump", 0.0))
        ret_c = float(st.get("return", 0.0))
        productive = load_c + haul_c + dump_c + ret_c
        cycle_time = wait_c + productive
        cycle_log.append(
            {
                "hauler_id": hid,
                "trip": int(st.get("trip_no", 0)),
                "wait": wait_c,
                "load": load_c,
                "haul": haul_c,
                "dump": dump_c,
                "return": ret_c,
                "cycle_time": cycle_time,
                "productive_time": productive,
                "finish_time": float(st.get("dump_finish", end_time)),
                "return_finish": float(st.get("dump_finish", end_time)) + ret_c,
                "volume": config.payload_per_trip,
                "productivity": config.payload_per_trip / max(cycle_time, 0.05) * 60.0,
                "censored_return": True,
            }
        )
        cycle_state[hid] = {}

    # Urutkan cycle_log by trip number
    cycle_log.sort(key=lambda c: (c.get("trip", 0), c.get("finish_time", 0)))

    avg_cycle_components: dict[str, float] = {}
    if cycle_log:
        keys = (
            "wait",
            "load",
            "haul",
            "dump",
            "return",
            "cycle_time",
            "productive_time",
            "productivity",
        )
        for k in keys:
            avg_cycle_components[k] = sum(float(c.get(k, 0.0)) for c in cycle_log) / len(
                cycle_log
            )

    # Busy & wait di-clip ke end_time
    loader_busy = sum(
        _clip_interval(s, e, end_time) for s, e in loader_intervals
    )
    hauler_busy = [
        sum(_clip_interval(s, e, end_time) for s, e in intervals)
        for intervals in hauler_intervals
    ]
    hauler_wait = [
        sum(_clip_interval(s, e, end_time) for s, e in intervals)
        for intervals in wait_intervals
    ]

    loader_capacity = n_loaders * end_time if end_time > 0 else 1.0
    hauler_capacity = n_haulers * end_time if end_time > 0 else 1.0

    loader_util = min(1.0, loader_busy / loader_capacity)
    total_hauler_busy = sum(hauler_busy)
    hauler_util = min(1.0, total_hauler_busy / hauler_capacity)

    total_wait = sum(hauler_wait)
    avg_wait = (sum(wait_samples) / len(wait_samples)) if wait_samples else 0.0
    avg_q_len = queue_time_integral / end_time if end_time > 0 else 0.0
    wait_ratio = min(1.0, total_wait / hauler_capacity)

    hours = end_time / 60.0
    throughput = total_volume / hours if hours > 0 else 0.0

    bottleneck, reason = _identify_bottleneck(
        config,
        loader_util,
        hauler_util,
        avg_wait,
        max_queue,
        wait_ratio,
        avg_q_len,
    )

    return SimulationResult(
        operation=config.operation,
        config=config,
        total_trips=total_trips,
        total_volume=total_volume,
        throughput_per_hour=throughput,
        simulated_minutes=end_time,
        stop_reason=stop_reason,
        target_cycles=target_cycles if stop_mode == "cycles" else 0,
        loader_utilization=loader_util,
        hauler_utilization=hauler_util,
        loader_busy_minutes=loader_busy,
        hauler_busy_minutes=total_hauler_busy,
        avg_queue_wait=avg_wait,
        avg_queue_length=avg_q_len,
        max_queue_length=max_queue,
        total_wait_time=total_wait,
        hauler_wait_ratio=wait_ratio,
        completed_load_requests=completed_loads,
        censored_waits=censored_waits,
        bottleneck=bottleneck,
        bottleneck_reason=reason,
        timeline_volume=timeline_volume,
        queue_over_time=queue_over_time,
        activity_log=activity_log,
        cycle_log=cycle_log,
        avg_cycle_components=avg_cycle_components,
        hauler_trips=hauler_trips,
        hauler_busy_per_unit=list(hauler_busy),
        hauler_wait_per_unit=list(hauler_wait),
        arrival_times=list(arrival_times),
        service_times=list(service_times),
        wait_samples=list(wait_samples),
    )


def _identify_bottleneck(
    config: SimulationConfig,
    loader_util: float,
    hauler_util: float,
    avg_wait: float,
    max_queue: int,
    wait_ratio: float = 0.0,
    avg_q_len: float = 0.0,
) -> tuple[str, str]:
    """Heuristik edukatif: tentukan resource yang membatasi throughput."""
    loader_name, hauler_name, _ = _label_resources(config.operation)

    # Loader saturasi + antrian hauler → bottleneck di loading
    if loader_util >= 0.85 and (avg_wait > 0.5 or max_queue >= 2 or avg_q_len >= 0.5):
        return (
            loader_name,
            f"{loader_name} hampir penuh ({loader_util*100:.0f}% util) dan "
            f"hauler menunggu rata-rata {avg_wait:.1f} menit "
            f"(antrian rata-rata {avg_q_len:.1f}). "
            f"Tambah {loader_name.lower()} atau percepat cycle load.",
        )

    # Hauler sangat sibuk, loader menganggur → kurang hauler / haul jauh
    if hauler_util >= 0.85 and loader_util < 0.70 and wait_ratio < 0.15:
        return (
            hauler_name,
            f"{hauler_name} sangat sibuk ({hauler_util*100:.0f}%) sementara "
            f"{loader_name} hanya {loader_util*100:.0f}%. "
            f"Tambah unit hauler atau perpendek jarak haul/return.",
        )

    # Loader sibuk tanpa antrian signifikan → seimbang tapi loader membatasi
    if loader_util >= hauler_util and loader_util >= 0.75:
        return (
            loader_name,
            f"Utilisasi {loader_name} ({loader_util*100:.0f}%) lebih tinggi "
            f"dari hauler ({hauler_util*100:.0f}%). "
            f"Kapasitas loading membatasi produksi.",
        )

    if hauler_util >= 0.75:
        return (
            hauler_name,
            f"Utilisasi {hauler_name} ({hauler_util*100:.0f}%) tinggi. "
            f"Armada hauling kemungkinan menjadi pembatas.",
        )

    return (
        "Seimbang / under-utilized",
        f"Kedua resource belum saturasi (loader {loader_util*100:.0f}%, "
        f"hauler {hauler_util*100:.0f}%, fraksi tunggu hauler "
        f"{wait_ratio*100:.0f}%). Coba what-if: ubah fleet atau cycle time.",
    )


def default_config_for(
    operation: OperationType | None = None,
) -> SimulationConfig:
    """Preset parameter wajar Earthmoving (v1.0)."""
    return SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=4,
        load_time_mean=2.5,
        haul_time_mean=10.0,
        dump_time_mean=1.5,
        return_time_mean=9.0,
        payload_per_trip=12.0,
        simulation_duration=480.0,
        cv=0.2,
        seed=42,
    )


def resource_labels(operation: OperationType | None = None) -> dict[str, str]:
    loader, hauler, unit = _label_resources(operation)
    return {"loader": loader, "hauler": hauler, "unit": unit}
