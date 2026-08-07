"""
SiklOps — Simulation of Cyclic Construction Operations
Streamlit Community Cloud entry: app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pandas as pd
import plotly.express as px
import streamlit as st

from modules.feedback import render_feedback
from modules.operation_selection import EARTHMOVING_INFO
from modules.parameter_input import build_config_from_sidebar
from modules.rmc_engine import (
    compare_methods,
    config_from_site,
    derive_place_cycle,
    method_profile,
    run_rmc,
)
from modules.simulation_engine import (
    APP_VERSION,
    DIST_LABELS,
    DistKind,
    DurationDist,
    OperationType,
    SimulationConfig,
    default_config_for,
    run_simulation,
)
from modules.visualization import render_results

st.set_page_config(
    page_title=f"SiklOps {APP_VERSION}",
    page_icon="🔁",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# SIDEBAR — operation catalog only (like web SiklOps)
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown(f"## SiklOps")
    st.caption(f"v{APP_VERSION} · Cyclic construction ops · DES")
    st.markdown("---")
    st.markdown("**Operations**")
    operation = st.radio(
        "Select operation",
        ["Earthmoving", "Concreting"],
        index=0,
        label_visibility="collapsed",
        help="Catalog of construction production operations.",
    )
    st.markdown("---")
    st.caption(
        {
            "Earthmoving": "Excavator + dump truck · Load–Haul–Dump–Return",
            "Concreting": "RMC dual-cycle · Buggy / Crane / Pump · site buffer",
        }[operation]
    )
    st.markdown("---")
    st.markdown("**Manual**")
    if st.button("Open general manual", use_container_width=True):
        st.session_state.show_manual = True
    if st.button("Hide manual", use_container_width=True):
        st.session_state.show_manual = False

# ---------------------------------------------------------------------------
# HEADER
# ---------------------------------------------------------------------------
st.title(f"SiklOps {APP_VERSION}")
st.markdown(
    "**Simulation of Cyclic Construction Operations**  \n"
    "Discrete-event simulation for construction production cycles."
)

if st.session_state.get("show_manual"):
    with st.expander("Manual (general)", expanded=True):
        st.markdown(
            f"""
### About SiklOps {APP_VERSION}
Educational **DES** for **cyclic** construction operations — not full-project CPM scheduling.

### Operations
1. **Earthmoving** — excavator loads dump trucks; haul–dump–return.
2. **Concreting (RMC)** — **Cycle A** truck mixer plant↔site; **Cycle B** placing
   (concrete buggy / tower crane + bucket / mobile pump). Coupled by a **site buffer**:
   trucks wait if buffer is **full**; placing waits if buffer is **empty**.

### How to use
1. Pick an operation in the **left sidebar**.
2. Set parameters on the **main page**.
3. Run simulation → inspect metrics, charts, bottleneck.

