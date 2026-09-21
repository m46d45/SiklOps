import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}
