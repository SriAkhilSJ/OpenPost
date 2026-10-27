"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveStatusResponse } from "@/lib/orchestration";

export function useLiveStatus(campaignId?: number) {
  const [status, setStatus] = useState<LiveStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as LiveStatusResponse;
      setStatus(data);
    } catch {
      // Ignore transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [campaignId, refresh]);

  useEffect(() => {
    const isBusy =
      (status?.activePlanCount || 0) > 0 ||
      Object.values(status?.agents || {}).some(
        (a) => a.status === "running" || a.status === "queued"
      );

    const intervalMs = isBusy ? 1400 : 4500;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [status, refresh]);

  return { status, loading, refresh };
}