### Tips
- Use a fixed **seed** for reproducible classroom demos.
- Compare fleet or method variants (what-if) after a baseline run.
"""
        )

# ---------------------------------------------------------------------------
# EARTHMOVING — params on MAIN
# ---------------------------------------------------------------------------
if operation == "Earthmoving":
    st.header("Earthmoving (cut & haul)")
    st.info(
        f"**{EARTHMOVING_INFO.title}**  \n"
        f"{EARTHMOVING_INFO.description}  \n\n"
        f"Resources: **{EARTHMOVING_INFO.loader_label}** + **{EARTHMOVING_INFO.hauler_label}** · "
        f"Unit: **{EARTHMOVING_INFO.unit}**  \n"
        f"Tasks: **Load → Haul → Dump → Return**"
    )

    preset = default_config_for()

    st.subheader("Resources")
    r1, r2, r3 = st.columns(3)
    with r1:
        num_loaders = st.number_input("Excavators", 1, 10, int(preset.num_loaders), 1)
    with r2:
        num_haulers = st.number_input("Dump trucks", 1, 30, int(preset.num_haulers), 1)
    with r3:
        payload = st.number_input("Payload per trip (m³)", 0.5, 100.0, float(preset.payload_per_trip), 0.5)

    st.subheader("Tasks (cycle time) — mean minutes + distribution")
    mode = st.radio(
        "Distribution mode",
        ["Same for all phases", "Per phase"],
        horizontal=True,
    )
    dist_labels = list(DIST_LABELS.values())
    label_to_kind = {v: k for k, v in DIST_LABELS.items()}

    if mode == "Same for all phases":
        c1, c2, c3, c4 = st.columns(4)
        with c1:
            load_mean = st.slider("Load", 0.5, 30.0, float(preset.load_time_mean), 0.5)
        with c2:
            haul_mean = st.slider("Haul", 0.5, 60.0, float(preset.haul_time_mean), 0.5)
        with c3:
            dump_mean = st.slider("Dump", 0.5, 40.0, float(preset.dump_time_mean), 0.5)
        with c4:
            return_mean = st.slider("Return", 0.5, 60.0, float(preset.return_time_mean), 0.5)
        d1, d2 = st.columns(2)
        with d1:
            kind_label = st.selectbox("Distribution (all phases)", dist_labels, index=1)
        with d2:
            kind = label_to_kind[kind_label]
            if kind == DistKind.CONSTANT:
                cv = 0.0
                st.caption("Constant — no randomness")
            else:
                cv = st.slider("CV (std/mean)", 0.0, 1.0, 0.20, 0.01)
        load_dist = DurationDist.from_mean_cv(load_mean, cv, kind)
        haul_dist = DurationDist.from_mean_cv(haul_mean, cv, kind)
        dump_dist = DurationDist.from_mean_cv(dump_mean, cv, kind)
        return_dist = DurationDist.from_mean_cv(return_mean, cv, kind)
    else:
        phases = [
            ("load", "Load", preset.load_time_mean, 30.0),
            ("haul", "Haul", preset.haul_time_mean, 60.0),
            ("dump", "Dump", preset.dump_time_mean, 40.0),
            ("return", "Return", preset.return_time_mean, 60.0),
        ]
        dists = {}
        means = {}
        for key, title, dmean, mx in phases:
            with st.expander(f"{title}", expanded=(key == "load")):
                m = st.slider(f"{title} mean (min)", 0.5, mx, float(dmean), 0.5, key=f"m_{key}")
                kl = st.selectbox(f"{title} dist", dist_labels, index=1, key=f"k_{key}")
                k = label_to_kind[kl]
                c = 0.0 if k == DistKind.CONSTANT else st.slider(
                    f"{title} CV", 0.0, 1.0, 0.2, 0.01, key=f"c_{key}"
                )
                means[key] = m
                dists[key] = DurationDist.from_mean_cv(m, c, k)
        load_mean, haul_mean, dump_mean, return_mean = (
            means["load"],
            means["haul"],
            means["dump"],
            means["return"],
        )
        load_dist, haul_dist, dump_dist, return_dist = (
            dists["load"],
            dists["haul"],
            dists["dump"],
            dists["return"],
        )
        kind = DistKind.NORMAL
        cv = 0.2

    st.subheader("Simulation setup")
    s1, s2, s3, s4 = st.columns(4)
    with s1:
        stop_label = st.selectbox("Stop mode", ["Cycles", "Duration (hours)"])
    with s2:
        if stop_label == "Cycles":
            target_cycles = st.number_input("Target cycles", 1, 2000, 50, 1)
            duration_h = st.number_input("Time cap (h)", 1.0, 24.0, 12.0, 0.5)
            stop_mode = "cycles"
        else:
            target_cycles = 0
            duration_h = st.number_input("Duration (h)", 1.0, 24.0, 8.0, 0.5)
            stop_mode = "duration"
    with s3:
        seed = st.number_input("Seed", 0, 999999, 42, 1)
    with s4:
        st.write("")
        run_clicked = st.button("▶ Run Earthmoving", type="primary", use_container_width=True)

    config = SimulationConfig(
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
        cv=float(cv) if mode == "Same for all phases" else 0.2,
        default_dist_kind=kind if mode == "Same for all phases" else DistKind.NORMAL,
        seed=int(seed),
    )

    if "em_result" not in st.session_state:
        st.session_state.em_result = None

    if run_clicked:
        with st.spinner("Running earthmoving DES…"):
            st.session_state.em_result = run_simulation(config)

    result = st.session_state.em_result
    if result is None:
        st.info("Adjust parameters above, then click **Run Earthmoving**.")
    else:
        st.subheader("Results")
        render_results(st, result)
        st.subheader("Feedback & what-if")
        if render_feedback(st, result):
            st.session_state.em_result = None
            st.rerun()

# ---------------------------------------------------------------------------
# CONCRETING — params on MAIN
# ---------------------------------------------------------------------------
else:
    st.header("Concreting — ready-mixed concrete placing")
    st.markdown(
        """
