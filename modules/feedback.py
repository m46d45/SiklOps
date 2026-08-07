"""
Modul 5 — Feedback Edukasi & What-if

Menjelaskan hasil simulasi dalam bahasa pembelajaran
dan menyediakan aksi jalankan ulang / tips skenario.
"""

from __future__ import annotations

from .operation_selection import get_operation
from .simulation_engine import SimulationResult, resource_labels


def render_feedback(st, result: SimulationResult) -> bool:
    """
    Tampilkan feedback edukatif.
    Return True jika user meminta jalankan ulang (rerun button).
    """
    info = get_operation(result.operation)
    labels = resource_labels(result.operation)
    unit = labels["unit"]
    cfg = result.config

    st.subheader("🎓 Feedback Edukasi")

    cycle = cfg.cycle_time_mean()
    # Estimasi teoritis kasar (match factor style, simplified)
    loader_prod_cap = (
        (60.0 / cfg.load_time_mean) * cfg.num_loaders * cfg.payload_per_trip
        if cfg.load_time_mean > 0
        else 0.0
    )
    # hauler capacity ≈ trips/hour * payload * n
    hauler_cycle = cycle
    hauler_prod_cap = (
        (60.0 / hauler_cycle) * cfg.num_haulers * cfg.payload_per_trip
        if hauler_cycle > 0
        else 0.0
    )

    st.markdown(
        f"""
**SiklOps v1.0 — Earthmoving.** Operasi **{info.title}** mensimulasikan siklus
galian & angkut berulang di lapangan (bukan penjadwalan proyek keseluruhan).

**Cara membaca hasil**
1. **Throughput** ({result.throughput_per_hour:.1f} {unit}/jam) = volume material
   yang **dump**-nya selesai dalam horizon simulasi.
2. **Utilisasi** = busy time di dalam horizon ÷ (jumlah unit × durasi shift):
   - {labels['loader']}: **{result.loader_utilization*100:.1f}%**
     ({result.loader_busy_minutes:.0f} menit·unit sibuk memuat)
   - {labels['hauler']}: **{result.hauler_utilization*100:.1f}%**
     (load + haul + dump + return; **bukan** termasuk antri di excavator)
3. **Waktu tunggu antri** ({result.avg_queue_wait:.2f} menit) = rata-rata dump truck
   menunggu excavator kosong.
4. **Fraksi tunggu truck** ({result.hauler_wait_ratio*100:.1f}%) = proporsi waktu
   armada di antrian loading.
5. **Bottleneck** menunjuk resource yang paling membatasi produksi earthmoving.
"""
    )

    st.info(f"**Bottleneck teridentifikasi:** {result.bottleneck}\n\n{result.bottleneck_reason}")

    st.markdown("#### Estimasi kapasitas teoritis (kasar)")
    col_a, col_b, col_c = st.columns(3)
    col_a.metric(f"Kapasitas loading ({unit}/jam)", f"{loader_prod_cap:,.1f}")
    col_b.metric(f"Kapasitas hauling ({unit}/jam)", f"{hauler_prod_cap:,.1f}")
    match = (
        hauler_prod_cap / loader_prod_cap
        if loader_prod_cap > 0
        else 0.0
    )
    col_c.metric(
        "Match factor (kasar)",
        f"{match:.2f}",
        help="≈1 = seimbang; <1 hauler kurang; >1 hauler berlebih (antrian di loader).",
    )

    st.markdown(
        f"""
**Match factor (sederhana)** membandingkan kapasitas hauling vs loading.
- **≈ 1.0** → fleet relatif seimbang  
- **&lt; 1.0** → hauler cenderung kurang (loader sering idle)  
- **&gt; 1.0** → hauler cenderung berlebih (antrian di loading)

Nilai simulasi DES lebih realistis karena memperhitungkan **acak (variabilitas)**
dan **antrian dinamis**, bukan hanya rumus rata-rata.
"""
    )

    st.markdown("#### Ide What-if untuk dicoba")
    tips = _what_if_tips(result)
    for t in tips:
        st.markdown(f"- {t}")

    st.markdown("---")
    st.markdown("#### 🔄 Jalankan ulang")
    st.caption(
        "Ubah parameter di sidebar (jumlah alat, cycle time, seed), "
        "lalu tekan tombol di bawah atau tombol 'Jalankan Simulasi' di atas."
    )
    rerun = st.button("Jalankan ulang simulasi", type="primary", key="btn_rerun")
    return rerun


def _what_if_tips(result: SimulationResult) -> list[str]:
    labels = resource_labels(result.operation)
    tips: list[str] = []
    bn = result.bottleneck.lower()

    if labels["loader"].lower() in bn or "excavator" in bn or "mixer" in bn or "loader" in bn:
        tips.append(
            f"Tambah 1 unit **{labels['loader']}** — amati apakah throughput naik "
            "dan antrian turun."
        )
        tips.append(
            "Kurangi **waktu load** 20% (mis. teknik galian lebih efisien) "
            "tanpa menambah alat."
        )
    if labels["hauler"].lower() in bn or "truck" in bn:
        tips.append(
            f"Tambah 1–2 **{labels['hauler']}** — cek utilisasi loader "
            "dan waktu tunggu."
        )
        tips.append(
            "Perpendek **haul + return** (rute lebih pendek / jalan lebih baik) "
            "sebesar 15–25%."
        )
    if "seimbang" in bn or "under" in bn:
        tips.append(
            "Kurangi jumlah hauler bertahap sampai utilisasi loader naik "
            "mendekati 80–90% tanpa antrian panjang."
        )
        tips.append(
            "Naikkan **CV (variabilitas)** ke 0.35 — lihat dampak ke antrian "
            "dan throughput (efek real-world variability)."
        )

    tips.append(
        "Bandingkan seed berbeda (non-reproducible) untuk melihat sebaran hasil."
    )
    tips.append(
        "Ubah **kapasitas per trip** (payload) — trade-off antara volume/trip "
        "dan mungkin cycle load yang lebih lama di lapangan nyata."
    )
    return tips
