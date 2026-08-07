"""
Modul 4 — Visualisasi & Hasil

Menampilkan metrik angka, grafik siklus operasi, dan produktivitas.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from .operation_selection import get_operation
from .plot_style import apply_readable_layout, plotly_chart
from .queueing_viz import render_queueing_theory
from .simulation_engine import SimulationResult, resource_labels

# Palet fase siklus (konsisten di semua chart)
PHASE_COLORS = {
    "wait": "#95a5a6",
    "load": "#e67e22",
    "haul": "#2980b9",
    "dump": "#27ae60",
    "return": "#8e44ad",
}
PHASE_LABELS = {
    "wait": "Tunggu (antri excavator)",
    "load": "Load (excavator)",
    "haul": "Haul ke spoil",
    "dump": "Dump material",
    "return": "Return ke cut",
}
PHASE_ORDER = ["wait", "load", "haul", "dump", "return"]


def render_results(st, result: SimulationResult) -> None:
    """Render KPI cards + charts ke Streamlit."""
    info = get_operation(result.operation)
    labels = resource_labels(result.operation)
    unit = labels["unit"]

    st.subheader("📊 Hasil Simulasi")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total trip", f"{result.total_trips}")
    c2.metric(f"Total volume ({unit})", f"{result.total_volume:,.1f}")
    c3.metric(f"Throughput ({unit}/jam)", f"{result.throughput_per_hour:,.1f}")
    c4.metric("Durasi sim (jam)", f"{result.simulated_minutes / 60:.1f}")

    c5, c6, c7, c8 = st.columns(4)
    c5.metric(
        f"Utilisasi {labels['loader']}",
        f"{result.loader_utilization * 100:.1f}%",
        help=(
            f"Busy time loader ter-clip ke horizon: "
            f"{result.loader_busy_minutes:.1f} menit·unit"
        ),
    )
    c6.metric(
        f"Utilisasi {labels['hauler']}",
        f"{result.hauler_utilization * 100:.1f}%",
        help=(
            f"Busy produktif (load+haul+dump+return): "
            f"{result.hauler_busy_minutes:.1f} menit·unit"
        ),
    )
    c7.metric("Rata-rata tunggu antri", f"{result.avg_queue_wait:.2f} mnt")
    c8.metric("Panjang antrian maks", f"{result.max_queue_length}")

    c9, c10, c11, c12 = st.columns(4)
    c9.metric("Antrian rata-rata (time-weighted)", f"{result.avg_queue_length:.2f}")
    c10.metric(
        f"Fraksi waktu tunggu {labels['hauler']}",
        f"{result.hauler_wait_ratio * 100:.1f}%",
    )
    c11.metric("Total tunggu (menit·unit)", f"{result.total_wait_time:.1f}")
    c12.metric(
        "Load dimulai / masih antri di akhir",
        f"{result.completed_load_requests} / {result.censored_waits}",
    )

    st.markdown(f"**Bottleneck:** `{result.bottleneck}`")
    stop_msg = {
        "target_cycles": f"Berhenti karena target **{result.target_cycles} siklus** tercapai "
        f"(waktu efektif {result.simulated_minutes:.1f} mnt / {result.simulated_minutes/60:.2f} jam).",
        "duration": f"Berhenti karena **durasi** habis ({result.simulated_minutes/60:.2f} jam).",
        "duration_cap": f"Target **{result.target_cycles} siklus** belum tercapai; "
        f"berhenti di batas waktu ({result.simulated_minutes/60:.2f} jam) "
        f"dengan {result.total_trips} siklus.",
    }.get(
        result.stop_reason,
        f"Simulasi selesai ({result.stop_reason}).",
    )
    st.info(stop_msg)
    st.caption(
        "Utilisasi = busy time di dalam horizon simulasi ÷ (jumlah unit × durasi). "
        "Aktivitas yang terpotong di akhir shift dihitung proporsional (tidak overcount)."
    )

    # ------------------------------------------------------------------
    # GRAFIK UTAMA: Learning curve produktivitas + utilisasi resource per siklus
    # ------------------------------------------------------------------
    _render_learning_curve_chart(st, result, unit, labels)
    _render_resource_util_per_cycle_chart(st, result, labels)

    # ------------------------------------------------------------------
    # Little's Law & Kingman
    # ------------------------------------------------------------------
    render_queueing_theory(st, result, labels)

    # ------------------------------------------------------------------
    # Tab tambahan
    # ------------------------------------------------------------------
    tab_cycle, tab_prod, tab_resource = st.tabs(
        [
            "🔄 Komposisi siklus",
            "📈 Produktivitas (detail)",
            "⚙️ Resource & antrian",
        ]
    )

    with tab_cycle:
        _render_cycle_charts(st, result, labels)

    with tab_prod:
        _render_productivity_charts(st, result, info.title, unit, labels)

    with tab_resource:
        _render_resource_charts(st, result, labels)

    with st.expander("Detail angka (tabel)"):
        st.json(result.to_dict())


def _render_cycle_charts(st, result: SimulationResult, labels: dict[str, str]) -> None:
    """Diagram komposisi siklus + Gantt aktivitas + distribusi cycle time."""
    st.markdown(
        f"""
