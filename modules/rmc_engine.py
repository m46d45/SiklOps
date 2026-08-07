"""
Dual-cycle DES for Ready-mixed Concrete (RMC) placing.
Cycle A — truck mixer: batch → haul → discharge → return
Cycle B — placing: fill → travel → place → return
Coupling: site buffer (m³). Trucks wait if buffer full; place waits if empty.
"""

from __future__ import annotations

import heapq
import random
from dataclasses import dataclass, field
from typing import Any, Literal

from modules.simulation_engine import (
    APP_VERSION,
    DurationDist,
    DistKind,
    sample_duration,
)

PlacementMethod = Literal["buggy", "crane", "pump"]


@dataclass
class RmcConfig:
    method: PlacementMethod = "buggy"
    # site
    distance_m: float = 40.0
    height_m: float = 6.0
    # truck cycle A
    num_trucks: int = 3
    truck_capacity_m3: float = 5.0
    truck_batch: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(5.0, 0.2))
    truck_haul: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(18.0, 0.2))
    truck_discharge: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(4.0, 0.2))
    truck_return: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(16.0, 0.2))
    buffer_capacity_m3: float = 6.0
    # place cycle B
    num_place: int = 4
    place_capacity_m3: float = 0.2
    place_fill: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(1.5, 0.2))
    place_travel: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(3.0, 0.2))
    place_place: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(1.5, 0.2))
    place_return: DurationDist = field(default_factory=lambda: DurationDist.from_mean_cv(2.5, 0.2))
    # stop
    target_volume: float = 40.0
    target_cycles: int = 40
    simulation_duration: float = 7 * 24 * 60
    seed: int | None = 12345


def derive_place_cycle(method: PlacementMethod, distance_m: float, height_m: float) -> dict[str, Any]:
    D = max(0.0, float(distance_m))
    H = max(0.0, float(height_m))

    def r1(x: float) -> float:
        return round(x, 1)

    if method == "buggy":
        one_way = D / 30.0 + H / 6.0
        fill, travel, place, ret = 1.2 + 0.3 * min(H, 3), max(0.8, one_way), 1.2, max(0.7, one_way * 0.85)
        suit, note = "good", "Buggy is efficient for short distance and low height."
        if H > 12:
            suit, note = "poor", "Extreme height for manual buggy."
        elif H > 4 or D > 60:
            suit, note = "poor", "Large distance/height — prefer crane or pump."
        elif H > 2 or D > 35:
            suit, note = "fair", "Buggy possible but travel becomes significant."
    elif method == "crane":
        one_way = H / 22.0 + D / 40.0
        fill, travel, place, ret = 1.8, max(1.2, one_way + 0.5), 1.5, max(1.0, one_way * 0.9)
        suit, note = "good", "Crane fits multi-storey structures and medium bucket volume."
        if H < 2 and D < 15:
            suit, note = "fair", "Low/close pour — crane may be overspec."
    else:  # pump
        fill = 1.0
        travel = max(1.0, 1.2 + D / 80.0 + H / 40.0)
        place = 1.0 + H / 50.0
        ret = 0.6
        suit, note = "good", "Pump excels for significant distance/height and continuous volume."
        if D < 15 and H < 3:
            suit, note = "fair", "Small distance/height — pump cost may not justify vs buggy."

    cycle = fill + travel + place + ret
    return {
        "fill": r1(fill),
        "travel": r1(travel),
        "place": r1(place),
        "return": r1(ret),
        "cycle": r1(cycle),
        "suitability": suit,
        "note": note,
    }


def method_profile(method: PlacementMethod) -> dict[str, Any]:
    if method == "crane":
        return {
            "label": "Tower Crane + Bucket",
            "place_capacity_m3": 1.0,
            "num_place": 2,
            "cost_place": 450_000,
            "cost_truck": 280_000,
        }
    if method == "pump":
        return {
            "label": "Mobile Concrete Pump",
            "place_capacity_m3": 0.5,
            "num_place": 1,
            "cost_place": 550_000,
            "cost_truck": 280_000,
        }
    return {
        "label": "Concrete Buggy",
        "place_capacity_m3": 0.2,
        "num_place": 4,
        "cost_place": 15_000,
        "cost_truck": 280_000,
    }


