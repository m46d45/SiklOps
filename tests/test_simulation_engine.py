"""Uji cepat Simulation Engine (tanpa Streamlit)."""

from modules.simulation_engine import (
    OperationType,
    SimulationConfig,
    default_config_for,
    run_simulation,
)


def test_earthmoving_basic():
    cfg = default_config_for(OperationType.EARTHMOVING)
    cfg.seed = 1
    result = run_simulation(cfg)
    assert result.total_trips > 0
    assert result.total_volume == result.total_trips * cfg.payload_per_trip
    assert result.throughput_per_hour > 0
    assert 0 <= result.loader_utilization <= 1
    assert 0 <= result.hauler_utilization <= 1
    assert result.bottleneck
    assert len(result.timeline_volume) >= 1


def test_more_haulers_increases_loader_util_or_queue():
    base = default_config_for(OperationType.EARTHMOVING)
    base.seed = 7
    base.num_haulers = 2
    r_few = run_simulation(base)

    many = default_config_for(OperationType.EARTHMOVING)
    many.seed = 7
    many.num_haulers = 10
    r_many = run_simulation(many)

    assert (
        r_many.loader_utilization >= r_few.loader_utilization - 0.05
        or r_many.max_queue_length >= r_few.max_queue_length
    )


def test_earthmoving_only_v1():
    """v1.0: hanya Earthmoving."""
    cfg = default_config_for()
    cfg.simulation_duration = 120.0
    r = run_simulation(cfg)
    assert r.total_trips >= 0
    assert r.operation == OperationType.EARTHMOVING
    assert list(OperationType) == [OperationType.EARTHMOVING]


def test_zero_cv_deterministic_shape():
    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=2,
        load_time_mean=2.0,
        haul_time_mean=5.0,
        dump_time_mean=1.0,
        return_time_mean=5.0,
        payload_per_trip=10.0,
        simulation_duration=60.0,
        cv=0.0,
        seed=0,
    )
    r1 = run_simulation(cfg)
    r2 = run_simulation(cfg)
    assert r1.total_trips == r2.total_trips
    assert r1.total_volume == r2.total_volume


def test_single_truck_loader_util_matches_theory():
    """
    1 loader + 1 hauler, deterministic:
    cycle = load+haul+dump+return, loader hanya sibuk saat load.
    util_loader ≈ load / cycle (dengan sedikit error di tepi horizon).
    util_hauler ≈ 1.0 (selalu produktif, wait ≈ 0).
    """
    load, haul, dump, ret = 2.0, 5.0, 1.0, 5.0
    cycle = load + haul + dump + ret  # 13
    horizon = 130.0  # 10 cycle penuh
    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=1,
        load_time_mean=load,
        haul_time_mean=haul,
        dump_time_mean=dump,
        return_time_mean=ret,
        payload_per_trip=10.0,
        simulation_duration=horizon,
        cv=0.0,
        seed=0,
    )
    r = run_simulation(cfg)
    expected_loader = load / cycle  # 2/13 ≈ 0.1538
    assert abs(r.loader_utilization - expected_loader) < 0.03
    assert r.hauler_utilization > 0.95
    assert r.avg_queue_wait < 0.05
    assert r.hauler_wait_ratio < 0.05


def test_busy_plus_wait_covers_horizon_per_hauler():
    """Setiap hauler selalu waiting ATAU busy → busy+wait ≈ horizon."""
    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=4,
        load_time_mean=3.0,
        haul_time_mean=8.0,
        dump_time_mean=1.5,
        return_time_mean=7.0,
        payload_per_trip=10.0,
        simulation_duration=240.0,
        cv=0.0,
        seed=1,
    )
    r = run_simulation(cfg)
    horizon = cfg.simulation_duration
    for i, (b, w) in enumerate(
        zip(r.hauler_busy_per_unit, r.hauler_wait_per_unit)
    ):
        total = b + w
        # toleransi kecil untuk efek tepi (aktivitas terpotong / float)
        assert abs(total - horizon) < 1.0, (
            f"hauler {i}: busy+wait={total}, horizon={horizon}"
        )


