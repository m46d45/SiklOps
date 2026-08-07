"""
Visualisasi Little's Law & Kingman — tinjauan **seluruh sistem** Earthmoving.
Layout legenda di bawah plot agar tidak tumpang-tindih di web.
"""

from __future__ import annotations

import math

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from .plot_style import apply_readable_layout, plotly_chart
from .queueing_theory import analyze_system, kingman_curve_vs_rho
from .simulation_engine import SimulationResult


def _finite(x: float | None, default: float = 0.0) -> float:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return default
    return float(x)


def render_queueing_theory(st, result: SimulationResult, labels: dict[str, str]) -> None:
    """Little's Law + satu kurva Kingman untuk seluruh sistem."""
    st.subheader("Little's Law & Kingman — tinjauan sistem")
    st.caption(
        "Bukan kurva per-resource, melainkan **satu tinjauan sistem earthmoving**. "
        "Legenda grafik ada di **bawah** plot. Baseline **tanpa variasi** (hijau) selalu ada."
    )

    s = analyze_system(result)

    with st.expander("Rumus tinjauan sistem", expanded=False):
        st.markdown(
            rf"""
### Little's Law

**1) Antrian di stasiun load**

\[
L_q = \lambda_{{\mathrm{{arr}}}} \, W_q
\]

**2) Sistem armada (closed fleet)**

\[
N \approx \lambda_{{\mathrm{{trip}}}} \cdot W_{{\mathrm{{cycle}}}}
\]

### Kingman (sistem)

\[
W_q \approx \frac{{c_a^2 + c_s^2}}{{2}} \cdot \frac{{\rho}}{{1-\rho}} \cdot t_s
\]

**Tanpa variasi** (\(c_a=c_s=0\)): \(W_q \approx 0\), cycle time \(\approx t_s\).
"""
        )

    # ========== LITTLE ==========
    st.markdown("#### Little's Law")
    b1, b2, b3 = st.columns(3)
    b1.metric("Bottleneck sistem", s["bottleneck"])
    b2.metric(f"ρ {labels['loader']}", f"{s['rho_excavator']*100:.1f}%")
    b3.metric(f"ρ {labels['hauler']}", f"{s['rho_truck']*100:.1f}%")

    st.markdown("##### (A) Antrian load")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("λ arr (truck/jam)", f"{s['lambda_arr_per_hour']:.2f}")
    c2.metric("L_q sim", f"{s['L_q_sim']:.3f}")
    c3.metric("L_q = λ·W_q", f"{s['L_q_little']:.3f}")
    c4.metric("W_q sim (mnt)", f"{s['W_q_sim']:.3f}")

    fig_lq = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=("L_q antrian load", "W_q antrian load (menit)"),
        horizontal_spacing=0.12,
        vertical_spacing=0.15,
    )
    fig_lq.add_trace(
        go.Bar(
            x=["Sim", "Little λW_q"],
            y=[s["L_q_sim"], s["L_q_little"]],
            marker_color=["#2980b9", "#27ae60"],
            text=[f"{s['L_q_sim']:.3f}", f"{s['L_q_little']:.3f}"],
            textposition="outside",
            cliponaxis=False,
            showlegend=False,
        ),
        row=1,
        col=1,
    )
    fig_lq.add_trace(
        go.Bar(
            x=["Sim", "Little L_q/λ"],
            y=[s["W_q_sim"], s["W_q_from_L"]],
            marker_color=["#2980b9", "#f39c12"],
            text=[f"{s['W_q_sim']:.3f}", f"{s['W_q_from_L']:.3f}"],
            textposition="outside",
            cliponaxis=False,
            showlegend=False,
        ),
        row=1,
        col=2,
    )
    apply_readable_layout(
        fig_lq,
        title="Verifikasi Little's Law — antrian load",
        height=380,
        show_legend=False,
        has_subplots=True,
    )
    plotly_chart(st, fig_lq)

    st.markdown(
        r"##### (B) Sistem armada — \(N \approx \lambda_{\mathrm{trip}} \cdot W_{\mathrm{cycle}}\)"
    )
    d1, d2, d3, d4 = st.columns(4)
    d1.metric("N dump truck", f"{int(s['N_fleet'])}")
    d2.metric("λ trip (/jam)", f"{s['lambda_trip_per_hour']:.2f}")
    d3.metric("W_cycle sim (mnt)", f"{s['W_cycle_sim']:.2f}")
    d4.metric("λ·W_cycle (≈N)", f"{s['L_sys_little']:.2f}")

    fig_n = go.Figure(
        data=[
            go.Bar(
                x=[
                    "N armada",
                    "Little λ·W",
                    "W_cycle sim",
                    "W = N/λ",
                ],
                y=[
                    s["N_fleet"],
                    s["L_sys_little"],
                    s["W_cycle_sim"],
                    s["W_cycle_from_little"],
                ],
                marker_color=["#2980b9", "#27ae60", "#8e44ad", "#e67e22"],
                text=[
                    f"{s['N_fleet']:.1f}",
                    f"{s['L_sys_little']:.2f}",
                    f"{s['W_cycle_sim']:.1f}",
                    f"{s['W_cycle_from_little']:.1f}",
                ],
                textposition="outside",
                cliponaxis=False,
            )
        ]
    )
    apply_readable_layout(
        fig_n,
        title="Little's Law sistem: armada vs prediksi λ·W",
        height=400,
        show_legend=False,
        extra=dict(yaxis_title="Nilai (N atau menit)"),
    )
    plotly_chart(st, fig_n)

    err_n = s.get("little_N_error_rel")
    if err_n is not None:
        st.caption(
            f"Selisih relatif N vs λ·W_cycle: **{err_n*100:+.1f}%** "
            f"(pada sistem tertutup ideal ≈ 0%)."
        )

    # ========== KINGMAN SISTEM ==========
    st.markdown("#### Kingman — seluruh sistem")
    st.caption(
        f"Bottleneck: **{s['bottleneck']}** (ρ = {s['rho_sys']*100:.1f}%). "
        f"tₛ = **{s['t_s_sys']:.2f} mnt** · "
        f"cₐ = {s['c_a_sys']:.2f} · cₛ = {s['c_s_sys']:.2f} · "
        f"VUT = {s['vut_factor']:.3f}."
    )

    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric("ρ sistem", f"{s['rho_sys']*100:.1f}%")
    k2.metric("tₛ produktif (mnt)", f"{s['t_s_sys']:.2f}")
    k3.metric("cₐ / cₛ", f"{s['c_a_sys']:.2f} / {s['c_s_sys']:.2f}")
    k4.metric("W_q tanpa variasi", f"{_finite(s['W_q_kingman_no_var']):.3f}")
    k5.metric(
        "W_q Kingman +variasi",
        f"{_finite(s['W_q_kingman']):.3f}" if s["W_q_kingman"] is not None else "∞",
    )

    fig_bar = go.Figure(
        data=[
            go.Bar(
                name="Tanpa variasi",
                x=["W_q (menit)", "Cycle time CT (menit)"],
                y=[_finite(s["W_q_kingman_no_var"]), _finite(s["CT_no_var"])],
                marker_color="#27ae60",
                text=[
                    f"{_finite(s['W_q_kingman_no_var']):.2f}",
                    f"{_finite(s['CT_no_var']):.2f}",
                ],
                textposition="outside",
                cliponaxis=False,
            ),
            go.Bar(
                name="Kingman +variasi",
                x=["W_q (menit)", "Cycle time CT (menit)"],
                y=[_finite(s["W_q_kingman"]), _finite(s["CT_kingman"])],
                marker_color="#c0392b",
                text=[
                    f"{_finite(s['W_q_kingman']):.2f}",
                    f"{_finite(s['CT_kingman']):.2f}",
                ],
                textposition="outside",
                cliponaxis=False,
            ),
            go.Bar(
                name="Simulasi DES",
                x=["W_q (menit)", "Cycle time CT (menit)"],
                y=[s["W_q_sim"], s["CT_sim"]],
                marker_color="#2980b9",
                text=[f"{s['W_q_sim']:.2f}", f"{s['CT_sim']:.2f}"],
                textposition="outside",
                cliponaxis=False,
            ),
        ]
    )
    apply_readable_layout(
        fig_bar,
        title="Sistem: W_q & cycle time — tanpa variasi vs Kingman vs DES",
        height=440,
        show_legend=True,
        extra=dict(
            barmode="group",
            yaxis=dict(rangemode="tozero", title="Menit", automargin=True),
        ),
    )
    plotly_chart(st, fig_bar)

    # Kurva sistem
    curve_var = kingman_curve_vs_rho(
        t_s=s["t_s_sys"],
        c_a=s["c_a_sys"],
        c_s=s["c_s_sys"],
        c_servers=1,
        rho_max=0.95,
        n_points=50,
        mode="vut_classic",
    )
    curve_0 = kingman_curve_vs_rho(
        t_s=s["t_s_sys"],
        c_a=0.0,
        c_s=0.0,
        c_servers=1,
        rho_max=0.95,
        n_points=50,
        mode="vut_classic",
    )
    df_v = pd.DataFrame(curve_var)
    df_0 = pd.DataFrame(curve_0)
    df_v = df_v[df_v["W_q_kingman"].apply(lambda x: x == x and not math.isinf(x))]
    df_v = df_v.copy()
    df_0 = df_0.copy()
    df_v["CT"] = s["t_s_sys"] + df_v["W_q_kingman"]
    df_0["CT"] = s["t_s_sys"] + df_0["W_q_kingman"]

    fig_curve = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=(
            "W_q sistem vs ρ bottleneck",
            "Cycle time CT = tₛ + W_q vs ρ",
        ),
        horizontal_spacing=0.12,
        vertical_spacing=0.18,
    )

    fig_curve.add_trace(
        go.Scatter(
            x=df_0["rho_pct"],
            y=df_0["W_q_kingman"],
            mode="lines",
            name="Tanpa variasi (default)",
            line=dict(color="#27ae60", width=3, dash="dash"),
        ),
        row=1,
        col=1,
    )
    fig_curve.add_trace(
        go.Scatter(
            x=df_v["rho_pct"],
            y=df_v["W_q_kingman"],
            mode="lines",
            name=f"Kingman +variasi (cₐ={s['c_a_sys']:.2f}, cₛ={s['c_s_sys']:.2f})",
            line=dict(color="#c0392b", width=3),
        ),
        row=1,
        col=1,
    )
    fig_curve.add_trace(
        go.Scatter(
            x=[s["rho_sys"] * 100],
            y=[s["W_q_sim"]],
            mode="markers",
            name="Titik operasi DES (W_q)",
            marker=dict(size=12, color="#2980b9", symbol="circle"),
        ),
        row=1,
        col=1,
    )
    fig_curve.add_trace(
        go.Scatter(
            x=[s["rho_sys"] * 100],
            y=[_finite(s["W_q_vut_classic"])],
            mode="markers",
            name="Titik operasi Kingman",
            marker=dict(size=11, color="#c0392b", symbol="diamond"),
        ),
        row=1,
        col=1,
    )

    fig_curve.add_trace(
        go.Scatter(
            x=df_0["rho_pct"],
            y=df_0["CT"],
            mode="lines",
            name="CT tanpa variasi",
            line=dict(color="#27ae60", width=3, dash="dash"),
            showlegend=False,
        ),
        row=1,
        col=2,
    )
    fig_curve.add_trace(
        go.Scatter(
            x=df_v["rho_pct"],
            y=df_v["CT"],
            mode="lines",
            name="CT Kingman +variasi",
            line=dict(color="#8e44ad", width=3),
        ),
        row=1,
        col=2,
    )
    fig_curve.add_trace(
        go.Scatter(
            x=[s["rho_sys"] * 100],
            y=[s["CT_sim"]],
            mode="markers",
            name="Titik operasi DES (CT)",
            marker=dict(size=12, color="#2980b9", symbol="circle"),
            showlegend=False,
        ),
        row=1,
        col=2,
    )

    # Garis ρ vertikal tanpa annotation di plot
    for col in (1, 2):
        fig_curve.add_vline(
            x=s["rho_sys"] * 100,
            line_dash="dot",
            line_color="#95a5a6",
            line_width=1,
            row=1,
            col=col,
        )

    fig_curve.update_xaxes(title_text="Utilisasi bottleneck ρ (%)", row=1, col=1)
    fig_curve.update_xaxes(title_text="Utilisasi bottleneck ρ (%)", row=1, col=2)
    fig_curve.update_yaxes(
        title_text="W_q (menit)", rangemode="tozero", row=1, col=1
    )
    fig_curve.update_yaxes(
        title_text="Cycle time (menit)", rangemode="tozero", row=1, col=2
    )
    apply_readable_layout(
        fig_curve,
        title=(
            f"Kingman sistem — bottleneck {s['bottleneck']} "
            f"(ρ = {s['rho_sys']*100:.1f}%)"
        ),
        height=500,
        show_legend=True,
        has_subplots=True,
    )
    plotly_chart(st, fig_curve)

    st.caption(
        f"**Garis abu-abu putus:** posisi ρ operasi = {s['rho_sys']*100:.1f}%.  \n"
        "**Hijau putus:** tanpa variasi (W_q = 0, CT = tₛ).  \n"
        "**Merah / ungu:** Kingman dengan variasi dari DES.  \n"
        "**Titik biru:** observasi simulasi."
    )

    with st.expander("Tabel metrik tinjauan sistem"):
        rows = [
            ("Bottleneck", s["bottleneck"]),
            ("N dump truck", s["N_fleet"]),
            ("λ trip (/jam)", s["lambda_trip_per_hour"]),
            ("W_q sim (mnt)", s["W_q_sim"]),
            ("W_cycle sim (mnt)", s["W_cycle_sim"]),
            ("t_s produktif (mnt)", s["t_s_sys"]),
            ("c_a / c_s", f"{s['c_a_sys']:.3f} / {s['c_s_sys']:.3f}"),
            ("ρ sistem", s["rho_sys"]),
            ("W_q tanpa variasi", _finite(s["W_q_kingman_no_var"])),
            ("W_q Kingman", _finite(s["W_q_kingman"])),
            ("CT tanpa variasi", s["CT_no_var"]),
            ("CT Kingman", _finite(s["CT_kingman"])),
            ("CT sim", s["CT_sim"]),
        ]
        df = pd.DataFrame(rows, columns=["Metrik", "Nilai"])
        df["Nilai"] = df["Nilai"].apply(
            lambda x: f"{x:.4f}" if isinstance(x, float) else str(x)
        )
        st.dataframe(df, use_container_width=True, hide_index=True)
