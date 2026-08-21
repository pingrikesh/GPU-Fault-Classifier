import numpy as np

from app.simulator.engine import SimulationEngine, WINDOW_SIZE
from app.simulator.faults import COMPONENT_FAULT_IDS, intensity_profile
from app.simulator.telemetry import TICK_FUNCS
from app.simulator.topology import DEFAULT_TOPOLOGY


def test_topology_shape():
    t = DEFAULT_TOPOLOGY
    assert len(t.gpus) == t.n_nodes * t.gpus_per_node
    assert len(t.nvlinks) == t.n_nodes * (t.gpus_per_node * (t.gpus_per_node - 1) // 2)
    assert len(t.network_links) == t.n_nodes * (t.n_nodes - 1) // 2


def test_engine_is_deterministic_with_seed():
    e1 = SimulationEngine(seed=123)
    e2 = SimulationEngine(seed=123)
    for _ in range(5):
        s1 = e1.tick()
        s2 = e2.tick()
        assert s1["metrics"] == s2["metrics"]


def test_window_ready_after_enough_ticks():
    e = SimulationEngine(seed=1)
    key = next(iter(e.component_type_of))
    for _ in range(WINDOW_SIZE - 1):
        e.tick()
    assert not e.is_window_ready(key)
    e.tick()
    assert e.is_window_ready(key)


def test_all_component_types_have_healthy_and_faults():
    for ctype, faults in COMPONENT_FAULT_IDS.items():
        assert "healthy" in faults
        assert len(faults) > 1


def test_intensity_profile_ramps_and_decays():
    assert intensity_profile(0.0, 1.0) == 0.0
    assert intensity_profile(0.5, 1.0) == 1.0
    assert intensity_profile(1.0, 1.0) == 0.0


def test_tick_funcs_produce_numeric_or_enum_fields():
    rng = np.random.default_rng(0)
    for ctype, fn in TICK_FUNCS.items():
        for fault_id in COMPONENT_FAULT_IDS[ctype]:
            tick = fn(rng, fault_id, 0.8)
            assert isinstance(tick, dict)
            # throttleReason is a string enum; everything else is numeric.
            assert all(isinstance(v, (int, float, str)) for v in tick.values())


def test_nvlink_degradation_reduces_active_lane_count():
    rng = np.random.default_rng(0)
    state: dict = {}
    ticks = [TICK_FUNCS["nvlink"](rng, "nvlink_degradation", 0.95, state=state) for _ in range(10)]
    assert all(t["activeLaneCount"] < t["expectedLaneCount"] for t in ticks)
    assert all(t["activeLaneCount"] >= 1 for t in ticks)


def test_nvlink_healthy_uses_full_lane_count():
    rng = np.random.default_rng(0)
    state: dict = {}
    ticks = [TICK_FUNCS["nvlink"](rng, "healthy", 0.0, state=state) for _ in range(10)]
    assert all(t["activeLaneCount"] == t["expectedLaneCount"] for t in ticks)


def test_nvlink_cumulative_counters_only_climb():
    rng = np.random.default_rng(1)
    state: dict = {}
    prev = {"crcErrorCount": 0, "replayCount": 0, "recoveryCount": 0}
    for _ in range(30):
        t = TICK_FUNCS["nvlink"](rng, "nvlink_flap", 0.9, state=state)
        assert t["crcErrorCount"] >= prev["crcErrorCount"]
        assert t["replayCount"] >= prev["replayCount"]
        assert t["recoveryCount"] >= prev["recoveryCount"]
        prev = t
    assert prev["crcErrorCount"] > 0
    assert prev["recoveryCount"] > 0


def test_ecc_uncorrectable_drives_dbe_and_retired_pages():
    rng = np.random.default_rng(2)
    state: dict = {}
    for _ in range(40):
        t = TICK_FUNCS["gpu"](rng, "ecc_uncorrectable", 0.95, state=state)
    assert t["eccDbeCount"] > 0
    assert t["retiredPagesCount"] > 0


def test_throttle_reason_reflects_active_fault():
    rng = np.random.default_rng(3)
    thermal = TICK_FUNCS["gpu"](rng, "thermal_throttle", 0.9)
    power = TICK_FUNCS["gpu"](rng, "power_throttle", 0.9)
    healthy = TICK_FUNCS["gpu"](rng, "healthy", 0.0)
    assert thermal["throttleReason"] == "thermal"
    assert power["throttleReason"] == "power_cap"
    assert healthy["throttleReason"] == "none"


def test_cumulative_state_persists_across_engine_ticks():
    e = SimulationEngine(seed=7)
    key = next(k for k, ct in e.component_type_of.items() if ct == "nvlink")
    for _ in range(5):
        e.tick()
    assert key in e.cumulative_state
    assert "crcErrorCount" in e.last_metrics[key]
