import { faultLabel } from "./format";
import type { Prediction, Severity, TaxonomyEntry } from "../types";

export interface HealthInfo {
  faultId: string;
  /** Curated taxonomy display name (e.g. "Fabric Link Down"), falling back
   * to a title-cased version of the id when no taxonomy entry matches. */
  faultName: string;
  confidence: number;
  severity: Severity;
  isFault: boolean;
}

const CONFIDENCE_THRESHOLD = 0.55;

export function healthFor(
  key: string,
  predictions: Record<string, Prediction>,
  taxonomyById: Map<string, TaxonomyEntry>
): HealthInfo {
  const pred = predictions[key];
  if (!pred || pred.faultId === "healthy" || pred.confidence < CONFIDENCE_THRESHOLD) {
    return { faultId: "healthy", faultName: "Healthy", confidence: pred?.confidence ?? 1, severity: "info", isFault: false };
  }
  const taxonomy = taxonomyById.get(pred.faultId);
  return {
    faultId: pred.faultId,
    faultName: taxonomy?.name ?? faultLabel(pred.faultId),
    confidence: pred.confidence,
    severity: taxonomy?.severity ?? "warning",
    isFault: true,
  };
}

export function worstSeverity(list: HealthInfo[]): Severity {
  if (list.some((h) => h.severity === "critical")) return "critical";
  if (list.some((h) => h.severity === "warning")) return "warning";
  return "info";
}

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/** Returns the component key with the worst active fault (highest severity, then highest
 * confidence), or null if every monitored component is currently healthy. */
export function mostUnhealthyKey(
  predictions: Record<string, Prediction>,
  taxonomyById: Map<string, TaxonomyEntry>
): string | null {
  let best: { key: string; rank: number; confidence: number } | null = null;
  for (const key of Object.keys(predictions)) {
    const health = healthFor(key, predictions, taxonomyById);
    if (!health.isFault) continue;
    const rank = SEVERITY_RANK[health.severity];
    if (!best || rank > best.rank || (rank === best.rank && health.confidence > best.confidence)) {
      best = { key, rank, confidence: health.confidence };
    }
  }
  return best?.key ?? null;
}
