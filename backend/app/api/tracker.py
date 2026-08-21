"""Bridges live classifier predictions to the persistent fault store,
opening/updating/resolving fault "episodes" per component.
"""

from __future__ import annotations

from app.classifier.labels import FAULT_BY_ID, HEALTHY
from app.store.db import FaultStore

CONFIDENCE_THRESHOLD = 0.55


def parse_node(component_type: str, component_key: str) -> int | None:
    try:
        if component_type in ("gpu", "pcie"):
            return int(component_key.split("g" if component_type == "gpu" else "-pcie-")[0][1:])
        if component_type == "nvlink":
            return int(component_key.split("-nvl-")[0][1:])
        if component_type == "nccl":
            return int(component_key.split("-nccl")[0][1:])
        if component_type == "network":
            return int(component_key.split("-")[1])
    except (ValueError, IndexError):
        return None
    return None


def _fault_metadata(fault_id: str) -> tuple[str, str]:
    fault_def = FAULT_BY_ID.get(fault_id)
    severity = fault_def.severity.value if fault_def else "warning"
    layer = fault_def.layer.value if fault_def else "gpu_health"
    return severity, layer


class FaultTracker:
    """Owns transient prediction state and syncs episodes into FaultStore."""

    def __init__(self, store: FaultStore):
        self.store = store
        self._active_row_id: dict[str, int] = {}

    def apply_prediction(self, component_type: str, component_key: str, fault_id: str, confidence: float) -> dict | None:
        is_fault = fault_id != HEALTHY and confidence >= CONFIDENCE_THRESHOLD
        active = self.store.get_active(component_key)

        if is_fault:
            severity, layer = _fault_metadata(fault_id)

            if active is None:
                row = self.store.open_fault(
                    fault_id=fault_id,
                    component_type=component_type,
                    component_key=component_key,
                    node=parse_node(component_type, component_key),
                    severity=severity,
                    layer=layer,
                    confidence=confidence,
                )
                self._active_row_id[component_key] = row.id
                return {"event": "opened", **row.to_dict()}
            elif active.fault_id != fault_id:
                self.store.resolve_fault(active.id)
                row = self.store.open_fault(
                    fault_id=fault_id,
                    component_type=component_type,
                    component_key=component_key,
                    node=parse_node(component_type, component_key),
                    severity=severity,
                    layer=layer,
                    confidence=confidence,
                )
                self._active_row_id[component_key] = row.id
                return {"event": "opened", **row.to_dict()}
            else:
                self.store.update_fault(active.id, confidence)
                return None
        else:
            if active is not None:
                self.store.resolve_fault(active.id)
                self._active_row_id.pop(component_key, None)
                _, layer = _fault_metadata(active.fault_id)
                return {
                    "event": "resolved",
                    "componentKey": component_key,
                    "faultId": active.fault_id,
                    "layer": layer,
                }
        return None
