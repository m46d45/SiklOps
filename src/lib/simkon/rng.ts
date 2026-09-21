/**
 * Seeded PRNG (mulberry32) + distributions used by the DES engine.
 * Not identical to Python's Mersenne Twister, but deterministic per seed.
 */

export class Rng {
  private state: number;

  constructor(seed: number | null | undefined) {
    const s = seed == null ? (Date.now() >>> 0) : (seed >>> 0);
    this.state = s === 0 ? 0x9e3779b9 : s;
  }

  /** Uniform [0, 1) */
  random(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Normal via Box–Muller */
  gauss(mu: number, sigma: number): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mu + sigma * z;
  }

  /** Gamma(shape, scale) — Marsaglia & Tsang for shape >= 1, boost for < 1 */
  gammavariate(shape: number, scale: number): number {
    if (shape <= 0 || scale <= 0) return 0;
    if (shape < 1) {
      const u = this.random();
      return this.gammavariate(1 + shape, scale) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.gauss(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }

  /** Beta(α, β) via gamma ratio */
  betavariate(alpha: number, beta: number): number {
    const a = this.gammavariate(alpha, 1);
    const b = this.gammavariate(beta, 1);
    const s = a + b;
    if (s <= 0) return 0.5;
    return a / s;
  }
}