def test_utilization_never_exceeds_one_with_variability():
    cfg = default_config_for(OperationType.EARTHMOVING)
    cfg.cv = 0.4
    cfg.num_haulers = 12
    cfg.seed = 99
    r = run_simulation(cfg)
    assert 0.0 <= r.loader_utilization <= 1.0
    assert 0.0 <= r.hauler_utilization <= 1.0
    assert 0.0 <= r.hauler_wait_ratio <= 1.0
    # busy time tidak boleh melebihi kapasitas resource
    assert r.loader_busy_minutes <= cfg.num_loaders * cfg.simulation_duration + 1e-6
    assert r.hauler_busy_minutes <= cfg.num_haulers * cfg.simulation_duration + 1e-6


def test_end_of_horizon_does_not_overcount_busy():
    """Aktivitas panjang di akhir shift tidak boleh membuat util > 1."""
    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=2,
        load_time_mean=30.0,
        haul_time_mean=40.0,
        dump_time_mean=20.0,
        return_time_mean=40.0,
        payload_per_trip=10.0,
        simulation_duration=50.0,  # lebih pendek dari satu cycle penuh
        cv=0.0,
        seed=0,
    )
    r = run_simulation(cfg)
    assert r.loader_utilization <= 1.0
    assert r.hauler_utilization <= 1.0
    assert r.loader_busy_minutes <= 50.0 + 1e-9


def test_stop_by_target_cycles():
    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=3,
        load_time_mean=2.0,
        haul_time_mean=5.0,
        dump_time_mean=1.0,
        return_time_mean=5.0,
        payload_per_trip=10.0,
        simulation_duration=10_000.0,
        target_cycles=20,
        stop_mode="cycles",
        cv=0.0,
        seed=1,
    )
    r = run_simulation(cfg)
    assert r.total_trips == 20
    assert r.stop_reason == "target_cycles"
    assert len(r.cycle_log) == 20
    assert all("productivity" in c for c in r.cycle_log)
    assert r.simulated_minutes < 10_000.0


def test_cycle_productivity_inverse_to_cycle_time():
    cfg = default_config_for(OperationType.EARTHMOVING)
    cfg.stop_mode = "cycles"
    cfg.target_cycles = 15
    cfg.simulation_duration = 5000.0
    cfg.seed = 3
    r = run_simulation(cfg)
    for c in r.cycle_log:
        expected = c["volume"] / max(c["cycle_time"], 0.05) * 60.0
        assert abs(c["productivity"] - expected) < 1e-6


def test_sample_all_distributions_positive():
    from modules.simulation_engine import DistKind, DurationDist, sample_duration
    import random

    rng = random.Random(0)
    specs = [
        DurationDist(kind=DistKind.CONSTANT, mean=5.0),
        DurationDist(kind=DistKind.NORMAL, mean=5.0, cv=0.2),
        DurationDist(kind=DistKind.LOGNORMAL, mean=5.0, cv=0.3),
        DurationDist(kind=DistKind.GAMMA, mean=5.0, cv=0.25),
        DurationDist(
            kind=DistKind.BETA, min_bound=1.0, max_bound=9.0, alpha=2.0, beta_shape=5.0
        ),
    ]
    for d in specs:
        for _ in range(30):
            x = sample_duration(d, rng)
            assert x >= 0.05, (d.kind, x)


def test_constant_dist_deterministic_trips():
    from modules.simulation_engine import DistKind, DurationDist

    cfg = SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=1,
        num_haulers=2,
        load_time_mean=2.0,
        haul_time_mean=5.0,
        dump_time_mean=1.0,
        return_time_mean=5.0,
        load_dist=DurationDist(kind=DistKind.CONSTANT, mean=2.0),
        haul_dist=DurationDist(kind=DistKind.CONSTANT, mean=5.0),
        dump_dist=DurationDist(kind=DistKind.CONSTANT, mean=1.0),
        return_dist=DurationDist(kind=DistKind.CONSTANT, mean=5.0),
        payload_per_trip=10.0,
        simulation_duration=5000.0,
        target_cycles=10,
        stop_mode="cycles",
        seed=1,
    )
    r1 = run_simulation(cfg)
    r2 = run_simulation(cfg)
    assert r1.total_trips == r2.total_trips == 10
    assert abs(r1.total_volume - r2.total_volume) < 1e-9


