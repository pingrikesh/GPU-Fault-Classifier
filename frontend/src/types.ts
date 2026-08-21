export type Severity = "info" | "warning" | "critical";
export type ComponentType = "gpu" | "nvlink" | "pcie" | "network" | "nccl";
export type Layer =
  | "physical"
  | "data_link"
  | "network"
  | "transport"
  | "nccl"
  | "gpu_health";

export type ThrottleReason =
  | "none"
  | "thermal"
  | "power_cap"
  | "reliability_voltage"
  | "sw_slowdown"
  | "hw_slowdown";

/** Raw per-tick telemetry for one component. Almost every field is numeric;
 * `throttleReason` is the one string enum field mixed in. */
export type MetricValue = number | string;
export type ComponentMetrics = Record<string, MetricValue>;

export interface TaxonomyEntry {
  id: string;
  name: string;
  component: ComponentType;
  severity: Severity;
  family: "none" | "gpu" | "interconnect";
  layer: Layer;
  description: string;
}

export interface TopologyGpu {
  id: string;
  node: number;
  gpu: number;
}

export interface TopologyNvLink {
  id: string;
  node: number;
  gpuA: number;
  gpuB: number;
}

export interface TopologyPcie {
  id: string;
  node: number;
  gpu: number;
}

export interface TopologyNetworkLink {
  id: string;
  nodeA: number;
  nodeB: number;
}

export interface Topology {
  nNodes: number;
  gpusPerNode: number;
  gpus: TopologyGpu[];
  nvlinks: TopologyNvLink[];
  pcieLinks: TopologyPcie[];
  networkLinks: TopologyNetworkLink[];
  peaks: { nvlinkGbps: number; pcieGbps: number; networkGbps: number };
}

export interface Prediction {
  faultId: string;
  confidence: number;
  layer?: Layer;
}

export interface FaultEvent {
  event: "opened" | "resolved";
  id?: number;
  faultId: string;
  componentType?: ComponentType;
  componentKey: string;
  node?: number | null;
  severity?: Severity;
  layer?: Layer;
  confidence?: number;
}

export interface TickPayload {
  type: "tick";
  tick: number;
  metrics: Record<string, ComponentMetrics>;
  predictions: Record<string, Prediction>;
  events: FaultEvent[];
}

export interface FaultRow {
  id: number;
  faultId: string;
  componentType: ComponentType;
  componentKey: string;
  node: number | null;
  severity: Severity;
  layer: Layer;
  confidence: number;
  maxConfidence: number;
  status: "active" | "resolved";
  startedAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface FaultStats {
  byFaultId: Record<string, number>;
  byComponentType: Record<string, number>;
  byLayer?: Record<string, number>;
  activeCount: number;
  totalCount: number;
}

export interface ComponentTypeReport {
  accuracy: number;
  classes: string[];
  confusionMatrix: number[][];
  classificationReport: Record<string, { precision: number; recall: number; "f1-score": number; support: number }>;
  nTrain: number;
  nTest: number;
}

export interface ModelInfo {
  componentTypes?: Record<string, ComponentTypeReport>;
  overallAccuracy?: number;
  savedAt?: string;
}
