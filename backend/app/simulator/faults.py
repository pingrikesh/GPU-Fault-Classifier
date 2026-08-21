"""Fault injection: decides which components are faulted, with what fault
type, and at what intensity, at any point in simulated time.

A fault instance has a lifecycle: a short ramp-up, a plateau at a random
peak intensity, and (for most faults) a ramp-down back to healthy. This
produces gradual, realistic-looking telemetry transitions rather than
step functions, which matters both for the live dashboard and for
training a classifier that has to work on real onset/decay patterns.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.classifier.labels import ComponentType, FAULT_DEFS, HEALTHY

COMPONENT_FAULT_IDS: dict[str, list[str]] = {
    ct.value: [HEALTHY] + [f.id for f in FAULT_DEFS if f.component == ct]
    for ct in ComponentType
}

RAMP_UP_FRAC = 0.15
RAMP_DOWN_FRAC = 0.2


def intensity_profile(elapsed_frac: float, peak: float) -> float:
    if elapsed_frac < RAMP_UP_FRAC:
        return peak * (elapsed_frac / RAMP_UP_FRAC)
    if elapsed_frac > 1 - RAMP_DOWN_FRAC:
        remaining = max(0.0, 1 - elapsed_frac)
        return peak * (remaining / RAMP_DOWN_FRAC)
    return peak


@dataclass
class FaultInstance:
    fault_id: str
    component_key: str
    component_type: str
    start_tick: int
    duration_ticks: int
    peak_intensity: float

    def current_intensity(self, tick: int) -> float:
        elapsed = tick - self.start_tick
        if elapsed < 0 or elapsed > self.duration_ticks:
            return 0.0
        frac = elapsed / self.duration_ticks
        return intensity_profile(frac, self.peak_intensity)

    def is_finished(self, tick: int) -> bool:
        return tick - self.start_tick > self.duration_ticks


class FaultInjector:
    """Stateful fault scheduler for the live simulation engine."""

    def __init__(
        self,
        component_keys_by_type: dict[str, list[str]],
        rng: np.random.Generator,
        spawn_prob_per_tick: float = 0.006,
        min_duration: int = 20,
        max_duration: int = 90,
    ):
        self.component_keys_by_type = component_keys_by_type
        self.rng = rng
        self.spawn_prob_per_tick = spawn_prob_per_tick
        self.min_duration = min_duration
        self.max_duration = max_duration
        self.active: dict[str, FaultInstance] = {}

    def step(self, tick: int) -> None:
        for key in list(self.active.keys()):
            if self.active[key].is_finished(tick):
                del self.active[key]

        for component_type, keys in self.component_keys_by_type.items():
            fault_ids = [f for f in COMPONENT_FAULT_IDS[component_type] if f != HEALTHY]
            if not fault_ids:
                continue
            for key in keys:
                if key in self.active:
                    continue
                if self.rng.random() < self.spawn_prob_per_tick:
                    fault_id = fault_ids[self.rng.integers(0, len(fault_ids))]
                    duration = int(self.rng.integers(self.min_duration, self.max_duration))
                    peak = float(self.rng.uniform(0.55, 1.0))
                    self.active[key] = FaultInstance(
                        fault_id=fault_id,
                        component_key=key,
                        component_type=component_type,
                        start_tick=tick,
                        duration_ticks=duration,
                        peak_intensity=peak,
                    )

    def state_for(self, component_key: str, tick: int) -> tuple[str, float]:
        inst = self.active.get(component_key)
        if inst is None:
            return HEALTHY, 0.0
        return inst.fault_id, inst.current_intensity(tick)