def test_gamma_and_lognormal_run():
    from modules.simulation_engine import DistKind, DurationDist

    for kind in (DistKind.GAMMA, DistKind.LOGNORMAL, DistKind.BETA):
        if kind == DistKind.BETA:
            d = DurationDist(
                kind=kind, min_bound=1.0, max_bound=8.0, alpha=2.0, beta_shape=4.0
            )
            cfg = SimulationConfig(
                operation=OperationType.EARTHMOVING,
                num_loaders=1,
                num_haulers=3,
                load_dist=d,
                haul_dist=DurationDist(
                    kind=DistKind.BETA, min_bound=5.0, max_bound=15.0, alpha=2, beta_shape=2
                ),
                dump_dist=DurationDist(
                    kind=DistKind.BETA, min_bound=0.5, max_bound=3.0, alpha=2, beta_shape=2
                ),
                return_dist=DurationDist(
                    kind=DistKind.BETA, min_bound=5.0, max_bound=14.0, alpha=2, beta_shape=2
                ),
                payload_per_trip=10.0,
                stop_mode="cycles",
                target_cycles=12,
                simulation_duration=8000.0,
                seed=5,
            )
        else:
            cfg = SimulationConfig(
                operation=OperationType.EARTHMOVING,
                num_loaders=1,
                num_haulers=3,
                load_time_mean=2.5,
                haul_time_mean=10.0,
                dump_time_mean=1.5,
                return_time_mean=9.0,
                load_dist=DurationDist(kind=kind, mean=2.5, cv=0.25),
                haul_dist=DurationDist(kind=kind, mean=10.0, cv=0.25),
                dump_dist=DurationDist(kind=kind, mean=1.5, cv=0.2),
                return_dist=DurationDist(kind=kind, mean=9.0, cv=0.25),
                payload_per_trip=10.0,
                stop_mode="cycles",
                target_cycles=12,
                simulation_duration=8000.0,
                seed=5,
            )
        r = run_simulation(cfg)
        assert r.total_trips == 12
        assert r.total_volume > 0


def test_single_dump_truck_runs():
    """1 dump truck + 1 excavator harus menghasilkan trip (bug UI/engine)."""
    cfg = default_config_for()
    cfg.num_loaders = 1
    cfg.num_haulers = 1
    cfg.stop_mode = "cycles"
    cfg.target_cycles = 15
    cfg.simulation_duration = 20_000.0
    cfg.seed = 7
    r = run_simulation(cfg)
    assert r.config.num_haulers == 1
    assert r.total_trips == 15
    assert len(r.cycle_log) == 15
    assert r.hauler_trips == [15]
    assert r.total_volume == 15 * cfg.payload_per_trip
    # Tanpa antrian kompetitif, wait rata-rata ~0
    assert r.avg_queue_wait < 0.5
    assert r.hauler_utilization > 0.9


def test_littles_and_kingman_analysis():
    from modules.queueing_theory import analyze_queueing, analyze_system

    cfg = default_config_for()
    cfg.stop_mode = "cycles"
    cfg.target_cycles = 40
    cfg.simulation_duration = 10000.0
    cfg.seed = 11
    r = run_simulation(cfg)
    q = analyze_queueing(r)
    assert q["lambda_per_min"] > 0
    assert q["n_arrivals"] > 0
    assert len(r.arrival_times) > 0
    assert len(r.service_times) > 0
    if q["L_q_sim"] > 0.05:
        assert abs(q["L_q_little"] - q["L_q_sim"]) / max(q["L_q_sim"], 1e-6) < 0.5
    assert "W_q_kingman" in q

    # Tinjauan sistem (bukan per-resource)
    s = analyze_system(r)
    assert s["bottleneck"] in ("Excavator", "Dump Truck")
    assert s["t_s_sys"] > 0
    assert s["W_q_kingman_no_var"] == 0.0 or s["W_q_kingman_no_var"] is None
    assert s["CT_no_var"] == s["t_s_sys"]
    assert s["N_fleet"] == cfg.num_haulers
    assert s["W_cycle_sim"] > 0
    assert "rho_sys" in s


if __name__ == "__main__":
    test_earthmoving_basic()
    test_more_haulers_increases_loader_util_or_queue()
    test_earthmoving_only_v1()
    test_zero_cv_deterministic_shape()
    test_single_truck_loader_util_matches_theory()
    test_busy_plus_wait_covers_horizon_per_hauler()
    test_utilization_never_exceeds_one_with_variability()
    test_end_of_horizon_does_not_overcount_busy()
    test_stop_by_target_cycles()
    test_cycle_productivity_inverse_to_cycle_time()
    test_sample_all_distributions_positive()
    test_constant_dist_deterministic_trips()
    test_gamma_and_lognormal_run()
    test_single_dump_truck_runs()
    test_littles_and_kingman_analysis()
    print("All engine tests passed.")
