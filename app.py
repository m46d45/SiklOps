"""
SiklOps v1.1 — Simulation of Cyclic Construction Operations
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
from modules.simulation_engine import APP_VERSION, OperationType, run_simulation
from modules.visualization import render_results

st.set_page_config(
    page_title=f"SiklOps {APP_VERSION}",
    page_icon="🔁",
    layout="wide",
)

st.title(f"🔁 SiklOps {APP_VERSION}")
st.markdown(
    "**Simulation of Cyclic Construction Operations**  \n"
    "Discrete-event simulation for construction production cycles — "
    "earthmoving & ready-mixed concrete placing."
)
st.caption(
    f"v{APP_VERSION} · Streamlit · DES · Learning tool · "
    "Successor concept to SimKon (rebranded multi-operation template)"
)

operation = st.sidebar.radio(
    "Operation",
    ["Earthmoving", "Concreting (RMC placing)"],
    index=0,
)

# ---------------------------------------------------------------------------
# EARTHMOVING
# ---------------------------------------------------------------------------
if operation == "Earthmoving":
    st.header("Earthmoving (cut & haul)")
    st.info(
        f"**{EARTHMOVING_INFO.title}**  \n"
        f"{EARTHMOVING_INFO.description}  \n\n"
        f"Resources: **{EARTHMOVING_INFO.loader_label}** + **{EARTHMOVING_INFO.hauler_label}** · "
        f"Unit: **{EARTHMOVING_INFO.unit}**"
    )

    config = build_config_from_sidebar(st)

    with st.expander("Active parameter summary", expanded=False):
        st.write(
            {
                "version": APP_VERSION,
                "operation": "earthmoving",
                "excavator": config.num_loaders,
                "dump_truck": config.num_haulers,
                "payload_m3": config.payload_per_trip,
                "stop_mode": config.stop_mode,
                "target_cycles": config.target_cycles,
                "seed": config.seed,
                "cycle_mean_min": round(config.cycle_time_mean(), 2),
                "distributions": config.distributions_summary(),
            }
        )

    st.subheader("Run simulation")
    col_run, col_info = st.columns([1, 3])
    with col_run:
        run_clicked = st.button("▶ Run Earthmoving", type="primary", use_container_width=True)
    with col_info:
        st.caption("DES engine: event queue + random durations. Results stay in session.")

    if "em_result" not in st.session_state:
        st.session_state.em_result = None

    if run_clicked or st.session_state.em_result is None:
        with st.spinner("Running earthmoving DES…"):
            st.session_state.em_result = run_simulation(config)

    result = st.session_state.em_result
    if result is not None:
        st.subheader("Results")
        render_results(st, result)
        st.subheader("Feedback & what-if")
        want = render_feedback(st, result)
        if want:
            st.session_state.em_result = None
            st.rerun()

# ---------------------------------------------------------------------------
# CONCRETING
# ---------------------------------------------------------------------------
else:
    st.header("Concreting — RMC placing")
    st.markdown(
        """
**Dual-cycle model**

| Cycle | Content |
|---|---|
| **A — Truck mixer** | Batching plant → haul to site → **discharge to buffer** → return |
| **B — Placing** | Fill from buffer → travel → place → return |
| **Coupling** | **Site buffer** — trucks wait if **full**; place waits if **empty** |

Three placing methods under the **same site scenario** (distance & height).
"""
    )

    st.subheader("Site scenario (shared)")
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

    st.markdown("**Cycle A — truck mixer times (mean, minutes) + CV**")
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
        cv = st.slider("CV (all truck phases)", 0.0, 1.0, 0.2, 0.01)

    truck_means = {
        "batch": batch_m,
        "haul": haul_m,
        "discharge": disc_m,
        "return": ret_m,
    }

    tabs = st.tabs(["Buggy", "Crane + Bucket", "Mobile Pump", "Compare methods"])

    methods = ("buggy", "crane", "pump")
    for tab, method in zip(tabs[:3], methods):
        with tab:
            prof = method_profile(method)
            der = derive_place_cycle(method, distance_m, height_m)
            st.markdown(f"### {prof['label']}")
            st.caption(der["note"])
            st.write(
                {
                    "suitability": der["suitability"],
                    "place_cycle_min": der,
                    "default_place_units": prof["num_place"],
                    "place_capacity_m3": prof["place_capacity_m3"],
                }
            )
            n_place = st.number_input(
                f"Number of place units ({method})",
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
                    r = run_rmc(cfg)
                st.session_state[f"rmc_{method}"] = r

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
                    fig = px.line(df, x="t_min", y="cum_m3", title="Cumulative production (m³)")
                    st.plotly_chart(fig, use_container_width=True)
                st.json(r.to_dict())

    with tabs[3]:
        st.markdown("### Compare placing methods (same site scenario)")
        if st.button("▶ Compare Buggy · Crane · Pump", type="primary"):
            with st.spinner("Running 3 methods…"):
                rows = compare_methods(
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
            st.session_state.rmc_compare = rows

        rows = st.session_state.get("rmc_compare")
        if rows:
            table = []
            for r in rows:
                table.append(
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
                )
            df = pd.DataFrame(table)
            st.dataframe(df, use_container_width=True)
            fig = px.bar(df, x="method", y="throughput_m3_h", title="Throughput (m³/h)")
            st.plotly_chart(fig, use_container_width=True)
            fig2 = px.bar(
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
            )
            st.plotly_chart(fig2, use_container_width=True)
            for r in rows:
                st.caption(f"**{method_profile(r.method)['label']}:** {r.note}")

st.markdown("---")
st.caption(
    f"SiklOps {APP_VERSION} · Cyclic construction operations · "
    "Python + Streamlit · Discrete Event Simulation · Learning"
)
