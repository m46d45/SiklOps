"""
Style Plotly konsisten agar judul, sumbu, dan legenda tidak tumpang-tindih di web.
"""

from __future__ import annotations

from typing import Any

# Layout default: legenda di BAWAH plot (bukan di atas judul)
LEGEND_BELOW = dict(
    orientation="h",
    yanchor="top",
    y=-0.22,
    xanchor="center",
    x=0.5,
    bgcolor="rgba(255,255,255,0.92)",
    bordercolor="rgba(0,0,0,0.08)",
    borderwidth=1,
    font=dict(size=11),
    itemsizing="constant",
    tracegroupgap=8,
)

MARGIN_WITH_LEGEND = dict(l=60, r=40, t=70, b=110)
MARGIN_NO_LEGEND = dict(l=60, r=40, t=60, b=50)
MARGIN_SUBPLOT = dict(l=60, r=40, t=90, b=120)


def apply_readable_layout(
    fig: Any,
    *,
    title: str | None = None,
    height: int = 420,
    show_legend: bool = True,
    has_subplots: bool = False,
    extra: dict | None = None,
) -> Any:
    """Terapkan margin + legenda agar terbaca di Streamlit/browser."""
    margin = MARGIN_SUBPLOT if has_subplots else (
        MARGIN_WITH_LEGEND if show_legend else MARGIN_NO_LEGEND
    )
    layout_kwargs: dict[str, Any] = dict(
        height=height,
        margin=margin,
        title=dict(
            text=title or (fig.layout.title.text if fig.layout.title else ""),
            x=0.0,
            xanchor="left",
            y=0.98,
            yanchor="top",
            font=dict(size=15),
            pad=dict(b=8),
        )
        if title or (fig.layout.title and fig.layout.title.text)
        else None,
        legend=LEGEND_BELOW if show_legend else dict(traceorder="normal"),
        showlegend=show_legend,
        hovermode="closest",
        font=dict(size=12),
        # Jangan biarkan elemen keluar canvas
        autosize=True,
    )
    # Hapus title None
    layout_kwargs = {k: v for k, v in layout_kwargs.items() if v is not None}
    if extra:
        # merge margin/legend carefully
        if "margin" in extra:
            m = dict(margin)
            m.update(extra.pop("margin"))
            layout_kwargs["margin"] = m
        if "legend" in extra and show_legend:
            leg = dict(LEGEND_BELOW)
            leg.update(extra.pop("legend"))
            layout_kwargs["legend"] = leg
        layout_kwargs.update(extra)

    fig.update_layout(**layout_kwargs)

    # Subplot titles: beri ruang
    if has_subplots:
        fig.update_annotations(font_size=13, yshift=8)

    fig.update_xaxes(title_standoff=12, automargin=True)
    fig.update_yaxes(title_standoff=12, automargin=True)
    return fig


def plotly_chart(st, fig: Any, **kwargs) -> None:
    """Wrapper st.plotly_chart dengan config anti-clip."""
    config = kwargs.pop("config", {}) or {}
    config.setdefault("displayModeBar", True)
    config.setdefault("responsive", True)
    st.plotly_chart(
        fig,
        use_container_width=True,
        config=config,
        **kwargs,
    )
