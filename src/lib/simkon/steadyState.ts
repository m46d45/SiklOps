/** Deteksi steady state dari deret produktivitas per siklus. */

export type SteadyStateResult = {
  reached: boolean;
  ss_start_cycle: number | null;
  ss_mean: number | null;
  ss_cv: number | null;
  n_ss_cycles: number;
  reason: string;
};

function seriesCv(values: number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 1e-12) return null;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(v) / mean;
}

export function detectSteadyState(
  productivity: number[],
  window = 10,
  cvThreshold = 0.1,
  minSsCycles = 10,
): SteadyStateResult {
  const n = productivity.length;
  const empty: SteadyStateResult = {
    reached: false,
    ss_start_cycle: null,
    ss_mean: null,
    ss_cv: null,
    n_ss_cycles: 0,
    reason: n < Math.max(window, minSsCycles)
      ? `Butuh minimal ${Math.max(window, minSsCycles)} siklus (saat ini ${n}).`
      : "Steady state belum terdeteksi.",
  };
  if (n < Math.max(window, minSsCycles)) return empty;

  const w = Math.max(3, Math.min(window, n));
  const rolling: (number | null)[] = Array(n).fill(null);
  for (let i = w - 1; i < n; i++) {
    rolling[i] = seriesCv(productivity.slice(i - w + 1, i + 1));
  }

  let ssStart: number | null = null;
  const maxStart = n - minSsCycles;
  for (let s = 0; s <= maxStart; s++) {
    const region = productivity.slice(s);
    const cvR = seriesCv(region);
    if (cvR == null || cvR > cvThreshold) continue;
    let ok = 0;
    let tot = 0;
    for (let j = Math.max(s, w - 1); j < n; j++) {
      const cvj = rolling[j];
      if (cvj == null) continue;
      tot++;
      if (cvj <= cvThreshold) ok++;
    }
    if (tot > 0 && ok / tot >= 0.8) {
      ssStart = s;
      break;
    }
  }
  if (ssStart == null) {
    empty.reason = `SS belum tercapai (ambang CV ≤ ${(cvThreshold * 100).toFixed(0)}%). Perbanyak siklus atau longgarkan CV.`;
    return empty;
  }
  const ss = productivity.slice(ssStart);
  const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
  const cv = seriesCv(ss) ?? 0;
  return {
    reached: true,
    ss_start_cycle: ssStart + 1,
    ss_mean: mean,
    ss_cv: cv,
    n_ss_cycles: ss.length,
    reason: `Steady state mulai siklus ${ssStart + 1}–${n} (${ss.length} siklus, CV ${(cv * 100).toFixed(1)}%).`,
  };
}