Siklus hauler: **tunggu → load → haul → dump → return → ulang**.
Grafik di bawah memecah waktu tiap fase (menit) berdasarkan hasil DES.
"""
    )

    # --- 1) Komposisi rata-rata siklus ---
    avg = result.avg_cycle_components
    if avg:
        phases = [p for p in PHASE_ORDER if p in avg]
        vals = [avg[p] for p in phases]
        names = [PHASE_LABELS[p] for p in phases]
        colors = [PHASE_COLORS[p] for p in phases]

        col_a, col_b = st.columns(2)

        with col_a:
            fig_stack = go.Figure()
            fig_stack.add_trace(
                go.Bar(
                    x=["Siklus rata-rata"],
                    y=[vals[0]] if vals else [0],
                    name=names[0] if names else "",
                    marker_color=colors[0] if colors else "#ccc",
                    text=[f"{vals[0]:.1f}"] if vals else None,
                    textposition="inside",
                )
            )
            for i in range(1, len(phases)):
                fig_stack.add_trace(
                    go.Bar(
                        x=["Siklus rata-rata"],
                        y=[vals[i]],
                        name=names[i],
                        marker_color=colors[i],
                        text=[f"{vals[i]:.1f}"],
                        textposition="inside",
                    )
                )
            total_c = avg.get("cycle_time", sum(vals))
            apply_readable_layout(
                fig_stack,
                title=f"Komposisi siklus rata-rata ({total_c:.1f} mnt total)",
                height=400,
                show_legend=True,
                extra=dict(barmode="stack", yaxis_title="Menit"),
            )
            plotly_chart(st, fig_stack)

        with col_b:
            fig_pie = go.Figure(
                data=[
                    go.Pie(
                        labels=names,
                        values=vals,
                        marker=dict(colors=colors),
                        hole=0.35,
                        textinfo="percent",
                        hovertemplate="%{label}<br>%{value:.2f} mnt"
                        "<br>%{percent}<extra></extra>",
                    )
                ]
            )
            apply_readable_layout(
                fig_pie,
                title="Proporsi waktu per fase",
                height=400,
                show_legend=True,
            )
            plotly_chart(st, fig_pie)

        m1, m2, m3 = st.columns(3)
        m1.metric("Cycle time rata-rata", f"{avg.get('cycle_time', 0):.1f} mnt")
        m2.metric(
            "Waktu produktif rata-rata",
            f"{avg.get('productive_time', 0):.1f} mnt",
        )
        wait_share = (
            100.0 * avg.get("wait", 0) / avg["cycle_time"]
            if avg.get("cycle_time", 0) > 0
            else 0.0
        )
        m3.metric("Porsi tunggu dalam siklus", f"{wait_share:.1f}%")
    else:
        st.info("Belum ada siklus lengkap untuk ditampilkan (coba perpanjang durasi sim).")

    # --- 2) Gantt timeline aktivitas ---
    st.markdown(f"#### Timeline siklus {labels['hauler']}")
    if result.activity_log:
        horizon_h = max(result.simulated_minutes / 60.0, 0.25)
        default_window = min(2.0, max(0.25, horizon_h))
        # Streamlit slider membutuhkan max > min
        gantt_max_h = max(0.5, horizon_h)
        if gantt_max_h <= 0.25:
            window_h = gantt_max_h
        else:
            window_h = st.slider(
                "Jendela waktu Gantt (jam dari awal shift)",
                min_value=0.25,
                max_value=float(gantt_max_h),
                value=float(min(default_window, gantt_max_h)),
                step=0.25,
                help="Menampilkan segmen aktivitas di awal simulasi agar mudah dibaca.",
            )
        t_max = window_h * 60.0

        n_fleet = max(1, int(result.config.num_haulers))
        if n_fleet <= 1:
            n_show = 1
            st.caption(f"Menampilkan 1 {labels['hauler']} (seluruh armada).")
        else:
            n_show = st.slider(
                f"Jumlah {labels['hauler']} ditampilkan",
                min_value=1,
                max_value=n_fleet,
                value=min(6, n_fleet),
            )

        fig_gantt = _build_gantt(result, t_max, n_show, labels["hauler"])
        plotly_chart(st, fig_gantt)
        st.caption(
            "Setiap baris = satu unit hauler. Warna = fase siklus. "
            "Area abu-abu = menunggu excavator (antrian)."
        )
    else:
        st.info("Log aktivitas kosong.")

    # --- 3) Distribusi cycle time ---
    if result.cycle_log:
        st.markdown("#### Distribusi cycle time & komponen")
        df_c = pd.DataFrame(result.cycle_log)

        col1, col2 = st.columns(2)
        with col1:
            fig_hist = px.histogram(
                df_c,
                x="cycle_time",
                nbins=min(30, max(8, len(df_c) // 3)),
                title="Distribusi total cycle time",
                labels={"cycle_time": "Cycle time (menit)", "count": "Jumlah trip"},
                color_discrete_sequence=["#2980b9"],
            )
            apply_readable_layout(
                fig_hist, title="Distribusi total cycle time", height=360, show_legend=False
            )
            plotly_chart(st, fig_hist)

        with col2:
            # Box plot komponen
            melted = df_c.melt(
                value_vars=["wait", "load", "haul", "dump", "return"],
                var_name="fase",
                value_name="menit",
            )
            melted["fase_label"] = melted["fase"].map(PHASE_LABELS)
            fig_box = px.box(
                melted,
                x="fase_label",
                y="menit",
                color="fase",
                title="Sebaran durasi per fase",
                labels={"fase_label": "Fase", "menit": "Menit"},
                color_discrete_map=PHASE_COLORS,
            )
            apply_readable_layout(
                fig_box, title="Sebaran durasi per fase", height=360, show_legend=False
            )
            plotly_chart(st, fig_box)


def _cycle_dataframe(result: SimulationResult, labels: dict[str, str]) -> pd.DataFrame:
    """Siapkan DataFrame per-siklus (nomor urut + produktivitas)."""
    if not result.cycle_log:
        return pd.DataFrame()
    df = pd.DataFrame(result.cycle_log).copy()
    # Urutkan sesuai urutan trip selesai
    sort_cols = [c for c in ("finish_time", "trip") if c in df.columns]
    if sort_cols:
        df = df.sort_values(sort_cols).reset_index(drop=True)
    else:
        df = df.reset_index(drop=True)
    df["siklus"] = range(1, len(df) + 1)
    # Pastikan kolom fase ada
    for col in PHASE_ORDER:
        if col not in df.columns:
            df[col] = 0.0
    if "cycle_time" not in df.columns:
        df["cycle_time"] = df[PHASE_ORDER].sum(axis=1)
    if "volume" not in df.columns:
        df["volume"] = float(result.config.payload_per_trip)
    df["productivity"] = (
        df["volume"].astype(float) / df["cycle_time"].clip(lower=0.05) * 60.0
    )
    if "hauler_id" in df.columns:
        df["hauler_label"] = df["hauler_id"].map(
            lambda i: f"{labels['hauler']} #{int(i) + 1}"
        )
    else:
        df["hauler_label"] = labels["hauler"]
    return df


def _series_cv(values: list[float]) -> float | None:
    """Koefisien variasi std/mean; None jika mean ~ 0."""
    if not values:
        return None
    mean_v = sum(values) / len(values)
    if mean_v <= 1e-12:
        return None
    var = sum((x - mean_v) ** 2 for x in values) / len(values)
    return (var**0.5) / mean_v


def detect_steady_state(
    productivity: list[float] | pd.Series,
    window: int = 10,
    cv_threshold: float = 0.10,
    min_ss_cycles: int = 10,
) -> dict:
    """
    Deteksi steady state dari deret produktivitas per siklus.

    Definisi praktis (simulasi operasi):
      1. Hitung rolling CV pada jendela `window`.
      2. Cari titik mulai s paling awal sedemikian sehingga:
         - sisa siklus ≥ min_ss_cycles
         - CV keseluruhan zona prod[s:] ≤ cv_threshold  (variasi antar-siklus rendah)
         - ≥ 80% rolling-CV di zona itu juga ≤ cv_threshold (stabil berkesinambungan)

    Returns dict: reached, ss_start_cycle (1-based), ss_mean, ss_std, ss_cv, ...
    """
    prod = [float(x) for x in productivity]
    n = len(prod)
    empty = {
        "reached": False,
        "ss_start_cycle": None,
        "ss_end_cycle": n if n else 0,
        "ss_mean": None,
        "ss_std": None,
        "ss_cv": None,
        "n_ss_cycles": 0,
        "rolling_cv": [],
        "window": window,
        "cv_threshold": cv_threshold,
        "reason": "Data siklus tidak cukup.",
    }
    need = max(window, min_ss_cycles)
    if n < need:
        empty["reason"] = (
            f"Butuh minimal {need} siklus (saat ini {n}). "
            "Tambah jumlah siklus simulasi."
        )
        return empty

    window = max(3, min(window, n))
    rolling_cv: list[float | None] = [None] * n
    for i in range(window - 1, n):
        rolling_cv[i] = _series_cv(prod[i - window + 1 : i + 1])

    ss_start_idx = None
    # Cari s paling awal (0-based) yang memenuhi kriteria zona SS
    max_start = n - min_ss_cycles
    for s in range(0, max_start + 1):
        region = prod[s:]
        cv_region = _series_cv(region)
        if cv_region is None or cv_region > cv_threshold:
            continue
        # Rolling CV di dalam zona (indeks yang jendelanya berakhir di zona)
        r_ok = 0
        r_tot = 0
        for j in range(max(s, window - 1), n):
            cv_j = rolling_cv[j]
            if cv_j is None:
                continue
            r_tot += 1
            if cv_j <= cv_threshold:
                r_ok += 1
        if r_tot == 0:
            continue
        if (r_ok / r_tot) >= 0.80:
            ss_start_idx = s
            break

    if ss_start_idx is None:
        last_cvs = [c for c in rolling_cv if c is not None]
        last_cv = last_cvs[-1] if last_cvs else None
        whole_cv = _series_cv(prod)
        empty["rolling_cv"] = rolling_cv
        empty["reason"] = (
            f"Steady state belum terdeteksi. "
            f"CV seluruh deret = "
            f"{(whole_cv * 100) if whole_cv is not None else float('nan'):.1f}%, "
            f"CV jendela terakhir = "
            f"{(last_cv * 100) if last_cv is not None else float('nan'):.1f}% "
            f"(ambang {cv_threshold * 100:.0f}%). "
            "Perbanyak siklus, longgarkan ambang CV, atau perkecil jendela."
        )
        return empty

    ss_prod = prod[ss_start_idx:]
    ss_mean = sum(ss_prod) / len(ss_prod)
    ss_var = sum((x - ss_mean) ** 2 for x in ss_prod) / len(ss_prod)
    ss_std = ss_var**0.5
    ss_cv = ss_std / ss_mean if ss_mean > 1e-12 else 0.0

    return {
        "reached": True,
        "ss_start_cycle": ss_start_idx + 1,  # 1-based
        "ss_end_cycle": n,
        "ss_mean": ss_mean,
        "ss_std": ss_std,
        "ss_cv": ss_cv,
        "n_ss_cycles": len(ss_prod),
        "rolling_cv": rolling_cv,
        "window": window,
        "cv_threshold": cv_threshold,
        "reason": (
            f"Steady state mulai siklus ke-{ss_start_idx + 1} "
            f"hingga {n} ({len(ss_prod)} siklus)."
        ),
    }


def _render_learning_curve_chart(
    st,
    result: SimulationResult,
    unit: str,
    labels: dict[str, str],
) -> None:
    """
    Learning curve produktivitas:
      X = siklus 0 .. N
      Y = produktivitas (mulai 0, naik / konvergen)
      Deteksi steady state + rata-rata prod. saat SS.
    """
    st.subheader("Learning curve — produktivitas per siklus")
    st.caption(
        f"**Sumbu X:** nomor siklus (0 → siklus terakhir).  \n"
        f"**Sumbu Y:** produktivitas ({unit}/jam), mulai dari 0.  \n"
        "Kurva belajar = **rata-rata kumulatif** produktivitas "
        "(naik/berfluktuasi lalu mendatar bila sudah steady state). "
        "Titik abu-abu = produktivitas tiap siklus individual."
    )

    df = _cycle_dataframe(result, labels)
    if df.empty:
        st.warning(
            "Data siklus belum tersedia. Pilih mode **Jumlah siklus** di sidebar, "
            "lalu tekan **Jalankan Simulasi**."
        )
        return

    n = len(df)
    prod = df["productivity"].astype(float).tolist()

    # ----- Formulir kriteria steady state (selalu tampil) -----
    default_window = max(5, min(15, n // 4 if n >= 20 else max(5, n // 2)))
    if "ss_cv_threshold_pct" not in st.session_state:
        st.session_state.ss_cv_threshold_pct = 10.0
    if "ss_window" not in st.session_state:
        st.session_state.ss_window = min(default_window, n)
    if "ss_min_cycles" not in st.session_state:
        st.session_state.ss_min_cycles = min(max(10, int(st.session_state.ss_window)), n)

    # Pastikan nilai session masih valid untuk N siklus saat ini
    # (hindari min_value == max_value / value di luar rentang → error Streamlit)
    _ss_hi = max(3, n)
    st.session_state.ss_window = int(
        min(max(3, int(st.session_state.ss_window)), _ss_hi)
    )
    st.session_state.ss_min_cycles = int(
        min(max(3, int(st.session_state.ss_min_cycles)), _ss_hi)
    )

    st.markdown("##### Formulir kriteria steady state")
    st.caption(
        "Steady state dianggap tercapai jika **variasi produktivitas antar siklus rendah**, "
        "diukur dengan **CV = (standar deviasi) / (rata-rata)**. "
        "Isi ambang CV di bawah: jika CV zona ≤ nilai ini, sistem dinilai sudah steady state."
    )

    with st.form("form_steady_state_criteria", clear_on_submit=False):
        c_cv, c_win, c_min = st.columns([1.4, 1, 1])
        with c_cv:
            cv_pct_input = st.number_input(
                "Ambang CV untuk steady state (%)",
                min_value=1.0,
                max_value=50.0,
                value=float(st.session_state.ss_cv_threshold_pct),
                step=0.5,
                help=(
                    "Contoh: 10 berarti CV ≤ 10% dianggap stabil. "
                    "Semakin kecil, semakin ketat (lebih sulit mencapai SS)."
                ),
                key="form_ss_cv_pct",
            )
            st.caption(
                f"Artinya: **CV ≤ {cv_pct_input:.1f}%** → sudah steady state."
            )
        with c_win:
            window_input = st.number_input(
                "Jendela rolling CV (siklus)",
                min_value=3,
                max_value=max(3, n),
                value=int(st.session_state.ss_window),
                step=1,
                help="Lebar jendela untuk menghitung CV bergeser antar siklus.",
                key="form_ss_window",
            )
        with c_min:
            min_ss_input = st.number_input(
                "Min. siklus di zona SS",
                min_value=3,
                max_value=max(3, n),
                value=int(st.session_state.ss_min_cycles),
                step=1,
                help="Minimal sisa siklus yang harus stabil sampai akhir simulasi.",
                key="form_ss_min",
            )

        applied = st.form_submit_button(
            "Terapkan kriteria steady state",
            type="primary",
            use_container_width=False,
        )

    if applied:
        st.session_state.ss_cv_threshold_pct = float(cv_pct_input)
        st.session_state.ss_window = int(window_input)
        st.session_state.ss_min_cycles = int(min_ss_input)
        st.success(
            f"Kriteria diterapkan: steady state jika **CV ≤ "
            f"{st.session_state.ss_cv_threshold_pct:.1f}%** "
            f"(jendela {st.session_state.ss_window} siklus, "
            f"min. zona {st.session_state.ss_min_cycles} siklus)."
        )

    cv_pct = float(st.session_state.ss_cv_threshold_pct)
    window = int(min(max(3, st.session_state.ss_window), max(3, n)))
    min_ss = int(min(max(3, st.session_state.ss_min_cycles), max(3, n)))
    cv_threshold = cv_pct / 100.0

    st.info(
        f"**Kriteria aktif sekarang:** CV ≤ **{cv_pct:.1f}%** "
        f"· jendela rolling **{window}** siklus "
        f"· min. zona SS **{min_ss}** siklus."
    )

    ss = detect_steady_state(
        prod,
        window=window,
        cv_threshold=cv_threshold,
        min_ss_cycles=min_ss,
    )

    # --- Deret untuk grafik: mulai (0, 0) ---
    cycles_inst = [0] + df["siklus"].tolist()  # 0, 1, 2, ..., N
    prod_inst = [0.0] + prod  # produktivitas per siklus (0 di awal)
    # Learning curve = cumulative average (setelah siklus k)
    cum_avg = []
    running = 0.0
    for i, p in enumerate(prod):
        running += p
        cum_avg.append(running / (i + 1))
    cycles_lc = [0] + df["siklus"].tolist()
    prod_lc = [0.0] + cum_avg

    # Moving average (opsional, tanpa titik 0)
    ma_window = min(window, n)
    ma_vals: list[float | None] = [None] * n
    for i in range(n):
        if i + 1 >= ma_window:
            seg = prod[i + 1 - ma_window : i + 1]
            ma_vals[i] = sum(seg) / len(seg)

    y_max = max(prod + cum_avg + [1.0]) * 1.15

    fig = go.Figure()

    # Zona steady state (shade) — tanpa annotation di plot (hindari tumpang-tindih)
    if ss["reached"] and ss["ss_start_cycle"] is not None:
        fig.add_vrect(
            x0=ss["ss_start_cycle"] - 0.5,
            x1=n + 0.5,
            fillcolor="rgba(39, 174, 96, 0.12)",
            layer="below",
            line_width=0,
        )

    # Produktivitas individual tiap siklus
    fig.add_trace(
        go.Scatter(
            x=cycles_inst,
            y=prod_inst,
            mode="lines+markers",
            name="Produktivitas per siklus",
            line=dict(color="rgba(149, 165, 166, 0.7)", width=1.5),
            marker=dict(size=6, color="rgba(127, 140, 141, 0.85)"),
            hovertemplate=(
                "Siklus %{x}<br>Produktivitas: %{y:.2f} "
                + unit
                + "/jam<extra></extra>"
            ),
        )
    )

    # Learning curve (rata-rata kumulatif) — kurva utama yang "naik dari 0"
    fig.add_trace(
        go.Scatter(
            x=cycles_lc,
            y=prod_lc,
            mode="lines+markers",
            name="Learning curve (rata-rata kumulatif)",
            line=dict(color="#2980b9", width=3.5),
            marker=dict(size=7, color="#2980b9"),
            fill="tozeroy",
            fillcolor="rgba(41, 128, 185, 0.10)",
            hovertemplate=(
                "Siklus %{x}<br>Rata-rata kumulatif: %{y:.2f} "
                + unit
                + "/jam<extra></extra>"
            ),
        )
    )

    # Moving average
    ma_x = [df["siklus"].iloc[i] for i in range(n) if ma_vals[i] is not None]
    ma_y = [ma_vals[i] for i in range(n) if ma_vals[i] is not None]
    if ma_x:
        fig.add_trace(
            go.Scatter(
                x=ma_x,
                y=ma_y,
                mode="lines",
                name=f"Moving average ({ma_window} siklus)",
                line=dict(color="#8e44ad", width=2, dash="dot"),
                hovertemplate=(
                    "Siklus %{x}<br>MA: %{y:.2f} " + unit + "/jam<extra></extra>"
                ),
            )
        )

    # Garis rata-rata steady state (label di legenda, bukan annotation plot)
    if ss["reached"] and ss["ss_mean"] is not None:
        fig.add_hline(
            y=ss["ss_mean"],
            line_dash="dash",
            line_color="#27ae60",
            line_width=2.5,
        )
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="lines",
                name=f"Rata-rata SS = {ss['ss_mean']:.2f} {unit}/jam",
                line=dict(color="#27ae60", width=2, dash="dash"),
            )
        )
        fig.add_vline(
            x=ss["ss_start_cycle"],
            line_dash="dash",
            line_color="#27ae60",
            line_width=1.5,
        )
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="lines",
                name=f"Awal SS (siklus {ss['ss_start_cycle']})",
                line=dict(color="#27ae60", width=1.5, dash="dash"),
            )
        )

    apply_readable_layout(
        fig,
        title=f"Learning curve produktivitas per siklus (0 → {n} siklus)",
        height=520,
        show_legend=True,
        extra=dict(
            xaxis_title="Nomor siklus",
            yaxis_title=f"Produktivitas ({unit}/jam)",
            xaxis=dict(
                range=[-0.5, n + 0.5],
                dtick=1 if n <= 40 else max(1, n // 20),
                zeroline=True,
            ),
            yaxis=dict(range=[0, y_max], rangemode="tozero", zeroline=True),
            hovermode="x unified",
        ),
    )
    plotly_chart(st, fig)
    if ss["reached"] and ss["ss_start_cycle"] is not None:
        st.caption(
            f"Area hijau: zona steady state (siklus {ss['ss_start_cycle']}–{n}). "
            f"Garis putus hijau: rata-rata produktivitas SS = {ss['ss_mean']:.2f} {unit}/jam."
        )

    # --- Ringkasan metrik SS ---
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total siklus", f"{n}")
    c2.metric(
        f"Prod. rata-rata semua siklus ({unit}/jam)",
        f"{sum(prod) / n:.2f}",
    )
    if ss["reached"]:
        c3.metric(
            f"Prod. rata-rata steady state ({unit}/jam)",
            f"{ss['ss_mean']:.2f}",
            help=ss["reason"],
        )
        c4.metric(
            "CV di zona steady state",
            f"{ss['ss_cv'] * 100:.1f}%",
            help=f"std = {ss['ss_std']:.2f}; {ss['n_ss_cycles']} siklus SS",
        )
        st.success(
            f"**Steady state tercapai** (kriteria CV ≤ **{cv_pct:.1f}%**).  \n"
            f"Mulai siklus **{ss['ss_start_cycle']}** sampai **{ss['ss_end_cycle']}** "
            f"({ss['n_ss_cycles']} siklus).  \n"
            f"Rata-rata produktivitas per siklus pada steady state: "
            f"**{ss['ss_mean']:.2f} {unit}/jam** "
            f"(std {ss['ss_std']:.2f}, CV aktual zona SS **{ss['ss_cv'] * 100:.1f}%**)."
        )
    else:
        c3.metric(f"Prod. rata-rata SS ({unit}/jam)", "—")
        c4.metric("CV zona SS", "—")
        st.warning(
            f"**Steady state belum tercapai** dengan ambang CV ≤ **{cv_pct:.1f}%**.  \n"
            f"{ss['reason']}  \n"
            "Coba naikkan ambang CV di formulir di atas, atau perbanyak jumlah siklus simulasi."
        )

    # Tabel data learning curve
    with st.expander("Tabel learning curve (per siklus)"):
        table = pd.DataFrame(
            {
                "Siklus": df["siklus"],
                f"Prod. siklus ({unit}/jam)": [round(p, 2) for p in prod],
                f"Rata-rata kumulatif ({unit}/jam)": [round(a, 2) for a in cum_avg],
                "Rolling CV (%)": [
                    round(c * 100, 2) if c is not None else None
                    for c in ss["rolling_cv"]
                ],
                "Zona SS": [
                    "Ya"
                    if ss["reached"]
                    and ss["ss_start_cycle"] is not None
                    and k >= ss["ss_start_cycle"]
                    else "Tidak"
                    for k in df["siklus"]
                ],
            }
        )
        st.dataframe(table, use_container_width=True, hide_index=True)

    # Simpan komposisi siklus di tab (detail), bukan di sini
    with st.expander("Komposisi waktu tiap siklus (batang fase)"):
        _render_cycle_composition_mini(st, df, unit)


def _clip_len(start: float, end: float, t0: float, t1: float) -> float:
    """Panjang irisan [start, end] ∩ [t0, t1]."""
    s = max(start, t0)
    e = min(end, t1)
    return max(0.0, e - s)


def _build_resource_util_by_cycle(result: SimulationResult) -> pd.DataFrame:
    """
    Hitung utilisasi resource per siklus (dan kumulatif).

    - Utilisasi **kumulatif** di siklus k: busy time di [0, t_k] / (n_res × t_k)
      di mana t_k = waktu selesai dump siklus ke-k.
    - Utilisasi **per jendela siklus**: busy di (t_{k-1}, t_k] / (n_res × Δt)

    Resource:
      - loader (excavator/mixer/loader): fase 'load'
      - hauler (truck): fase load+haul+dump+return
      - hauler wait: fase 'wait' (fraksi waktu mengantri — info pelengkap)
    """
    if not result.cycle_log:
        return pd.DataFrame()

    n_loaders = max(1, int(result.config.num_loaders))
    n_haulers = max(1, int(result.config.num_haulers))

    cycles = sorted(
        result.cycle_log,
        key=lambda c: (float(c.get("finish_time", 0.0)), int(c.get("trip", 0))),
    )
    finish_times = [float(c.get("finish_time", 0.0)) for c in cycles]

    load_iv = [
        (float(a["start"]), float(a["end"]))
        for a in result.activity_log
        if a.get("phase") == "load"
    ]
    haul_busy_iv = [
        (float(a["start"]), float(a["end"]))
        for a in result.activity_log
        if a.get("phase") in ("load", "haul", "dump", "return")
    ]
    wait_iv = [
        (float(a["start"]), float(a["end"]))
        for a in result.activity_log
        if a.get("phase") == "wait"
    ]

    def busy_in(intervals: list[tuple[float, float]], t0: float, t1: float) -> float:
        return sum(_clip_len(s, e, t0, t1) for s, e in intervals)

    rows = []
    # Titik awal siklus 0
    rows.append(
        {
            "siklus": 0,
            "finish_time": 0.0,
            "loader_util_cum": 0.0,
            "hauler_util_cum": 0.0,
            "hauler_wait_cum": 0.0,
            "loader_util_cycle": 0.0,
            "hauler_util_cycle": 0.0,
            "hauler_wait_cycle": 0.0,
        }
    )

    prev_t = 0.0
    for i, t in enumerate(finish_times):
        t = max(t, prev_t + 1e-9)  # hindari Δt=0
        # Kumulatif [0, t]
        load_b = busy_in(load_iv, 0.0, t)
        haul_b = busy_in(haul_busy_iv, 0.0, t)
        wait_b = busy_in(wait_iv, 0.0, t)
        loader_cum = min(1.0, load_b / (n_loaders * t)) if t > 0 else 0.0
        hauler_cum = min(1.0, haul_b / (n_haulers * t)) if t > 0 else 0.0
        wait_cum = min(1.0, wait_b / (n_haulers * t)) if t > 0 else 0.0

        # Per jendela (prev_t, t]
        dt = t - prev_t
        load_w = busy_in(load_iv, prev_t, t)
        haul_w = busy_in(haul_busy_iv, prev_t, t)
        wait_w = busy_in(wait_iv, prev_t, t)
        loader_cy = min(1.0, load_w / (n_loaders * dt)) if dt > 0 else 0.0
        hauler_cy = min(1.0, haul_w / (n_haulers * dt)) if dt > 0 else 0.0
        wait_cy = min(1.0, wait_w / (n_haulers * dt)) if dt > 0 else 0.0

        rows.append(
            {
                "siklus": i + 1,
                "finish_time": t,
                "loader_util_cum": loader_cum,
                "hauler_util_cum": hauler_cum,
                "hauler_wait_cum": wait_cum,
                "loader_util_cycle": loader_cy,
                "hauler_util_cycle": hauler_cy,
                "hauler_wait_cycle": wait_cy,
            }
        )
        prev_t = t

    return pd.DataFrame(rows)


def _render_resource_util_per_cycle_chart(
    st,
    result: SimulationResult,
    labels: dict[str, str],
) -> None:
    """
    Satu grafik: utilisasi tiap resource vs nomor siklus (0..N).
    Warna berbeda per resource — mirip learning curve produktivitas.
    """
    st.subheader("Utilisasi resource per siklus")
    st.caption(
        f"**Sumbu X:** nomor siklus (0 → terakhir).  \n"
        f"**Sumbu Y:** tingkat utilisasi (0–100%).  \n"
        f"Setiap resource satu warna: **{labels['loader']}**, **{labels['hauler']}**, "
        f"dan fraksi waktu **tunggu antri** {labels['hauler']}.  \n"
        "Garis tebal = utilisasi **kumulatif** (seperti learning curve). "
        "Garis tipis putus-putus = utilisasi pada **jendela antar-siklus**."
    )

    df = _build_resource_util_by_cycle(result)
    if df.empty:
        st.warning(
            "Data siklus belum ada — utilisasi per siklus tidak dapat digambar. "
            "Jalankan simulasi dengan beberapa siklus terlebih dahulu."
        )
        return

    n = int(df["siklus"].max())
    loader_name = labels["loader"]
    hauler_name = labels["hauler"]

    # Warna tetap per resource
    color_loader = "#e67e22"  # oranye
    color_hauler = "#2980b9"  # biru
    color_wait = "#95a5a6"  # abu

    fig = go.Figure()

    # --- Kumulatif (garis tebal) ---
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["loader_util_cum"] * 100.0,
            mode="lines+markers",
            name=f"{loader_name} (kumulatif)",
            line=dict(color=color_loader, width=3.5),
            marker=dict(size=7, color=color_loader),
            hovertemplate=(
                "Siklus %{x}<br>"
                + loader_name
                + " kumulatif: %{y:.1f}%<extra></extra>"
            ),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["hauler_util_cum"] * 100.0,
            mode="lines+markers",
            name=f"{hauler_name} (kumulatif)",
            line=dict(color=color_hauler, width=3.5),
            marker=dict(size=7, color=color_hauler),
            hovertemplate=(
                "Siklus %{x}<br>"
                + hauler_name
                + " kumulatif: %{y:.1f}%<extra></extra>"
            ),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["hauler_wait_cum"] * 100.0,
            mode="lines+markers",
            name=f"Tunggu antri {hauler_name} (kumulatif)",
            line=dict(color=color_wait, width=2.5),
            marker=dict(size=6, color=color_wait),
            hovertemplate=(
                "Siklus %{x}<br>Fraksi tunggu kumulatif: %{y:.1f}%<extra></extra>"
            ),
        )
    )

    # --- Per jendela siklus (garis putus, lebih transparan) ---
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["loader_util_cycle"] * 100.0,
            mode="lines",
            name=f"{loader_name} (per siklus)",
            line=dict(color=color_loader, width=1.5, dash="dot"),
            opacity=0.55,
            hovertemplate=(
                "Siklus %{x}<br>"
                + loader_name
                + " jendela: %{y:.1f}%<extra></extra>"
            ),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["hauler_util_cycle"] * 100.0,
            mode="lines",
            name=f"{hauler_name} (per siklus)",
            line=dict(color=color_hauler, width=1.5, dash="dot"),
            opacity=0.55,
            hovertemplate=(
                "Siklus %{x}<br>"
                + hauler_name
                + " jendela: %{y:.1f}%<extra></extra>"
            ),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["hauler_wait_cycle"] * 100.0,
            mode="lines",
            name=f"Tunggu antri (per siklus)",
            line=dict(color=color_wait, width=1.5, dash="dot"),
            opacity=0.55,
            hovertemplate="Siklus %{x}<br>Tunggu jendela: %{y:.1f}%<extra></extra>",
        )
    )

    # Referensi nilai akhir — lewat legenda (hindari annotation tumpang-tindih)
    fig.add_hline(
        y=result.loader_utilization * 100.0,
        line_dash="dash",
        line_color=color_loader,
        line_width=1,
    )
    fig.add_hline(
        y=result.hauler_utilization * 100.0,
        line_dash="dash",
        line_color=color_hauler,
        line_width=1,
    )
    fig.add_trace(
        go.Scatter(
            x=[None],
            y=[None],
            mode="lines",
            name=f"Akhir {loader_name}: {result.loader_utilization*100:.1f}%",
            line=dict(color=color_loader, width=1, dash="dash"),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=[None],
            y=[None],
            mode="lines",
            name=f"Akhir {hauler_name}: {result.hauler_utilization*100:.1f}%",
            line=dict(color=color_hauler, width=1, dash="dash"),
        )
    )

    apply_readable_layout(
        fig,
        title=f"Utilisasi resource vs nomor siklus (0 → {n})",
        height=520,
        show_legend=True,
        extra=dict(
            xaxis_title="Nomor siklus",
            yaxis_title="Utilisasi (%)",
            xaxis=dict(
                range=[-0.5, n + 0.5],
                dtick=1 if n <= 40 else max(1, n // 20),
                zeroline=True,
            ),
            yaxis=dict(range=[0, 105], rangemode="tozero", ticksuffix="%"),
            hovermode="x unified",
        ),
    )
    plotly_chart(st, fig)

    # Ringkasan singkat
    last = df.iloc[-1]
    c1, c2, c3 = st.columns(3)
    c1.metric(
        f"Utilisasi {loader_name} (akhir)",
        f"{last['loader_util_cum']*100:.1f}%",
        help="Kumulatif hingga siklus terakhir",
    )
    c2.metric(
        f"Utilisasi {hauler_name} (akhir)",
        f"{last['hauler_util_cum']*100:.1f}%",
    )
    c3.metric(
        f"Fraksi tunggu {hauler_name} (akhir)",
        f"{last['hauler_wait_cum']*100:.1f}%",
    )

    with st.expander("Tabel utilisasi per siklus"):
        show = df.copy()
        show["loader_util_cum"] = (show["loader_util_cum"] * 100).round(1)
        show["hauler_util_cum"] = (show["hauler_util_cum"] * 100).round(1)
        show["hauler_wait_cum"] = (show["hauler_wait_cum"] * 100).round(1)
        show["loader_util_cycle"] = (show["loader_util_cycle"] * 100).round(1)
        show["hauler_util_cycle"] = (show["hauler_util_cycle"] * 100).round(1)
        show["hauler_wait_cycle"] = (show["hauler_wait_cycle"] * 100).round(1)
        show = show.rename(
            columns={
                "siklus": "Siklus",
                "finish_time": "Waktu selesai (mnt)",
                "loader_util_cum": f"{loader_name} kum. (%)",
                "hauler_util_cum": f"{hauler_name} kum. (%)",
                "hauler_wait_cum": "Tunggu kum. (%)",
                "loader_util_cycle": f"{loader_name} per siklus (%)",
                "hauler_util_cycle": f"{hauler_name} per siklus (%)",
                "hauler_wait_cycle": "Tunggu per siklus (%)",
            }
        )
        show["Waktu selesai (mnt)"] = show["Waktu selesai (mnt)"].round(2)
        st.dataframe(show, use_container_width=True, hide_index=True)


def _render_cycle_composition_mini(st, df: pd.DataFrame, unit: str) -> None:
    """Batang bertumpuk fase — pelengkap learning curve."""
    fig = go.Figure()
    for phase in PHASE_ORDER:
        fig.add_trace(
            go.Bar(
                x=df["siklus"],
                y=df[phase],
                name=PHASE_LABELS[phase],
                marker_color=PHASE_COLORS[phase],
            )
        )
    fig.add_trace(
        go.Scatter(
            x=df["siklus"],
            y=df["productivity"],
            name=f"Prod. ({unit}/jam)",
            yaxis="y2",
            mode="lines+markers",
            line=dict(color="#c0392b", width=2),
        )
    )
    apply_readable_layout(
        fig,
        title="Komposisi waktu siklus + produktivitas",
        height=420,
        show_legend=True,
        extra=dict(
            barmode="stack",
            xaxis_title="Nomor siklus",
            yaxis_title="Menit",
            yaxis2=dict(
                title=f"Produktivitas ({unit}/jam)",
                overlaying="y",
                side="right",
                showgrid=False,
            ),
        ),
    )
    plotly_chart(st, fig)


def _build_gantt(
    result: SimulationResult,
    t_max: float,
    n_haulers: int,
    hauler_label: str,
) -> go.Figure:
    """Gantt horizontal dari activity_log (menit → datetime dummy untuk px.timeline)."""
    rows = [
        a
        for a in result.activity_log
        if a["hauler_id"] < n_haulers and a["start"] < t_max
    ]
    if not rows:
        fig = go.Figure()
        fig.update_layout(title="Tidak ada aktivitas di jendela waktu ini", height=200)
        return fig

    base = datetime(2026, 1, 1, 0, 0, 0)
    records = []
    for a in rows:
        start = a["start"]
        end = min(a["end"], t_max)
        if end <= start:
            continue
        records.append(
            {
                "Hauler": f"{hauler_label} #{a['hauler_id'] + 1}",
                "Fase": PHASE_LABELS.get(a["phase"], a["phase"]),
                "phase_key": a["phase"],
                "Start": base + timedelta(minutes=start),
                "Finish": base + timedelta(minutes=end),
                "start_min": start,
                "end_min": end,
            }
        )

    df = pd.DataFrame(records)
    # Urutan hauler dari atas ke bawah
    order = [f"{hauler_label} #{i + 1}" for i in range(n_haulers)]
    df["Hauler"] = pd.Categorical(df["Hauler"], categories=order, ordered=True)

    color_map = {PHASE_LABELS[k]: PHASE_COLORS[k] for k in PHASE_ORDER}
    fig = px.timeline(
        df,
        x_start="Start",
        x_end="Finish",
        y="Hauler",
        color="Fase",
        color_discrete_map=color_map,
        hover_data={
            "start_min": ":.1f",
            "end_min": ":.1f",
            "Start": False,
            "Finish": False,
        },
        title=f"Gantt siklus (0 – {t_max:.0f} menit)",
    )
    fig.update_yaxes(categoryorder="array", categoryarray=list(reversed(order)))
    apply_readable_layout(
        fig,
        title=f"Gantt siklus (0 – {t_max:.0f} menit)",
        height=max(320, 56 * n_haulers + 140),
        show_legend=True,
        extra=dict(xaxis_title="Waktu (jam:menit dari t=0)"),
    )
    fig.update_xaxes(tickformat="%H:%M")
    return fig


def _render_productivity_charts(
    st,
    result: SimulationResult,
    title: str,
    unit: str,
    labels: dict[str, str],
) -> None:
    """Produksi kumulatif, laju per jam, produktivitas per hauler."""
    st.markdown(
        "Produktivitas dihitung dari trip earthmoving yang **dump-nya selesai** "
        "dalam horizon simulasi. "
        f"**Satu siklus** = satu trip (volume {result.config.payload_per_trip:g} {unit})."
    )

    st.caption(
        "Grafik utama **Learning curve & steady state** ada di atas (di luar tab). "
        "Di bawah ini detail produktivitas tambahan."
    )

    # --- Kumulatif + laju per jam ---
    if len(result.timeline_volume) >= 2:
        df_vol = pd.DataFrame(
            result.timeline_volume, columns=["waktu_menit", "volume_kumulatif"]
        )
        df_vol["waktu_jam"] = df_vol["waktu_menit"] / 60.0

        # Instant rate: slope antar titik (volume/jam)
        df_vol["delta_v"] = df_vol["volume_kumulatif"].diff().fillna(0)
        df_vol["delta_t_jam"] = df_vol["waktu_jam"].diff().replace(0, pd.NA)
        df_vol["rate"] = (df_vol["delta_v"] / df_vol["delta_t_jam"]).fillna(0)

        fig = make_subplots(specs=[[{"secondary_y": True}]])
        fig.add_trace(
            go.Scatter(
                x=df_vol["waktu_jam"],
                y=df_vol["volume_kumulatif"],
                name=f"Kumulatif ({unit})",
                mode="lines",
                line=dict(color="#2c3e50", width=2.5),
                fill="tozeroy",
                fillcolor="rgba(44,62,80,0.08)",
            ),
            secondary_y=False,
        )

        # Produktivitas per jam (bucket 1 jam) dari volume kumulatif
        horizon = result.simulated_minutes
        n_hours = max(1, int(horizon // 60) + (1 if horizon % 60 > 1e-6 else 0))
        buckets = []
        for h in range(n_hours):
            t0, t1 = h * 60.0, min((h + 1) * 60.0, horizon)
            cum_start = 0.0
            cum_end = 0.0
            for t, cum in result.timeline_volume:
                if t <= t0:
                    cum_start = cum
                if t <= t1:
                    cum_end = cum
            vol_in = cum_end - cum_start
            dt_h = (t1 - t0) / 60.0
            buckets.append(
                {
                    "jam": h + 0.5,
                    "label": f"Jam {h + 1}",
                    "volume": vol_in,
                    "rate": vol_in / dt_h if dt_h > 0 else 0.0,
                }
            )

        df_b = pd.DataFrame(buckets)
        fig.add_trace(
            go.Bar(
                x=df_b["jam"],
                y=df_b["rate"],
                name=f"Laju per jam ({unit}/jam)",
                marker_color="rgba(41,128,185,0.55)",
                opacity=0.7,
                width=0.85,
            ),
            secondary_y=True,
        )

        # Garis rata-rata throughput
        fig.add_hline(
            y=result.throughput_per_hour,
            secondary_y=True,
            line_dash="dash",
            line_color="#c0392b",
        )
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="lines",
                name=f"Rata-rata throughput {result.throughput_per_hour:.1f}",
                line=dict(color="#c0392b", width=2, dash="dash"),
            ),
            secondary_y=True,
        )

        apply_readable_layout(
            fig,
            title=f"Produksi kumulatif & laju per jam — {title}",
            height=460,
            show_legend=True,
            extra=dict(barmode="overlay", hovermode="x unified"),
        )
        fig.update_xaxes(title_text="Waktu (jam)")
        fig.update_yaxes(title_text=f"Volume kumulatif ({unit})", secondary_y=False)
        fig.update_yaxes(title_text=f"Laju ({unit}/jam)", secondary_y=True)
        plotly_chart(st, fig)
        st.caption(
            f"Garis putus merah: throughput rata-rata sistem "
            f"({result.throughput_per_hour:.1f} {unit}/jam)."
        )

        # Tabel ringkas per jam
        with st.expander("Tabel produktivitas per jam"):
            show = df_b[["label", "volume", "rate"]].copy()
            show.columns = ["Periode", f"Volume ({unit})", f"Laju ({unit}/jam)"]
            show[f"Volume ({unit})"] = show[f"Volume ({unit})"].round(1)
            show[f"Laju ({unit}/jam)"] = show[f"Laju ({unit}/jam)"].round(1)
            st.dataframe(show, use_container_width=True, hide_index=True)

    # --- Akumulasi volume vs waktu ---
    if result.cycle_log:
        df_c = pd.DataFrame(result.cycle_log).sort_values("finish_time")
        df_c["volume_cum"] = df_c["volume"].cumsum()
        df_c["waktu_jam"] = df_c["finish_time"] / 60.0
        fig_step = px.line(
            df_c,
            x="waktu_jam",
            y="volume_cum",
            title=f"Akumulasi volume per siklus selesai ({unit})",
            labels={
                "waktu_jam": "Waktu dump selesai (jam)",
                "volume_cum": f"Volume kumulatif ({unit})",
            },
            markers=True,
        )
        fig_step.update_traces(line_shape="hv", marker=dict(size=5))
        apply_readable_layout(
            fig_step,
            title=f"Akumulasi volume per siklus selesai ({unit})",
            height=380,
            show_legend=False,
        )
        plotly_chart(st, fig_step)

    # --- Per hauler ---
    st.markdown(f"#### Kontribusi per {labels['hauler']}")
    if result.hauler_trips:
        df_h = pd.DataFrame(
            {
                "unit": [
                    f"#{i + 1}" for i in range(len(result.hauler_trips))
                ],
                "trips": result.hauler_trips,
                "volume": [t * result.config.payload_per_trip for t in result.hauler_trips],
                "busy_min": result.hauler_busy_per_unit
                if result.hauler_busy_per_unit
                else [0] * len(result.hauler_trips),
                "wait_min": result.hauler_wait_per_unit
                if result.hauler_wait_per_unit
                else [0] * len(result.hauler_trips),
            }
        )
        col1, col2 = st.columns(2)
        with col1:
            fig_trips = px.bar(
                df_h,
                x="unit",
                y="volume",
                text="trips",
                title=f"Volume & jumlah trip per {labels['hauler']}",
                labels={"unit": labels["hauler"], "volume": f"Volume ({unit})"},
                color="volume",
                color_continuous_scale="Blues",
            )
            fig_trips.update_traces(
                texttemplate="%{text} trip", textposition="outside"
            )
            apply_readable_layout(
                fig_trips,
                title=f"Volume & jumlah trip per {labels['hauler']}",
                height=400,
                show_legend=False,
            )
            plotly_chart(st, fig_trips)

        with col2:
            fig_bw = go.Figure()
            fig_bw.add_trace(
                go.Bar(
                    name="Busy (produktif)",
                    x=df_h["unit"],
                    y=df_h["busy_min"],
                    marker_color="#2980b9",
                )
            )
            fig_bw.add_trace(
                go.Bar(
                    name="Wait (antri)",
                    x=df_h["unit"],
                    y=df_h["wait_min"],
                    marker_color="#95a5a6",
                )
            )
            apply_readable_layout(
                fig_bw,
                title=f"Alokasi waktu per {labels['hauler']} (menit)",
                height=400,
                show_legend=True,
                extra=dict(
                    barmode="stack",
                    yaxis_title="Menit",
                    xaxis_title=labels["hauler"],
                ),
            )
            plotly_chart(st, fig_bw)


def _render_resource_charts(st, result: SimulationResult, labels: dict[str, str]) -> None:
    """Utilisasi dan antrian."""
    fig_util = go.Figure(
        data=[
            go.Bar(
                x=[labels["loader"], labels["hauler"]],
                y=[
                    result.loader_utilization * 100,
                    result.hauler_utilization * 100,
                ],
                text=[
                    f"{result.loader_utilization * 100:.1f}%",
                    f"{result.hauler_utilization * 100:.1f}%",
                ],
                textposition="auto",
                marker_color=["#e67e22", "#2980b9"],
            )
        ]
    )
    apply_readable_layout(
        fig_util,
        title="Utilisasi resource (%)",
        height=360,
        show_legend=False,
        extra=dict(yaxis_title="Utilisasi (%)", yaxis_range=[0, 100]),
    )
    plotly_chart(st, fig_util)

    if result.queue_over_time:
        df_q = pd.DataFrame(
            result.queue_over_time, columns=["waktu_menit", "panjang_antrian"]
        )
        df_q["waktu_jam"] = df_q["waktu_menit"] / 60.0
        fig_q = px.line(
            df_q,
            x="waktu_jam",
            y="panjang_antrian",
            title=f"Panjang antrian {labels['hauler']} di area loading",
            labels={
                "waktu_jam": "Waktu (jam)",
                "panjang_antrian": "Jumlah hauler mengantri",
            },
            line_shape="hv",
        )
        apply_readable_layout(
            fig_q,
            title=f"Panjang antrian {labels['hauler']} di area loading",
            height=340,
            show_legend=False,
        )
        plotly_chart(st, fig_q)
