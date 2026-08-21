"""Synthetic telemetry generation.

Each component type (gpu, nvlink, pcie, network, nccl) has a "healthy"
baseline generator and a set of fault-specific perturbations. Faults are
applied with an `intensity` in [0, 1] representing how far into the fault
lifecycle we are (ramps up on onset, may partially recover), which keeps
transitions gradual and realistic instead of step functions.

All generators take a `numpy.random.Generator` so simulations are
reproducible when seeded.

Most fields are instantaneous rates/gauges resampled fresh each tick. A
handful of fields (ECC error/retired-page counts, NVLink CRC/replay/recovery
counts) are genuinely *cumulative* lifetime counters, matching real hardware
counters that only ever increase. These are threaded through an optional
`state` dict that the caller keeps alive across ticks for a given component
(see `SimulationEngine.cumulative_state` and `classifier.train.make_window`);
without a persisted `state`, each call starts a fresh counter at zero.
"""

from __future__ import annotations

import numpy as np

from app.simulator.topology import NVLINK_PEAK_GBPS, PCIE_PEAK_GBPS, NETWORK_PEAK_GBPS

THROTTLE_REASONS = ["none", "thermal", "power_cap", "reliability_voltage", "sw_slowdown", "hw_slowdown"]
NVLINK_EXPECTED_LANE_COUNT = 4

# --------------------------------------------------------------------------
# GPU
# --------------------------------------------------------------------------


def gpu_tick(rng: np.random.Generator, fault_id: str, intensity: float, state: dict | None = None) -> dict:
    if state is None:
        state = {}

    sm_util = np.clip(rng.normal(72, 6), 0, 100)
    mem_util = np.clip(rng.normal(55, 8), 0, 100)
    temp_c = np.clip(rng.normal(62, 3), 30, 95)
    power_w = np.clip(rng.normal(310, 15), 50, 400)
    clock_mhz = np.clip(rng.normal(1755, 25), 200, 1980)
    ecc_sbe_rate = max(0.0, rng.normal(0.2, 0.2))
    ecc_dbe_rate = 0.0
    xid_flag = 0
    hang_flag = 0
    throttle_reason = "none"

    if fault_id == "ecc_uncorrectable":
        ecc_dbe_rate = max(0.0, rng.normal(3 + 12 * intensity, 1.5))
        ecc_sbe_rate += max(0.0, rng.normal(5 * intensity, 2))
        if intensity > 0.6:
            xid_flag = 1 if rng.random() < 0.5 else 0
    elif fault_id == "thermal_throttle":
        temp_c = np.clip(temp_c + 22 * intensity + rng.normal(0, 1.5), 30, 99)
        clock_mhz = np.clip(clock_mhz - 650 * intensity, 200, 1980)
        power_w = np.clip(power_w - 60 * intensity, 50, 400)
        if intensity > 0.15:
            throttle_reason = "thermal"
    elif fault_id == "power_throttle":
        power_w = np.clip(390 - 10 * (1 - intensity) + rng.normal(0, 4), 50, 400)
        clock_mhz = np.clip(clock_mhz - 550 * intensity, 200, 1980)
        if intensity > 0.15:
            throttle_reason = "power_cap"
    elif fault_id == "xid_driver_error":
        xid_flag = 1 if rng.random() < (0.3 + 0.6 * intensity) else 0
        if intensity > 0.4:
            sm_util = np.clip(sm_util * (1 - 0.7 * intensity), 0, 100)
            mem_util = np.clip(mem_util * (1 - 0.7 * intensity), 0, 100)
    elif fault_id == "gpu_hang":
        hang_flag = 1
        sm_util = np.clip(rng.normal(2, 1) if intensity > 0.3 else sm_util * (1 - intensity), 0, 100)
        mem_util = np.clip(mem_util * (1 - 0.5 * intensity), 0, 100)
        power_w = np.clip(power_w * (1 - 0.3 * intensity) + rng.normal(0, 3), 50, 400)

    # Cumulative counters: sample this tick's new events from the current
    # rate, then accumulate. "ecc_uncorrectable" is the only fault that
    # drives ecc_dbe_rate above baseline, so DBE/retired-page counts only
    # climb meaningfully during that fault.
    sbe_events = int(rng.poisson(ecc_sbe_rate)) if ecc_sbe_rate > 0 else 0
    dbe_events = int(rng.poisson(ecc_dbe_rate)) if ecc_dbe_rate > 0 else 0
    newly_retired = int(rng.binomial(dbe_events, 0.4)) if dbe_events > 0 else 0

    state["eccSbeCount"] = state.get("eccSbeCount", 0) + sbe_events
    state["eccDbeCount"] = state.get("eccDbeCount", 0) + dbe_events
    state["retiredPagesCount"] = state.get("retiredPagesCount", 0) + newly_retired

    return {
        "smUtil": round(float(sm_util), 2),
        "memUtil": round(float(mem_util), 2),
        "tempC": round(float(temp_c), 2),
        "powerW": round(float(power_w), 2),
        "clockMhz": round(float(clock_mhz), 1),
        "eccSbeRate": round(float(ecc_sbe_rate), 3),
        "eccDbeRate": round(float(ecc_dbe_rate), 3),
        "xidFlag": int(xid_flag),
        "hangFlag": int(hang_flag),
        "eccSbeCount": int(state["eccSbeCount"]),
        "eccDbeCount": int(state["eccDbeCount"]),
        "retiredPagesCount": int(state["retiredPagesCount"]),
        "throttleReason": throttle_reason,
    }


