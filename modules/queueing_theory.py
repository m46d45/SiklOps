"""
Little's Law & Kingman's Equation — tinjauan **sistem** Earthmoving (SiklOps v1.0).

Little's Law:
  - Antrian load: L_q = λ · W_q
  - Sistem tertutup armada: N ≈ λ_trip · W_cycle

Kingman / VUT (G/G/c) untuk **seluruh sistem**:
  W_q ≈ ((c_a² + c_s²) / 2) · W_q(M/M/c)

  Parameter sistem diturunkan dari siklus produksi keseluruhan
  (bukan per-resource terpisah).
"""

from __future__ import annotations

import math
from typing import Any

from .simulation_engine import SimulationResult


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


def _cv(xs: list[float]) -> float:
    m = _mean(xs)
    if m <= 1e-12:
        return 0.0
    return _std(xs) / m


def _interarrival_times(times: list[float]) -> list[float]:
    if len(times) < 2:
        return []
    arr = sorted(times)
    return [arr[i] - arr[i - 1] for i in range(1, len(arr)) if arr[i] > arr[i - 1]]


def _erlang_c(c: int, traffic_intensity: float) -> float:
    c = max(1, int(c))
    a = float(traffic_intensity)
    if a <= 0:
        return 0.0
    if a >= c - 1e-12:
        return 1.0
    sum_term = 0.0
    term = 1.0
    for k in range(c):
        if k > 0:
            term *= a / k
        sum_term += term
    term_c = term * a / c if c > 0 else 0.0
    last = term_c * c / (c - a)
    denom = sum_term + last
    if denom <= 0:
        return 1.0
    return min(1.0, last / denom)


def _wq_mm_c(lam: float, mu: float, c: int) -> float:
    c = max(1, int(c))
    if lam <= 0 or mu <= 0:
        return 0.0
    if lam / (c * mu) >= 1.0 - 1e-12:
        return float("inf")
    a = lam / mu
    p_wait = _erlang_c(c, a)
    return p_wait / (c * mu - lam)


def _rel_err(pred: float | None, obs: float) -> float | None:
    if obs is None or abs(obs) < 1e-12:
        return None
    if pred is None or (isinstance(pred, float) and math.isinf(pred)):
        return None
    return (pred - obs) / obs


def _safe_wq(vut: float, wq_mmc: float) -> float:
    if math.isinf(wq_mmc):
        return float("inf")
    return vut * wq_mmc


