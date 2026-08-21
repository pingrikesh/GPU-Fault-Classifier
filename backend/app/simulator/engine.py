"""Live simulation engine: advances the emulated cluster one tick at a
time, keeps rolling telemetry windows per component for classification,
and reports ground-truth fault state (useful for debugging / evaluating
live classifier accuracy, but not shown to the classifier itself).
"""

from __future__ import annotations

from collections import deque

import numpy as np

from app.classifier.labels import ComponentType
from app.simulator.faults import FaultInjector
from app.simulator.telemetry import TICK_FUNCS
from app.simulator.topology import DEFAULT_TOPOLOGY, Topology

WINDOW_SIZE = 20
TICK_SECONDS = 1.0


class SimulationEngine:
    def __init__(self, topology: Topology | None = None, seed: int | None = None):
        self.topology = topology or DEFAULT_TOPOLOGY
        self.rng = np.random.default_rng(seed)
        self.tick_idx = 0

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

        self.injector = FaultInjector(component_keys_by_type, self.rng)
        self.windows: dict[str, deque] = {
            key: deque(maxlen=WINDOW_SIZE) for key in self.component_type_of
        }
        self.last_metrics: dict[str, dict] = {}
        self.last_ground_truth: dict[str, tuple[str, float]] = {}
        # Persisted across ticks so cumulative counters (ECC counts, NVLink
        # CRC/replay/recovery counts, ...) keep incrementing like real
        # lifetime hardware counters instead of resetting every tick.
        self.cumulative_state: dict[str, dict] = {key: {} for key in self.component_type_of}

    def tick(self) -> dict:
        self.injector.step(self.tick_idx)

        for key, ctype in self.component_type_of.items():
            fault_id, intensity = self.injector.state_for(key, self.tick_idx)
            metrics = TICK_FUNCS[ctype](self.rng, fault_id, intensity, state=self.cumulative_state[key])
            self.windows[key].append(metrics)
            self.last_metrics[key] = metrics
            self.last_ground_truth[key] = (fault_id, intensity)

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
