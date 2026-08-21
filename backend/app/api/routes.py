from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.classifier.labels import FAULT_BY_ID, FAULT_DEFS

router = APIRouter(prefix="/api")


def prediction_payload(fault_id: str, confidence: float) -> dict:
    fault_def = FAULT_BY_ID.get(fault_id)
    layer = fault_def.layer.value if fault_def else "gpu_health"
    return {"faultId": fault_id, "confidence": confidence, "layer": layer}


@router.get("/topology")
async def get_topology(request: Request):
    # Read from the running engine rather than a hardcoded default so this
    # reflects reality when TELEMETRY_MODE=nvml builds a topology sized to
    # whatever GPU count NVML actually reports on the host.
    return request.app.state.engine.topology.to_dict()


@router.get("/taxonomy")
async def get_taxonomy():
    return [
        {
            "id": f.id,
            "name": f.name,
            "component": f.component.value,
            "severity": f.severity.value,
            "family": f.family,
            "layer": f.layer.value,
            "description": f.description,
        }
        for f in FAULT_DEFS
    ]


@router.get("/state")
async def get_state(request: Request):
    engine = request.app.state.engine
    classifier = request.app.state.classifier
    predictions = {}
    for key, ctype in engine.component_type_of.items():
        if not engine.is_window_ready(key):
            continue
        result = classifier.predict(ctype, engine.window_for(key))
        predictions[key] = prediction_payload(result.fault_id, result.confidence)
    return {
        "tick": engine.tick_idx,
        "metrics": engine.last_metrics,
        "predictions": predictions,
    }


@router.get("/faults")
async def list_faults(
    request: Request,
    status: str | None = Query(default=None),
    faultId: str | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
):
    store = request.app.state.store
    rows = store.list_faults(status=status, fault_id=faultId, limit=limit)
    return [r.to_dict() for r in rows]


@router.get("/faults/stats")
async def fault_stats(request: Request):
    store = request.app.state.store
    return store.stats()


@router.get("/model/info")
async def model_info(request: Request):
    classifier = request.app.state.classifier
    return classifier.metadata or {}
