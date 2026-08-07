"""
Modul 2 — Input Parameter

Membangun SimulationConfig dari input pengguna (sidebar Streamlit),
termasuk pilihan distribusi probabilitas durasi load/haul/dump/return.
"""

from __future__ import annotations

from .simulation_engine import (
    DIST_LABELS,
    DistKind,
    DurationDist,
    OperationType,
    SimulationConfig,
    default_config_for,
)

# Urutan opsi di UI
_DIST_OPTIONS = [
    DistKind.CONSTANT,
    DistKind.NORMAL,
    DistKind.LOGNORMAL,
    DistKind.GAMMA,
    DistKind.BETA,
]
_DIST_CHOICES = [DIST_LABELS[k] for k in _DIST_OPTIONS]
_LABEL_TO_KIND = {DIST_LABELS[k]: k for k in _DIST_OPTIONS}


def _render_duration_dist_widgets(
    st,
    phase_key: str,
    phase_title: str,
    default_mean: float,
    default_cv: float,
    mean_max: float,
) -> DurationDist:
    """Widget parameter distribusi untuk satu fase aktivitas."""
    st.markdown(f"**{phase_title}**")
    kind_label = st.selectbox(
        "Distribusi",
        options=_DIST_CHOICES,
        index=_DIST_CHOICES.index(DIST_LABELS[DistKind.NORMAL]),
        key=f"dist_kind_{phase_key}",
        help=(
            "Konstan: nilai tetap. "
            "Normal / Log-normal / Gamma: mean + CV. "
            "Beta: bentuk α, β pada interval [min, max]."
        ),
    )
    kind = _LABEL_TO_KIND[kind_label]

    if kind == DistKind.CONSTANT:
        mean = st.number_input(
            "Nilai konstan (menit)",
            min_value=0.05,
            max_value=float(mean_max),
            value=float(default_mean),
            step=0.1,
            key=f"dist_mean_{phase_key}",
        )
        return DurationDist(kind=DistKind.CONSTANT, mean=float(mean), cv=0.0)

    if kind in (DistKind.NORMAL, DistKind.LOGNORMAL, DistKind.GAMMA):
        mean = st.number_input(
            "Mean (menit)",
            min_value=0.05,
            max_value=float(mean_max),
            value=float(default_mean),
            step=0.1,
            key=f"dist_mean_{phase_key}",
        )
        cv = st.slider(
            "CV (std/mean)",
            min_value=0.0,
            max_value=1.0,
            value=float(default_cv),
            step=0.01,
            key=f"dist_cv_{phase_key}",
            help="Koefisien variasi. 0 = hampir deterministik.",
        )
        use_std = False
        std_val = None
        if kind == DistKind.NORMAL:
            use_std = st.checkbox(
                "Pakai std absolut (bukan CV)",
                value=False,
                key=f"dist_use_std_{phase_key}",
            )
            if use_std:
                std_val = st.number_input(
                    "Std (menit)",
                    min_value=0.0,
                    max_value=float(mean_max),
                    value=float(default_mean * default_cv),
                    step=0.05,
                    key=f"dist_std_{phase_key}",
                )
        # Keterangan parameter
        if kind == DistKind.GAMMA and cv > 0:
            shape = 1.0 / (cv * cv)
            scale = mean * cv * cv
            st.caption(f"Gamma → shape k≈{shape:.2f}, scale θ≈{scale:.3f}")
        elif kind == DistKind.LOGNORMAL and cv > 0:
            import math

            sigma2 = math.log(1.0 + cv * cv)
            mu = math.log(mean) - 0.5 * sigma2
            st.caption(f"Log-normal → μ≈{mu:.3f}, σ≈{sigma2**0.5:.3f} (pada ln X)")
        return DurationDist(
            kind=kind,
            mean=float(mean),
            cv=float(cv),
            std=float(std_val) if use_std and std_val is not None else None,
        )

    # Beta
    col_a, col_b = st.columns(2)
    with col_a:
        min_b = st.number_input(
            "Min (menit)",
            min_value=0.05,
            max_value=float(mean_max),
            value=max(0.05, float(default_mean) * 0.5),
            step=0.1,
            key=f"dist_min_{phase_key}",
        )
        alpha = st.number_input(
            "α (alpha)",
            min_value=0.1,
            max_value=50.0,
            value=2.0,
            step=0.1,
            key=f"dist_alpha_{phase_key}",
        )
    with col_b:
        max_b = st.number_input(
            "Max (menit)",
            min_value=0.1,
            max_value=float(mean_max * 2),
            value=float(default_mean) * 1.5,
            step=0.1,
            key=f"dist_max_{phase_key}",
        )
        beta_s = st.number_input(
            "β (beta)",
            min_value=0.1,
            max_value=50.0,
            value=5.0,
            step=0.1,
            key=f"dist_beta_{phase_key}",
        )
    if max_b <= min_b:
        max_b = min_b + 0.1
    a, b = float(alpha), float(beta_s)
    exp_mean = min_b + (max_b - min_b) * (a / (a + b))
    st.caption(f"E[X] Beta ≈ **{exp_mean:.2f}** menit pada [{min_b:.2f}, {max_b:.2f}]")
    return DurationDist(
        kind=DistKind.BETA,
        mean=float(exp_mean),
        cv=float(default_cv),
        min_bound=float(min_b),
        max_bound=float(max_b),
        alpha=a,
        beta_shape=b,
    )


