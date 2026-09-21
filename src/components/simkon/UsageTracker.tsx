import { useEffect, useState } from "react";
import { fetchUsageSnapshot, trackVisitOnce } from "@/lib/simkon/usageClient";
import type { UsageSnapshot } from "@/lib/simkon/usage";
import { emptySnapshot } from "@/lib/simkon/usageClient";

export function UsageTracker() {
  useEffect(() => {
    trackVisitOnce();
  }, []);
  return null;
}

export function useUsageSnapshot() {
  const [stats, setStats] = useState<UsageSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchUsageSnapshot().then((s) => {
        if (!cancelled) {
          setStats(s);
          setReady(true);
        }
      });
    };
    load();
    const on = () => load();
    window.addEventListener("siklops-usage", on);
    return () => {
      cancelled = true;
      window.removeEventListener("siklops-usage", on);
    };
  }, []);

  return { stats, ready };
}