Two interacting cycles share a **site buffer**:

| Cycle | Flow |
|---|---|
| **A — Truck mixer** | Batching plant → haul → **discharge to buffer** → return |
| **B — Placing** | Fill from buffer → travel → place → return |
| **Who waits?** | Buffer **full** → trucks wait · Buffer **empty** → place waits |
"""
    )

    st.subheader("Site scenario (shared by all placing methods)")
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        distance_m = st.number_input("Horizontal distance (m)", 0.0, 200.0, 40.0, 1.0)
    with c2:
        height_m = st.number_input("Vertical height (m)", 0.0, 100.0, 6.0, 0.5)
    with c3:
        target_volume = st.number_input("Target volume (m³)", 1.0, 500.0, 40.0, 1.0)
    with c4:
        target_cycles = st.number_input("Target cycles (cap)", 1, 500, 40, 1)

    c5, c6, c7, c8 = st.columns(4)
    with c5:
        num_trucks = st.number_input("Truck mixers", 1, 20, 3, 1)
    with c6:
        truck_cap = st.number_input("Drum capacity (m³)", 1.0, 12.0, 5.0, 0.5)
    with c7:
        buffer_cap = st.number_input("Site buffer (m³)", 0.5, 40.0, 6.0, 0.5)
    with c8:
        seed = st.number_input("Seed", 0, 999999, 12345, 1)

    st.markdown("**Cycle A — truck mixer (mean minutes + CV)**")
    d1, d2, d3, d4, d5 = st.columns(5)
    with d1:
        batch_m = st.number_input("Batch", 0.5, 60.0, 5.0, 0.5)
    with d2:
        haul_m = st.number_input("Haul", 0.5, 120.0, 18.0, 0.5)
    with d3:
        disc_m = st.number_input("Discharge", 0.5, 40.0, 4.0, 0.5)
    with d4:
        ret_m = st.number_input("Return", 0.5, 120.0, 16.0, 0.5)
    with d5:
        cv = st.slider("CV", 0.0, 1.0, 0.2, 0.01)

    truck_means = {
        "batch": batch_m,
        "haul": haul_m,
        "discharge": disc_m,
        "return": ret_m,
    }

    tabs = st.tabs(["Concrete Buggy", "Tower Crane + Bucket", "Mobile Pump", "Compare"])
    methods = ("buggy", "crane", "pump")

    for tab, method in zip(tabs[:3], methods):
        with tab:
            prof = method_profile(method)
            der = derive_place_cycle(method, distance_m, height_m)
            st.markdown(f"### {prof['label']}")
            st.caption(der["note"])
            t1, t2, t3 = st.columns(3)
            t1.metric("Suitability", der["suitability"])
            t2.metric("Place cycle (min)", f"{der['cycle']:.1f}")
            t3.metric("Place capacity", f"{prof['place_capacity_m3']} m³")
            st.write(
                {
                    "tasks": {
                        "buggy": ["Fill buggy", "Travel", "Place", "Return empty"],
                        "crane": ["Fill bucket", "Lift / swing", "Place", "Return bucket"],
                        "pump": ["Charge hopper", "Pump (line)", "Place", "Reset hose tip"],
                    }[method],
                    "derived_means_min": der,
                }
            )
            n_place = st.number_input(
                "Place units",
                1,
                20,
                prof["num_place"],
                1,
                key=f"np_{method}",
            )
            if st.button(f"▶ Run {prof['label']}", key=f"run_{method}", type="primary"):
                cfg = config_from_site(
                    method,
                    distance_m,
                    height_m,
                    num_trucks=int(num_trucks),
                    truck_capacity_m3=float(truck_cap),
                    buffer_capacity_m3=float(buffer_cap),
                    target_volume=float(target_volume),
                    target_cycles=int(target_cycles),
                    seed=int(seed),
                    cv=float(cv),
                    truck_means=truck_means,
                    num_place=int(n_place),
                )
                with st.spinner("Running dual-cycle RMC…"):
                    st.session_state[f"rmc_{method}"] = run_rmc(cfg)

            r = st.session_state.get(f"rmc_{method}")
            if r is not None:
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("Throughput", f"{r.throughput_per_hour:.1f} m³/h")
                m2.metric("Volume", f"{r.total_volume:.1f} m³")
                m3.metric("Truck util", f"{r.truck_utilization*100:.0f}%")
                m4.metric("Place util", f"{r.place_utilization*100:.0f}%")
                st.info(f"**Bottleneck:** {r.bottleneck} — {r.bottleneck_reason}")
                if r.timeline_volume:
                    df = pd.DataFrame(r.timeline_volume, columns=["t_min", "cum_m3"])
                    st.plotly_chart(
                        px.line(df, x="t_min", y="cum_m3", title="Cumulative production (m³)"),
                        use_container_width=True,
                    )

    with tabs[3]:
        st.markdown("### Compare placing methods (same site scenario)")
        if st.button("▶ Compare Buggy · Crane · Pump", type="primary"):
            with st.spinner("Running 3 methods…"):
                st.session_state.rmc_compare = compare_methods(
                    distance_m,
                    height_m,
                    num_trucks=int(num_trucks),
                    truck_capacity_m3=float(truck_cap),
                    buffer_capacity_m3=float(buffer_cap),
                    target_volume=float(target_volume),
                    target_cycles=int(target_cycles),
                    seed=int(seed),
                    cv=float(cv),
                    truck_means=truck_means,
                )
        rows = st.session_state.get("rmc_compare")
        if rows:
            table = [
                {
                    "method": method_profile(r.method)["label"],
                    "suitability": r.suitability,
                    "throughput_m3_h": round(r.throughput_per_hour, 2),
                    "hours": round(r.simulated_minutes / 60.0, 2),
                    "truck_util_%": round(r.truck_utilization * 100, 1),
                    "place_util_%": round(r.place_utilization * 100, 1),
                    "volume_m3": round(r.total_volume, 1),
                    "bottleneck": r.bottleneck,
                }
                for r in rows
            ]
            df = pd.DataFrame(table)
            st.dataframe(df, use_container_width=True)
            st.plotly_chart(
                px.bar(df, x="method", y="throughput_m3_h", title="Throughput (m³/h)"),
                use_container_width=True,
            )
            st.plotly_chart(
                px.bar(
                    df.melt(
                        id_vars=["method"],
                        value_vars=["truck_util_%", "place_util_%"],
                        var_name="resource",
                        value_name="util",
                    ),
                    x="method",
                    y="util",
                    color="resource",
                    barmode="group",
                    title="Utilization (%)",
                ),
                use_container_width=True,
            )
            for r in rows:
                st.caption(f"**{method_profile(r.method)['label']}:** {r.note}")
        else:
            st.info("Click **Compare** to run all three placing methods.")

st.markdown("---")
st.caption(
    f"SiklOps {APP_VERSION} · Cyclic construction operations · "
    "Python + Streamlit · Discrete Event Simulation · Learning"
)
