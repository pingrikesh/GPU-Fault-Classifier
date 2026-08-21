"""Live "engine" that mirrors `app.simulator.engine.SimulationEngine`'s
public interface (`tick`, `window_for`, `is_window_ready`,
`component_type_of`, `last_metrics`, `tick_idx`) but sources GPU telemetry
from real hardware via NVML instead of the synthetic generators. Because
`app/api/main.py` and `app/api/routes.py` only ever call that shared
interface, swapping this in for `SimulationEngine` is enough to make the
existing feature extraction, classifier, fault tracker, WebSocket
broadcast, and the entire frontend run against a real GPU unmodified.

Only the GPU layer is real here. NVLink, PCIe, and NCCL have no wired-up
real data source yet (see the README's "Extending toward real hardware"
section), and a single real host has no inter-node fabric to model at
all, so:

- GPU metrics come from `NvmlGpuCollector.poll()`.
- NVLink / PCIe / NCCL report an always-"healthy" synthetic baseline
  (never a fabricated fault) so the dashboard never mixes a real signal
  with an invented one for layers we aren't actually measuring.
- The topology has exactly one node, sized to the number of GPUs NVML
  reports on this host \u2014 there's no synthetic inter-node network layer.

IMPORTANT: the shipped classifier (`app/classifier/train.py`) was trained
exclusively on the simulator's synthetic telemetry distributions. Pointing
it at real hardware will very likely need retraining on real, fault-
labeled telemetry from your cluster before its predictions can be
trusted \u2014 this engine is the plumbing that makes that retraining possible,
not a drop-in accurate detector.
"""

from __future__ import annotations

from collections import deque

import numpy as np

from app.classifier.labels import ComponentType
from app.collectors.nvml_gpu import NvmlGpuCollector
from app.simulator.telemetry import TICK_FUNCS
from app.simulator.topology import Topology

WINDOW_SIZE = 20
TICK_SECONDS = 1.0


class RealTelemetryEngine:
    def __init__(self, gpu_collector: NvmlGpuCollector | None = None, seed: int | None = None):
        # `gpu_collector` is injectable so tests (and anyone experimenting
        # with an alternate collector, e.g. a future DCGM-based one) don't
        # need real NVML hardware.
        self.gpu_collector = gpu_collector if gpu_collector is not None else NvmlGpuCollector()
        self.rng = np.random.default_rng(seed)
        self.tick_idx = 0

        self.topology = Topology(n_nodes=1, gpus_per_node=self.gpu_collector.device_count)
        self._gpu_index_by_key: dict[str, int] = {g.key: g.gpu for g in self.topology.gpus}

        component_keys_by_type: dict[str, list[str]] = {
            ComponentType.GPU.value: [g.key for g in self.topology.gpus],
            ComponentType.NVLINK.value: [l.key for l in self.topology.nvlinks],
            ComponentType.PCIE.value: [p.key for p in self.topology.pcie_links],
            ComponentType.NETWORK.value: [n.key for n in self.topology.network_links],
            ComponentType.NCCL.value: [f"n{n}-nccl" for n in range(self.topology.n_nodes)],
        }
        self.component_keys_by_type = component_keys_by_type
        self.component_type_of: dict[str, str] = {
            key: ctype for ctype, keys in component_keys_by_type.items() for key in keys
        }

        self.windows: dict[str, deque] = {key: deque(maxlen=WINDOW_SIZE) for key in self.component_type_of}
        self.last_metrics: dict[str, dict] = {}
        self.last_ground_truth: dict[str, tuple[str, float]] = {}
        self.cumulative_state: dict[str, dict] = {key: {} for key in self.component_type_of}

    def tick(self) -> dict:
        gpu_metrics = self.gpu_collector.poll()

        for key, ctype in self.component_type_of.items():
            if ctype == ComponentType.GPU.value:
                gpu_index = str(self._gpu_index_by_key[key])
                metrics = gpu_metrics.get(gpu_index, {})
                # Real fault state isn't known ahead of the classifier's
                # own prediction, unlike the simulator which injected it.
                ground_truth = ("unknown", 0.0)
            else:
                metrics = TICK_FUNCS[ctype](self.rng, "healthy", 0.0, state=self.cumulative_state[key])
                ground_truth = ("healthy", 0.0)

            self.windows[key].append(metrics)
            self.last_metrics[key] = metrics
            self.last_ground_truth[key] = ground_truth

        self.tick_idx += 1
        return {
            "tick": self.tick_idx,
            "metrics": dict(self.last_metrics),
            "groundTruth": {k: {"faultId": f, "intensity": i} for k, (f, i) in self.last_ground_truth.items()},
        }

    def window_for(self, component_key: str) -> list[dict]:
        return list(self.windows.get(component_key, []))

    def is_window_ready(self, component_key: str) -> bool:
        return len(self.windows.get(component_key, [])) >= WINDOW_SIZE