# --------------------------------------------------------------------------
# NVLink
# --------------------------------------------------------------------------


def nvlink_tick(rng: np.random.Generator, fault_id: str, intensity: float, state: dict | None = None) -> dict:
    if state is None:
        state = {}

    link_up = 1
    tx_util = np.clip(rng.normal(0.62, 0.08), 0.05, 0.98)
    crc_rate = max(0.0, rng.normal(0.05, 0.05))
    replay_rate = max(0.0, rng.normal(0.02, 0.03))
    active_lanes = NVLINK_EXPECTED_LANE_COUNT

    if fault_id == "nvlink_degradation":
        tx_util = np.clip(tx_util * (1 - 0.75 * intensity), 0.02, 0.98)
        crc_rate = max(0.0, rng.normal(2 + 20 * intensity, 3))
        replay_rate = max(0.0, rng.normal(1 + 10 * intensity, 2))
        # Down-training: the link keeps running, just on fewer lanes, so no
        # "error" or "down" signal fires \u2014 only the lane count betrays it.
        active_lanes = max(1, NVLINK_EXPECTED_LANE_COUNT - round(2 * intensity))
    elif fault_id == "nvlink_flap":
        link_up = 0 if rng.random() < (0.15 + 0.55 * intensity) else 1
        if not link_up:
            tx_util = 0.0
            active_lanes = 0
        crc_rate = max(0.0, rng.normal(3 * intensity, 2))
        replay_rate = max(0.0, rng.normal(4 * intensity, 2))

    gbps = NVLINK_PEAK_GBPS * tx_util if link_up else 0.0

    crc_events = int(rng.poisson(crc_rate)) if crc_rate > 0 else 0
    replay_events = int(rng.poisson(replay_rate)) if replay_rate > 0 else 0
    prev_link_up = state.get("_prevLinkUp", 1)
    recovered = 1 if (prev_link_up == 0 and link_up == 1) else 0
    state["_prevLinkUp"] = link_up
    state["crcErrorCount"] = state.get("crcErrorCount", 0) + crc_events
    state["replayCount"] = state.get("replayCount", 0) + replay_events
    state["recoveryCount"] = state.get("recoveryCount", 0) + recovered

    return {
        "linkUp": int(link_up),
        "txGbps": round(float(gbps), 2),
        "utilPct": round(float(tx_util * 100 if link_up else 0.0), 2),
        "crcErrRate": round(float(crc_rate), 3),
        "replayRate": round(float(replay_rate), 3),
        "activeLaneCount": int(active_lanes),
        "expectedLaneCount": int(NVLINK_EXPECTED_LANE_COUNT),
        "crcErrorCount": int(state["crcErrorCount"]),
        "replayCount": int(state["replayCount"]),
        "recoveryCount": int(state["recoveryCount"]),
    }


# --------------------------------------------------------------------------
# PCIe
# --------------------------------------------------------------------------


