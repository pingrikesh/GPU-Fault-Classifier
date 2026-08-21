"""Tests for the real-hardware telemetry plumbing. These never touch real
NVML or a GPU: `FakeGpuCollector` stands in for `NvmlGpuCollector` behind
the same `device_count` / `poll()` interface, so `RealTelemetryEngine`'s
wiring (topology sizing, component-key mapping, windowing, and the
"never fabricate a fault for a layer with no real source" rule) can be
verified on any machine.
"""

from app.collectors.nvml_gpu import map_throttle_reasons
from app.collectors.real_engine import RealTelemetryEngine, WINDOW_SIZE


class FakeGpuCollector:
    def __init__(self, device_count: int = 4):
        self._device_count = device_count
        self.polls = 0

    @property
    def device_count(self) -> int:
        return self._device_count

    def poll(self) -> dict[str, dict]:
        self.polls += 1
        return {
            str(i): {
                "smUtil": 70.0 + i,
                "memUtil": 50.0,
                "tempC": 60.0,
                "powerW": 300.0,
                "clockMhz": 1700.0,
                "eccSbeRate": 0.0,
                "eccDbeRate": 0.0,
                "xidFlag": 0,
                "hangFlag": 0,
                "eccSbeCount": 0,
                "eccDbeCount": 0,
                "retiredPagesCount": 0,
                "throttleReason": "none",
            }
            for i in range(self._device_count)
        }


def test_topology_sized_from_real_gpu_count():
    engine = RealTelemetryEngine(gpu_collector=FakeGpuCollector(device_count=8))
    assert engine.topology.n_nodes == 1
    assert engine.topology.gpus_per_node == 8
    assert len(engine.topology.gpus) == 8
    assert len(engine.topology.network_links) == 0  # one real node, no fabric to model


def test_tick_uses_real_gpu_metrics():
    engine = RealTelemetryEngine(gpu_collector=FakeGpuCollector(device_count=2))
    engine.tick()
    assert engine.last_metrics["n0g0"]["smUtil"] == 70.0
    assert engine.last_metrics["n0g1"]["smUtil"] == 71.0


def test_non_gpu_components_report_healthy_baseline_not_fabricated_faults():
    engine = RealTelemetryEngine(gpu_collector=FakeGpuCollector(device_count=4))
    engine.tick()
    nvlink_key = next(k for k, ct in engine.component_type_of.items() if ct == "nvlink")
    nccl_key = next(k for k, ct in engine.component_type_of.items() if ct == "nccl")
    nvlink_metrics = engine.last_metrics[nvlink_key]
    assert nvlink_metrics["linkUp"] == 1
    assert nvlink_metrics["activeLaneCount"] == nvlink_metrics["expectedLaneCount"]
    assert engine.last_ground_truth[nvlink_key] == ("healthy", 0.0)
    assert engine.last_ground_truth[nccl_key] == ("healthy", 0.0)


def test_gpu_ground_truth_is_unknown_not_fabricated():
    engine = RealTelemetryEngine(gpu_collector=FakeGpuCollector(device_count=1))
    engine.tick()
    assert engine.last_ground_truth["n0g0"][0] == "unknown"


def test_window_ready_after_enough_ticks():
    engine = RealTelemetryEngine(gpu_collector=FakeGpuCollector(device_count=1))
    key = next(iter(engine.component_type_of))
    for _ in range(WINDOW_SIZE - 1):
        engine.tick()
    assert not engine.is_window_ready(key)
    engine.tick()
    assert engine.is_window_ready(key)


def test_map_throttle_reasons_priority():
    assert map_throttle_reasons(0) == "none"
    assert map_throttle_reasons(0x1) == "none"  # GPU idle isn't a fault signal
    assert map_throttle_reasons(0x20) == "thermal"  # SW thermal slowdown
    assert map_throttle_reasons(0x40) == "thermal"  # HW thermal slowdown
    assert map_throttle_reasons(0x4) == "power_cap"  # SW power cap
    assert map_throttle_reasons(0x80) == "power_cap"  # HW power brake slowdown
    assert map_throttle_reasons(0x8) == "hw_slowdown"  # generic HW slowdown
    assert map_throttle_reasons(0x40 | 0x4) == "thermal"  # thermal wins over power cap