def analyze_system(result: SimulationResult) -> dict[str, Any]:
    """
    Analisis tinjauan **seluruh sistem** earthmoving.

    - Little: antrian load + identitas armada N ≈ λ W_cycle
    - Kingman: satu model sistem (bukan per-resource)
    """
    T = max(result.simulated_minutes, 1e-9)
    n_exc = max(1, int(result.config.num_loaders))
    n_truck = max(1, int(result.config.num_haulers))

    arrivals = [t for t in result.arrival_times if 0 <= t <= T + 1e-9]
    services_load = [s for s in result.service_times if s > 0]
    n_arr = len(arrivals)
    lam_arr = n_arr / T if n_arr > 0 else 0.0

    cycles = list(result.cycle_log)
    n_trips = max(len(cycles), int(result.total_trips))
    lam_trip = n_trips / T if n_trips > 0 else 0.0  # trip selesai / menit

    waits = [float(c.get("wait", 0.0)) for c in cycles]
    loads = [float(c.get("load", 0.0)) for c in cycles] or services_load
    productive = [
        float(c.get("productive_time", 0.0))
        or (
            float(c.get("load", 0.0))
            + float(c.get("haul", 0.0))
            + float(c.get("dump", 0.0))
            + float(c.get("return", 0.0))
        )
        for c in cycles
    ]
    cycle_times = [float(c.get("cycle_time", 0.0)) for c in cycles]
    if not cycle_times and productive:
        cycle_times = [
            productive[i] + (waits[i] if i < len(waits) else 0.0)
            for i in range(len(productive))
        ]

    finish_times = [float(c.get("finish_time", 0.0)) for c in cycles]

    # --- Little: antrian load (subsystem) ---
    W_q_sim = float(result.avg_queue_wait)
    L_q_sim = float(result.avg_queue_length)
    L_q_little = lam_arr * W_q_sim
    W_q_from_L = (L_q_sim / lam_arr) if lam_arr > 1e-12 else 0.0

    t_s_load = (
        _mean(loads)
        if loads
        else max(0.05, result.config.resolved_load_dist().expected_mean())
    )
    W_load_station = W_q_sim + t_s_load
    L_load_station_little = lam_arr * W_load_station

    # --- Little: sistem armada (closed) N ≈ λ_trip · W_cycle ---
    W_cycle = _mean(cycle_times) if cycle_times else 0.0
    # λ per truck × N: total completion rate
    # Prediksi N dari Little: L_sys = λ_trip * W_cycle
    L_sys_little = lam_trip * W_cycle if W_cycle > 0 else 0.0
    N_fleet = float(n_truck)
    # W_cycle prediksi jika N & λ diketahui: W = N / λ
    W_cycle_from_little = (N_fleet / lam_trip) if lam_trip > 1e-12 else 0.0

    # --- Kingman sistem ---
    # Service sistem: waktu proses produktif satu trip (tanpa antri)
    t_s_sys = _mean(productive) if productive else max(W_cycle - W_q_sim, t_s_load)
    t_s_sys = max(0.05, t_s_sys)
    c_s_sys = _cv(productive) if len(productive) >= 2 else _cv(cycle_times)

    # Interarrival "job" sistem: jarak antar trip selesai (output) atau antar start
    iat_out = _interarrival_times(finish_times)
    iat_in = _interarrival_times(arrivals)
    c_a_sys = (
        _cv(iat_in)
        if len(iat_in) >= 2
        else (_cv(iat_out) if len(iat_out) >= 2 else 1.0)
    )

    # Utilisasi sistem = utilisasi bottleneck (mendorong kemacetan sistem)
    rho_exc = float(result.loader_utilization)
    rho_truck = float(result.hauler_utilization)
    if rho_exc >= rho_truck:
        bottleneck = "Excavator"
        rho_sys = rho_exc
        # server efektif bottleneck
        c_sys = n_exc
        # service bottleneck = load; tapi untuk "sistem" kita pakai t_s_sys
        # Campuran: ρ dari bottleneck, t_s dari siklus produktif / c_fleet scaling
    else:
        bottleneck = "Dump Truck"
        rho_sys = rho_truck
        c_sys = n_truck

    rho_sys = min(0.999, max(0.0, rho_sys))

    # Model G/G/c sistem: c = jumlah "kanal" paralel ≈ min armada yang membatasi
    # Praktis edukatif: c = n_truck (unit sirkulasi) dengan service t_s_sys per trip,
    # λ = lam_trip, ρ_theory = λ t_s / c
    lam_sys = lam_trip if lam_trip > 0 else lam_arr
    mu_sys = 1.0 / t_s_sys
    rho_theory = (lam_sys / (c_sys * mu_sys)) if (c_sys * mu_sys) > 0 else 0.0
    # Pakai ρ sim bottleneck untuk titik operasi (lebih intuitif di lapangan)
    rho_op = rho_sys

    vut = 0.5 * (c_a_sys**2 + c_s_sys**2)
    vut_zero = 0.0

    wq_mmc = _wq_mm_c(lam_sys, mu_sys, c_sys) if lam_sys > 0 and mu_sys > 0 else 0.0
    W_q_kingman = _safe_wq(vut, wq_mmc)
    W_q_no_var = 0.0 if not math.isinf(wq_mmc) else float("inf")

    # Kingman G/G/1-style pada ρ bottleneck (rumus VUT klasik, c=1 efektif)
    if rho_op < 1.0 - 1e-12:
        W_q_vut_classic = vut * (rho_op / (1.0 - rho_op)) * t_s_sys
        W_q_vut_no_var = 0.0
    else:
        W_q_vut_classic = float("inf")
        W_q_vut_no_var = float("inf")

    # Cycle time prediksi: t_s + W_q
    CT_kingman = (
        t_s_sys + W_q_kingman if not math.isinf(W_q_kingman) else float("inf")
    )
    CT_no_var = t_s_sys + 0.0
    CT_sim = W_cycle if W_cycle > 0 else t_s_sys + W_q_sim

    return {
        "T_min": T,
        "n_arrivals": n_arr,
        "n_trips": n_trips,
        "n_excavator": n_exc,
        "n_truck": n_truck,
        "bottleneck": bottleneck,
        # rates
        "lambda_arr_per_min": lam_arr,
        "lambda_arr_per_hour": lam_arr * 60.0,
        "lambda_trip_per_min": lam_trip,
        "lambda_trip_per_hour": lam_trip * 60.0,
        # Little — antrian load
        "W_q_sim": W_q_sim,
        "L_q_sim": L_q_sim,
        "L_q_little": L_q_little,
        "W_q_from_L": W_q_from_L,
        "t_s_load": t_s_load,
        "W_load_station": W_load_station,
        "L_load_station_little": L_load_station_little,
        "little_Lq_error_rel": _rel_err(L_q_little, L_q_sim),
        # Little — sistem armada
        "W_cycle_sim": W_cycle,
        "W_cycle_from_little": W_cycle_from_little,
        "L_sys_little": L_sys_little,
        "N_fleet": N_fleet,
        "little_N_error_rel": _rel_err(L_sys_little, N_fleet),
        "little_Wcycle_error_rel": _rel_err(W_cycle_from_little, W_cycle),
        # Kingman sistem
        "c_sys": c_sys,
        "t_s_sys": t_s_sys,
        "c_a_sys": c_a_sys,
        "c_s_sys": c_s_sys,
        "vut_factor": vut,
        "vut_no_var": vut_zero,
        "rho_sys": rho_op,
        "rho_excavator": rho_exc,
        "rho_truck": rho_truck,
        "rho_theory": rho_theory,
        "W_q_mm_c": wq_mmc if not math.isinf(wq_mmc) else None,
        "W_q_kingman": W_q_kingman if not math.isinf(W_q_kingman) else None,
        "W_q_kingman_no_var": (
            W_q_no_var if not math.isinf(W_q_no_var) else None
        ),
        "W_q_vut_classic": (
            W_q_vut_classic if not math.isinf(W_q_vut_classic) else None
        ),
        "W_q_vut_no_var": (
            W_q_vut_no_var if not math.isinf(W_q_vut_no_var) else None
        ),
        "CT_sim": CT_sim,
        "CT_kingman": CT_kingman if not math.isinf(CT_kingman) else None,
        "CT_no_var": CT_no_var,
        "kingman_Wq_error_rel": _rel_err(
            W_q_kingman if not math.isinf(W_q_kingman) else None,
            W_q_sim,
        ),
        "stable": rho_op < 0.99 and not math.isinf(wq_mmc),
    }