def pcie_tick(rng: np.random.Generator, fault_id: str, intensity: float, state: dict | None = None) -> dict:
    gen = 4
    width = 16
    util = np.clip(rng.normal(0.45, 0.1), 0.02, 0.95)
    corr_err_rate = max(0.0, rng.normal(0.05, 0.05))
    uncorr_err_rate = 0.0

    if fault_id == "pcie_bottleneck":
        if intensity > 0.5:
            gen = 1
            width = 4
        elif intensity > 0.2:
            gen = 2
            width = 8
        util = np.clip(util * (1 - 0.5 * intensity), 0.02, 0.95)
        corr_err_rate = max(0.0, rng.normal(1 + 6 * intensity, 1.5))
        uncorr_err_rate = max(0.0, rng.normal(3 * intensity, 1))

    peak = PCIE_PEAK_GBPS * (width / 16) * (gen / 4)
    gbps = peak * util

    return {
        "genCurrent": int(gen),
        "widthCurrent": int(width),
        "txGbps": round(float(gbps), 2),
        "utilPct": round(float(util * 100), 2),
        "correctableErrRate": round(float(corr_err_rate), 3),
        "uncorrectableErrRate": round(float(uncorr_err_rate), 3),
    }


# --------------------------------------------------------------------------
# Network (inter-node fabric)
# --------------------------------------------------------------------------


def network_tick(rng: np.random.Generator, fault_id: str, intensity: float, state: dict | None = None) -> dict:
    link_up = 1
    util = np.clip(rng.normal(0.4, 0.12), 0.02, 0.97)
    latency_us = max(1.0, rng.normal(6, 1.2))
    packet_loss_pct = max(0.0, rng.normal(0.01, 0.01))
    retransmit_rate = max(0.0, rng.normal(0.02, 0.02))

    if fault_id == "network_congestion":
        util = np.clip(0.9 + 0.08 * intensity + rng.normal(0, 0.02), 0.02, 1.0)
        latency_us = max(1.0, rng.normal(6 + 180 * intensity, 20))
        packet_loss_pct = max(0.0, rng.normal(2 * intensity, 0.8))
        retransmit_rate = max(0.0, rng.normal(3 * intensity, 1))
    elif fault_id == "network_link_down":
        link_up = 0 if rng.random() < (0.2 + 0.7 * intensity) else 1
        if not link_up:
            util = 0.0
            latency_us = 0.0
        packet_loss_pct = max(0.0, rng.normal(40 * intensity, 15))
        retransmit_rate = max(0.0, rng.normal(20 * intensity, 8))

    gbps = NETWORK_PEAK_GBPS * util if link_up else 0.0

    return {
        "linkUp": int(link_up),
        "bwGbps": round(float(gbps), 2),
        "utilPct": round(float(util * 100 if link_up else 0.0), 2),
        "latencyUs": round(float(latency_us), 2),
        "packetLossPct": round(float(packet_loss_pct), 3),
        "retransmitRate": round(float(retransmit_rate), 3),
    }


# --------------------------------------------------------------------------
# NCCL collectives (aggregated per node, per training step)
# --------------------------------------------------------------------------


def nccl_tick(rng: np.random.Generator, fault_id: str, intensity: float, state: dict | None = None) -> dict:
    compute_ms = max(1.0, rng.normal(80, 6))
    comm_ms = max(1.0, rng.normal(22, 3))
    straggler_score = max(0.0, rng.normal(0.05, 0.05))
    timeout_flag = 0

    if fault_id == "nccl_straggler":
        straggler_score = max(0.0, rng.normal(0.3 + 2.5 * intensity, 0.4))
        comm_ms = max(1.0, comm_ms * (1 + 3 * intensity) + rng.normal(0, 3))
    elif fault_id == "nccl_timeout":
        comm_ms = max(1.0, comm_ms * (1 + 20 * intensity) + rng.normal(0, 10))
        timeout_flag = 1 if intensity > 0.55 else 0
        straggler_score = max(0.0, rng.normal(0.5 * intensity, 0.3))

    allreduce_ms = compute_ms + comm_ms

    return {
        "computeMs": round(float(compute_ms), 2),
        "commMs": round(float(comm_ms), 2),
        "allreduceMs": round(float(allreduce_ms), 2),
        "stragglerScore": round(float(straggler_score), 3),
        "timeoutFlag": int(timeout_flag),
    }


TICK_FUNCS = {
    "gpu": gpu_tick,
    "nvlink": nvlink_tick,
    "pcie": pcie_tick,
    "network": network_tick,
    "nccl": nccl_tick,
}
