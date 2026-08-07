# SiklOps

**SiklOps** — *Simulation of Cyclic Construction Operations*

Educational discrete-event simulation (DES) for construction production cycles.

Streamlit app (successor branding to [SiklOps](https://github.com/m46d45/SiklOps)).

## Features

| Operation | Model |
|---|---|
| **Earthmoving** | Excavator + dump truck · Load–Haul–Dump–Return · distributions · charts |
| **Concreting (RMC)** | Dual-cycle: truck mixer plant↔site **+** placing (buggy / crane bucket / mobile pump) coupled by **site buffer** |

Shared site scenario for concreting: distance (m), height (m), truck fleet, buffer, phase means + CV. Compare three placing methods on the same scenario.

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deploy on Streamlit Community Cloud

1. Open [share.streamlit.io](https://share.streamlit.io)
2. **New app** → repository **`m46d45/SiklOps`**
3. Branch: `main` · Main file: **`app.py`**
4. Deploy

Public repo: https://github.com/m46d45/SiklOps

## Stack

- Python 3.10+
- Streamlit, pandas, numpy, plotly
- Pure-Python DES (heapq + random) — no external DES library

## Version

- **1.1** — SiklOps rebrand · Earthmoving + Concreting dual-cycle
- Based on SiklOps 1.0 earthmoving engine

## License

Educational use.
