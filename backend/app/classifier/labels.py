"""Fault taxonomy for the GPU fault classifier.

Faults are split into two families:

- "gpu" faults: broad, single-GPU health problems (thermal, power, ECC,
  driver/Xid errors, job hangs).
- "link" faults: deep inter-GPU / inter-node communication problems
  (NVLink, PCIe, network fabric, NCCL collectives).

Every fault has a stable string id (used as the ML label), a human
readable name, the component type it applies to, a default severity
used for UI color coding, and an OSI-ish communication *layer* that
identifies where in the stack the fault originates.
"""

from dataclasses import dataclass
from enum import Enum


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ComponentType(str, Enum):
    GPU = "gpu"
    NVLINK = "nvlink"
    PCIE = "pcie"
    NETWORK = "network"
    NCCL = "nccl"


class Layer(str, Enum):
    PHYSICAL = "physical"
    DATA_LINK = "data_link"
    NETWORK = "network"
    TRANSPORT = "transport"
    NCCL = "nccl"
    GPU_HEALTH = "gpu_health"


@dataclass(frozen=True)
class FaultDef:
    id: str
    name: str
    component: ComponentType
    severity: Severity
    family: str  # "gpu" (broad) or "interconnect" (deep)
    layer: Layer
    description: str


HEALTHY = "healthy"

FAULT_DEFS: list[FaultDef] = [
    FaultDef(
        id=HEALTHY,
        name="Healthy",
        component=ComponentType.GPU,
        severity=Severity.INFO,
        family="none",
        layer=Layer.GPU_HEALTH,
        description="No fault detected; telemetry within normal operating envelope.",
    ),
    # ---- Broad GPU health faults -------------------------------------
    FaultDef(
        id="ecc_uncorrectable",
        name="Uncorrectable ECC Error",
        component=ComponentType.GPU,
        severity=Severity.CRITICAL,
        family="gpu",
        layer=Layer.GPU_HEALTH,
        description="Burst of uncorrectable ECC memory errors, often preceding Xid 48/63/64.",
    ),
    FaultDef(
        id="thermal_throttle",
        name="Thermal Throttling",
        component=ComponentType.GPU,
        severity=Severity.WARNING,
        family="gpu",
        layer=Layer.GPU_HEALTH,
        description="GPU temperature exceeds threshold, clocks throttled to protect hardware.",
    ),
    FaultDef(
        id="power_throttle",
        name="Power Throttling",
        component=ComponentType.GPU,
        severity=Severity.WARNING,
        family="gpu",
        layer=Layer.GPU_HEALTH,
        description="GPU power draw hits board power cap, clocks throttled.",
    ),
    FaultDef(
        id="xid_driver_error",
        name="Xid / Driver Error",
        component=ComponentType.GPU,
        severity=Severity.CRITICAL,
        family="gpu",
        layer=Layer.GPU_HEALTH,
        description="Driver reports an Xid fault (e.g. GPU fallen off the bus, engine exception).",
    ),
    FaultDef(
        id="gpu_hang",
        name="GPU Compute Hang",
        component=ComponentType.GPU,
        severity=Severity.CRITICAL,
        family="gpu",
        layer=Layer.GPU_HEALTH,
        description="SM utilization flatlines mid-job; kernel appears stuck.",
    ),
    # ---- Deep interconnect / communication faults ---------------------
    FaultDef(
        id="nvlink_degradation",
        name="NVLink Degradation",
        component=ComponentType.NVLINK,
        severity=Severity.WARNING,
        family="interconnect",
        layer=Layer.DATA_LINK,
        description="NVLink achieved bandwidth drops well below theoretical peak with rising CRC/replay errors.",
    ),
    FaultDef(
        id="nvlink_flap",
        name="NVLink Link Flap",
        component=ComponentType.NVLINK,
        severity=Severity.CRITICAL,
        family="interconnect",
        layer=Layer.DATA_LINK,
        description="NVLink repeatedly transitions up/down, causing intermittent communication failures.",
    ),
    FaultDef(
        id="pcie_bottleneck",
        name="PCIe Link Bottleneck",
        component=ComponentType.PCIE,
        severity=Severity.WARNING,
        family="interconnect",
        layer=Layer.TRANSPORT,
        description="PCIe link downtrains to a lower generation/width, collapsing host<->GPU throughput.",
    ),
    FaultDef(
        id="network_congestion",
        name="Fabric Congestion",
        component=ComponentType.NETWORK,
        severity=Severity.WARNING,
        family="interconnect",
        layer=Layer.NETWORK,
        description="Inter-node RoCE/InfiniBand link saturated; latency and retransmits spike.",
    ),
    FaultDef(
        id="network_link_down",
        name="Fabric Link Down",
        component=ComponentType.NETWORK,
        severity=Severity.CRITICAL,
        family="interconnect",
        layer=Layer.NETWORK,
        description="Inter-node fabric link drops entirely, isolating a node from the cluster.",
    ),
    FaultDef(
        id="nccl_straggler",
        name="NCCL Straggler Rank",
        component=ComponentType.NCCL,
        severity=Severity.WARNING,
        family="interconnect",
        layer=Layer.NCCL,
        description="One rank's collective op time is a severe outlier, slowing the whole all-reduce.",
    ),
    FaultDef(
        id="nccl_timeout",
        name="NCCL Collective Timeout",
        component=ComponentType.NCCL,
        severity=Severity.CRITICAL,
        family="interconnect",
        layer=Layer.NCCL,
        description="A collective operation exceeds its timeout budget entirely (hang/deadlock signature).",
    ),
]

FAULT_BY_ID: dict[str, FaultDef] = {f.id: f for f in FAULT_DEFS}

ALL_LABELS: list[str] = [f.id for f in FAULT_DEFS]

GPU_FAULTS = [f.id for f in FAULT_DEFS if f.family == "gpu"]
INTERCONNECT_FAULTS = [f.id for f in FAULT_DEFS if f.family == "interconnect"]