def config_from_site(
    method: PlacementMethod,
    distance_m: float,
    height_m: float,
    *,
    num_trucks: int = 3,
    truck_capacity_m3: float = 5.0,
    buffer_capacity_m3: float = 6.0,
    target_volume: float = 40.0,
    target_cycles: int = 40,
    seed: int = 12345,
    cv: float = 0.2,
    truck_means: dict[str, float] | None = None,
    num_place: int | None = None,
) -> RmcConfig:
    prof = method_profile(method)
    der = derive_place_cycle(method, distance_m, height_m)
    tm = truck_means or {}
    batch_m = tm.get("batch", 5.0)
    haul_m = tm.get("haul", 18.0)
    disc_m = tm.get("discharge", 4.0)
    ret_m = tm.get("return", 16.0)
    return RmcConfig(
        method=method,
        distance_m=distance_m,
        height_m=height_m,
        num_trucks=num_trucks,
        truck_capacity_m3=truck_capacity_m3,
        truck_batch=DurationDist.from_mean_cv(batch_m, cv),
        truck_haul=DurationDist.from_mean_cv(haul_m, cv),
        truck_discharge=DurationDist.from_mean_cv(disc_m, cv),
        truck_return=DurationDist.from_mean_cv(ret_m, cv),
        buffer_capacity_m3=buffer_capacity_m3,
        num_place=num_place or prof["num_place"],
        place_capacity_m3=prof["place_capacity_m3"],
        place_fill=DurationDist.from_mean_cv(der["fill"], cv),
        place_travel=DurationDist.from_mean_cv(der["travel"], cv),
        place_place=DurationDist.from_mean_cv(der["place"], cv),
        place_return=DurationDist.from_mean_cv(der["return"], cv),
        target_volume=target_volume,
        target_cycles=target_cycles,
        seed=seed,
    )


@dataclass
class RmcResult:
    method: PlacementMethod
    config: RmcConfig
    total_trips: int = 0
    total_volume: float = 0.0
    throughput_per_hour: float = 0.0
    simulated_minutes: float = 0.0
    stop_reason: str = ""
    truck_utilization: float = 0.0
    place_utilization: float = 0.0
    avg_queue_wait: float = 0.0
    avg_queue_length: float = 0.0
    max_queue_length: int = 0
    bottleneck: str = ""
    bottleneck_reason: str = ""
    timeline_volume: list[tuple[float, float]] = field(default_factory=list)
    cycle_log: list[dict[str, Any]] = field(default_factory=list)
    suitability: str = ""
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "total_trips": self.total_trips,
            "total_volume": round(self.total_volume, 2),
            "throughput_m3_h": round(self.throughput_per_hour, 2),
            "hours": round(self.simulated_minutes / 60.0, 2),
            "truck_util_pct": round(self.truck_utilization * 100, 1),
            "place_util_pct": round(self.place_utilization * 100, 1),
            "avg_queue_wait_min": round(self.avg_queue_wait, 2),
            "bottleneck": self.bottleneck,
            "stop_reason": self.stop_reason,
            "suitability": self.suitability,
        }


