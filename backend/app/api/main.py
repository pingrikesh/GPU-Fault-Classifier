"""FastAPI application entrypoint.

Wires together the live simulation engine, the trained fault classifier
suite, the persistent fault store, and a WebSocket broadcaster into a
single running service. Run with:

    uvicorn app.api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import contextlib
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes
from app.api.routes import prediction_payload
from app.api.tracker import FaultTracker
from app.api.websocket import ConnectionManager
from app.classifier.model import FaultClassifierSuite
from app.simulator.engine import SimulationEngine, TICK_SECONDS
from app.store.db import FaultStore

app = FastAPI(title="GPU Fault Classifier", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# "simulated" (default) drives the whole dashboard off the synthetic
# cluster. "nvml" swaps just the GPU layer for real telemetry read via
# NVML (see app/collectors/real_engine.py); NVLink/PCIe/network/NCCL stay
# simulated-healthy until they have a real data source wired up too.
TELEMETRY_MODE = os.environ.get("TELEMETRY_MODE", "simulated").lower()

if TELEMETRY_MODE == "nvml":
    from app.collectors.real_engine import RealTelemetryEngine

    print("TELEMETRY_MODE=nvml: sourcing GPU metrics from real hardware via NVML.")
    print(
        "NOTE: the shipped classifier was trained only on synthetic simulator data \u2014 "
        "its predictions on real telemetry may be unreliable until retrained on real, "
        "fault-labeled data from this cluster. See README.md > 'Extending toward real hardware'."
    )
    engine = RealTelemetryEngine(seed=None)
else:
    engine = SimulationEngine(seed=None)

store = FaultStore()
tracker = FaultTracker(store)
manager = ConnectionManager()

app.state.engine = engine
app.state.store = store
app.state.tracker = tracker
app.state.manager = manager
app.state.classifier = None

app.include_router(routes.router)

_loop_task: asyncio.Task | None = None


@app.on_event("startup")
async def on_startup() -> None:
    if not FaultClassifierSuite.exists():
        print("No trained model found. Training classifier on synthetic data (first run only)...")
        from app.classifier.train import main as train_main

        await asyncio.get_event_loop().run_in_executor(None, train_main)

    app.state.classifier = FaultClassifierSuite.load()

    global _loop_task
    _loop_task = asyncio.create_task(simulation_loop())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    if _loop_task is not None:
        _loop_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _loop_task
    if hasattr(engine, "gpu_collector"):
        engine.gpu_collector.shutdown()


async def simulation_loop() -> None:
    classifier = app.state.classifier
    while True:
        snapshot = engine.tick()
        events: list[dict] = []
        predictions: dict[str, dict] = {}

        for key, ctype in engine.component_type_of.items():
            if not engine.is_window_ready(key):
                continue
            window = engine.window_for(key)
            result = classifier.predict(ctype, window)
            predictions[key] = prediction_payload(result.fault_id, result.confidence)
            event = tracker.apply_prediction(ctype, key, result.fault_id, result.confidence)
            if event:
                events.append(event)

        payload = {
            "type": "tick",
            "tick": snapshot["tick"],
            "metrics": snapshot["metrics"],
            "predictions": predictions,
            "events": events,
        }
        await manager.broadcast(payload)
        await asyncio.sleep(TICK_SECONDS)


@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "tick": engine.tick_idx}