def build_config_from_sidebar(
    st,
    operation: OperationType | None = None,
    *,
    container=None,
) -> SimulationConfig:
    """
    Render earthmoving parameter widgets.
    container: st.sidebar (legacy) or st / column (main page). Default: main area via st.
    """
    sb = container if container is not None else st
    preset = default_config_for()
    loader_l, hauler_l, unit = "Excavator", "Dump Truck", "m³"

    sb.subheader("Earthmoving parameters")
    sb.caption(
        f"{loader_l} + {hauler_l} · {unit}. Fleet, cycle distributions, stop criteria."
    )

    num_loaders = sb.number_input(
        f"Jumlah {loader_l}",
        min_value=1,
        max_value=10,
        value=preset.num_loaders,
        step=1,
    )
    num_haulers = sb.number_input(
        f"Jumlah {hauler_l}",
        min_value=1,
        max_value=30,
        value=preset.num_haulers,
        step=1,
    )

    # ----- Distribusi durasi -----
    sb.subheader("Distribusi durasi aktivitas")
    mode = sb.radio(
        "Mode distribusi",
        options=["Sama untuk semua fase", "Berbeda per fase"],
        index=0,
        help="Pilih satu distribusi global, atau atur load/haul/dump/return terpisah.",
    )

    default_cv = float(preset.cv)

    if mode == "Sama untuk semua fase":
        kind_label = sb.selectbox(
            "Jenis distribusi (semua fase)",
            options=_DIST_CHOICES,
            index=_DIST_CHOICES.index(DIST_LABELS[DistKind.NORMAL]),
            key="dist_kind_global",
        )
        global_kind = _LABEL_TO_KIND[kind_label]

        sb.markdown("##### Mean per fase (menit)")
        load_mean = sb.slider(
            "Load (excavator muat truck)", 0.5, 30.0, float(preset.load_time_mean), 0.5
        )
        haul_mean = sb.slider(
            "Haul (truck ke spoil)", 0.5, 60.0, float(preset.haul_time_mean), 0.5
        )
        dump_mean = sb.slider(
            "Dump (bongkar material)", 0.5, 40.0, float(preset.dump_time_mean), 0.5
        )
        return_mean = sb.slider(
            "Return (kembali ke cut)", 0.5, 60.0, float(preset.return_time_mean), 0.5
        )

        load_dist = haul_dist = dump_dist = return_dist = None
        cv_global = 0.0
        beta_params = None

        if global_kind == DistKind.CONSTANT:
            cv_global = 0.0
            sb.caption("Konstan: setiap fase memakai mean di atas tanpa acak.")
        elif global_kind == DistKind.BETA:
            sb.markdown("##### Parameter Beta (semua fase)")
            sb.caption(
                "Untuk setiap fase, interval [min, max] = mean×(1±spread). "
                "Bentuk α, β sama untuk semua."
            )
            alpha = sb.number_input(
                "α (alpha)", min_value=0.1, max_value=50.0, value=2.0, step=0.1
            )
            beta_s = sb.number_input(
                "β (beta)", min_value=0.1, max_value=50.0, value=5.0, step=0.1
            )
            spread = sb.slider(
                "Spread relatif (± fraksi mean)",
                0.1,
                0.9,
                0.4,
                0.05,
                help="min ≈ mean×(1-spread), max ≈ mean×(1+spread)",
            )
            beta_params = (float(alpha), float(beta_s), float(spread))

            def _beta_for(mean: float) -> DurationDist:
                a, b, sp = beta_params
                lo = max(0.05, mean * (1.0 - sp))
                hi = max(lo + 0.1, mean * (1.0 + sp))
                return DurationDist(
                    kind=DistKind.BETA,
                    mean=mean,
                    min_bound=lo,
                    max_bound=hi,
                    alpha=a,
                    beta_shape=b,
                )

            load_dist = _beta_for(load_mean)
            haul_dist = _beta_for(haul_mean)
            dump_dist = _beta_for(dump_mean)
            return_dist = _beta_for(return_mean)
        else:
            cv_global = sb.slider(
                "CV (std/mean) global",
                0.0,
                1.0,
                default_cv,
                0.01,
                help="Dipakai normal / log-normal / gamma untuk semua fase.",
            )
            if global_kind == DistKind.GAMMA and cv_global > 0:
                sb.caption(
                    f"Gamma: k=1/CV²≈{1/(cv_global**2):.2f}, "
                    f"θ=mean·CV² (berbeda per fase lewat mean)."
                )

            def _from_mean(mean: float) -> DurationDist:
                return DurationDist.from_mean_cv(mean, cv_global, global_kind)

            load_dist = _from_mean(load_mean)
            haul_dist = _from_mean(haul_mean)
            dump_dist = _from_mean(dump_mean)
            return_dist = _from_mean(return_mean)

        default_kind = global_kind
        cv_config = float(cv_global) if global_kind != DistKind.BETA else default_cv

    else:
        # Per fase
        sb.caption("Atur distribusi & parameter untuk tiap fase siklus.")
        with sb.expander("① Load (excavator)", expanded=True):
            load_dist = _render_duration_dist_widgets(
                st,
                "load",
                "Load",
                preset.load_time_mean,
                default_cv,
                30.0,
            )
        with sb.expander("② Haul ke spoil", expanded=False):
            haul_dist = _render_duration_dist_widgets(
                st,
                "haul",
                "Haul",
                preset.haul_time_mean,
                default_cv,
                60.0,
            )
        with sb.expander("③ Dump material", expanded=False):
            dump_dist = _render_duration_dist_widgets(
                st,
                "dump",
                "Dump",
                preset.dump_time_mean,
                default_cv,
                40.0,
            )
        with sb.expander("④ Return ke cut", expanded=False):
            return_dist = _render_duration_dist_widgets(
                st,
                "return",
                "Return",
                preset.return_time_mean,
                default_cv,
                60.0,
            )
        load_mean = load_dist.expected_mean()
        haul_mean = haul_dist.expected_mean()
        dump_mean = dump_dist.expected_mean()
        return_mean = return_dist.expected_mean()
        default_kind = DistKind.NORMAL
        cv_config = default_cv

    payload = sb.number_input(
        f"Kapasitas per trip ({unit})",
        min_value=0.5,
        max_value=100.0,
        value=float(preset.payload_per_trip),
        step=0.5,
    )

    # ----- Batas simulasi -----
    sb.subheader("Batas simulasi")
    stop_label = sb.radio(
        "Mode berhenti",
        options=["Jumlah siklus", "Durasi waktu"],
        index=0,
        help=(
            "Jumlah siklus: simulasi berhenti setelah N trip (dump) selesai. "
            "Durasi waktu: berhenti setelah jam kerja habis."
        ),
    )

    target_cycles = 0
    stop_mode = "duration"
    if stop_label == "Jumlah siklus":
        stop_mode = "cycles"
        target_cycles = int(
            sb.number_input(
                "Jumlah siklus yang disimulasikan",
                min_value=1,
                max_value=2000,
                value=50,
                step=1,
            )
        )
        duration_h = sb.slider(
            "Batas waktu maksimum (jam)",
            1.0,
            24.0,
            12.0,
            0.5,
        )
    else:
        stop_mode = "duration"
        target_cycles = 0
        duration_h = sb.slider(
            "Durasi simulasi (jam)",
            1.0,
            12.0,
            float(preset.simulation_duration) / 60.0,
            0.5,
        )

    use_seed = sb.checkbox("Gunakan seed tetap (reproducible)", value=True)
    seed = None
    if use_seed:
        seed = int(
            sb.number_input("Seed", min_value=0, max_value=99999, value=42)
        )

    return SimulationConfig(
        operation=OperationType.EARTHMOVING,
        num_loaders=int(num_loaders),
        num_haulers=int(num_haulers),
        load_time_mean=float(load_mean),
        haul_time_mean=float(haul_mean),
        dump_time_mean=float(dump_mean),
        return_time_mean=float(return_mean),
        load_dist=load_dist,
        haul_dist=haul_dist,
        dump_dist=dump_dist,
        return_dist=return_dist,
        payload_per_trip=float(payload),
        simulation_duration=float(duration_h) * 60.0,
        target_cycles=int(target_cycles),
        stop_mode=stop_mode,
        cv=float(cv_config),
        default_dist_kind=default_kind,
        seed=seed,
    )