def run_rmc(config: RmcConfig) -> RmcResult:
    rng = random.Random(config.seed)
    max_horizon = float(config.simulation_duration) if config.simulation_duration > 0 else 10080.0
    target_cycles = max(0, int(config.target_cycles or 0))
    target_volume = max(0.0, float(config.target_volume or 0))
    if target_cycles <= 0 and target_volume <= 0:
        target_cycles, target_volume = 40, 30.0

    n_trucks = max(1, int(config.num_trucks))
    n_place = max(1, int(config.num_place))
    truck_cap = max(0.05, float(config.truck_capacity_m3))
    place_cap = max(0.05, float(config.place_capacity_m3))
    buffer_max = max(place_cap, float(config.buffer_capacity_m3))

    # events: (t, seq, kind, id, vol)
    events: list[tuple[float, int, str, int, float]] = []
    seq = 0

    def push(t: float, kind: str, i: int, vol: float = 0.0) -> None:
        nonlocal seq
        seq += 1
        heapq.heappush(events, (t, seq, kind, i, vol))

    buffer = 0.0
    truck_queue: list[tuple[float, int, float]] = []  # arrive, id, vol
    place_wait: list[tuple[float, int]] = []  # ready_t, id
    free_discharge = 1

    truck_busy = [0.0] * n_trucks
    place_busy = [0.0] * n_place
    wait_samples: list[float] = []
    q_integral = 0.0
    last_change = 0.0
    max_queue = 0

    total_trips = 0
    total_volume = 0.0
    stop_reason = "duration"
    end_time = max_horizon
    reached = False
    timeline: list[tuple[float, float]] = [(0.0, 0.0)]
    cycle_log: list[dict[str, Any]] = []

    def integrate(t: float) -> None:
        nonlocal last_change, q_integral
        t = min(t, max_horizon)
        if t > last_change:
            q_integral += len(truck_queue) * (t - last_change)
            last_change = t

    def try_discharge(now: float) -> None:
        nonlocal free_discharge, buffer
        while free_discharge > 0 and truck_queue and not reached:
            room = buffer_max - buffer
            if room < 1e-9:
                break
            arrive, tid, vol = truck_queue.pop(0)
            integrate(now)
            wait = max(0.0, now - arrive)
            wait_samples.append(wait)
            vol = min(vol, room)
            free_discharge -= 1
            dt = sample_duration(config.truck_discharge, rng)
            truck_busy[tid] += dt
            push(now + dt, "truck_discharge_done", tid, vol)

    def try_start_place(now: float) -> None:
        nonlocal buffer
        while place_wait and buffer > 1e-9 and not reached:
            ready, pid = place_wait.pop(0)
            vol = min(place_cap, buffer)
            buffer -= vol
            try_discharge(now)
            fill = sample_duration(config.place_fill, rng)
            place_busy[pid] += fill
            push(now + fill, "place_fill_done", pid, vol)

    for i in range(n_trucks):
        bt = sample_duration(config.truck_batch, rng)
        truck_busy[i] += bt
        push(bt, "truck_batch_done", i)
    for i in range(n_place):
        place_wait.append((0.0, i))

    guard = 0
    while events and guard < 5_000_000:
        guard += 1
        now, _, kind, i, vol = heapq.heappop(events)
        if now > max_horizon or reached:
            end_time = min(now, max_horizon)
            break
        integrate(now)
        max_queue = max(max_queue, len(truck_queue))

        if kind == "truck_batch_done":
            haul = sample_duration(config.truck_haul, rng)
            truck_busy[i] += haul
            push(now + haul, "truck_arrive_site", i)
        elif kind == "truck_arrive_site":
            truck_queue.append((now, i, truck_cap))
            try_discharge(now)
        elif kind == "truck_discharge_done":
            free_discharge += 1
            buffer = min(buffer_max, buffer + vol)
            try_start_place(now)
            try_discharge(now)
            ret = sample_duration(config.truck_return, rng)
            truck_busy[i] += ret
            push(now + ret, "truck_return_done", i)
        elif kind == "truck_return_done":
            bt = sample_duration(config.truck_batch, rng)
            truck_busy[i] += bt
            push(now + bt, "truck_batch_done", i)
        elif kind == "place_fill_done":
            tr = sample_duration(config.place_travel, rng)
            place_busy[i] += tr
            push(now + tr, "place_travel_done", i, vol)
        elif kind == "place_travel_done":
            pl = sample_duration(config.place_place, rng)
            place_busy[i] += pl
            push(now + pl, "place_place_done", i, vol)
        elif kind == "place_place_done":
            total_trips += 1
            total_volume += vol
            timeline.append((now, total_volume))
            ret = sample_duration(config.place_return, rng)
            place_busy[i] += ret
            cycle_log.append(
                {
                    "trip": total_trips,
                    "volume": vol,
                    "finish_time": now,
                    "place_id": i,
                }
            )
            push(now + ret, "place_return_done", i)
            if target_cycles > 0 and total_trips >= target_cycles:
                reached = True
                stop_reason = "target_cycles"
                end_time = now
            elif target_volume > 0 and total_volume >= target_volume:
                reached = True
                stop_reason = "target_volume"
                end_time = now
        elif kind == "place_return_done":
            place_wait.append((now, i))
            try_start_place(now)

    if not reached:
        stop_reason = "duration_cap"
        end_time = max_horizon
    integrate(end_time)

    horizon = max(end_time, 1e-9)
    # clip busy roughly: busy was summed as durations scheduled; cap at horizon*n
    t_busy = min(sum(truck_busy), n_trucks * horizon)
    p_busy = min(sum(place_busy), n_place * horizon)
    truck_util = min(1.0, t_busy / (n_trucks * horizon))
    place_util = min(1.0, p_busy / (n_place * horizon))
    avg_wait = sum(wait_samples) / len(wait_samples) if wait_samples else 0.0
    avg_q = q_integral / horizon
    thr = (total_volume / horizon) * 60.0

    if place_util >= truck_util and place_util >= 0.75:
        bn, reason = "Placing unit", f"Place util {place_util*100:.0f}% high — placing limits."
    elif truck_util >= 0.75:
        bn, reason = "Truck mixer", f"Truck util {truck_util*100:.0f}% high — RMC supply limits."
    elif avg_wait > 1 and avg_q > 0.5:
        bn, reason = "Buffer / discharge", f"Trucks queue for discharge (Wq={avg_wait:.1f} min)."
    else:
        bn, reason = "Balanced / under-utilized", f"Truck {truck_util*100:.0f}%, place {place_util*100:.0f}%."

    der = derive_place_cycle(config.method, config.distance_m, config.height_m)
    return RmcResult(
        method=config.method,
        config=config,
        total_trips=total_trips,
        total_volume=total_volume,
        throughput_per_hour=thr,
        simulated_minutes=end_time,
        stop_reason=stop_reason,
        truck_utilization=truck_util,
        place_utilization=place_util,
        avg_queue_wait=avg_wait,
        avg_queue_length=avg_q,
        max_queue_length=max_queue,
        bottleneck=bn,
        bottleneck_reason=reason + f" Dual-cycle RMC + {method_profile(config.method)['label']}.",
        timeline_volume=timeline,
        cycle_log=cycle_log,
        suitability=der["suitability"],
        note=der["note"],
    )


def compare_methods(
    distance_m: float,
    height_m: float,
    **kwargs: Any,
) -> list[RmcResult]:
    out: list[RmcResult] = []
    for m in ("buggy", "crane", "pump"):
        cfg = config_from_site(m, distance_m, height_m, **kwargs)  # type: ignore[arg-type]
        out.append(run_rmc(cfg))
    return out