def analyze_queueing(result: SimulationResult) -> dict[str, Any]:
    """Alias kompatibilitas → analyze_system."""
    s = analyze_system(result)
    # map field lama yang masih mungkin dipakai tes
    return {
        **s,
        "lambda_per_min": s["lambda_arr_per_min"],
        "lambda_per_hour": s["lambda_arr_per_hour"],
        "n_servers": s["c_sys"],
        "t_s_min": s["t_s_sys"],
        "rho_sim": s["rho_sys"],
        "c_a": s["c_a_sys"],
        "c_s": s["c_s_sys"],
        "n_arrivals": s["n_arrivals"],
        "n_services": s["n_trips"],
    }


def kingman_curve_vs_rho(
    t_s: float,
    c_a: float,
    c_s: float,
    c_servers: int = 1,
    rho_max: float = 0.95,
    n_points: int = 40,
    *,
    mode: str = "mm_c",
) -> list[dict[str, float]]:
    """
    Kurva W_q vs ρ untuk tinjauan sistem.

    mode:
      - "mm_c": Allen–Cunneen VUT * W_q(M/M/c)  (λ = ρ c μ)
      - "vut_classic": ((ca²+cs²)/2)*(ρ/(1-ρ))*t_s   (rumus Kingman klasik)
    """
    c_servers = max(1, int(c_servers))
    vut = 0.5 * (c_a**2 + c_s**2)
    mu = 1.0 / t_s if t_s > 0 else 0.0
    rows = []
    for i in range(n_points + 1):
        rho = (i / n_points) * rho_max
        if rho < 1e-6 or mu <= 0:
            wq = 0.0
        elif mode == "vut_classic":
            if rho >= 1.0 - 1e-12:
                wq = float("nan")
            else:
                wq = vut * (rho / (1.0 - rho)) * t_s
        else:
            lam = rho * c_servers * mu
            wq_mmc = _wq_mm_c(lam, mu, c_servers)
            if math.isinf(wq_mmc):
                wq = float("nan")
            else:
                wq = vut * wq_mmc
        rows.append({"rho": rho, "W_q_kingman": wq, "rho_pct": rho * 100.0})
    return rows
