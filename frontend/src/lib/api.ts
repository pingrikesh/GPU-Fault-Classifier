import type { FaultRow, FaultStats, ModelInfo, TaxonomyEntry, Topology } from "../types";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/telemetry";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  topology: () => getJson<Topology>("/api/topology"),
  taxonomy: () => getJson<TaxonomyEntry[]>("/api/taxonomy"),
  state: () => getJson<{ tick: number; metrics: Record<string, any>; predictions: Record<string, any> }>("/api/state"),
  faults: (params: { status?: string; faultId?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.faultId) qs.set("faultId", params.faultId);
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return getJson<FaultRow[]>(`/api/faults${suffix}`);
  },
  faultStats: () => getJson<FaultStats>("/api/faults/stats"),
  modelInfo: () => getJson<ModelInfo>("/api/model/info"),
};
