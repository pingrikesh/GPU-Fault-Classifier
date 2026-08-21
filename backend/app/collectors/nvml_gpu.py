"""Real GPU telemetry collection via NVIDIA's NVML bindings (`pynvml`).

This is the "swap the tick source" half of the real-hardware integration
described in the README: `NvmlGpuCollector.poll()` produces per-GPU metric
dicts shaped exactly like `app.simulator.telemetry.gpu_tick()`'s output, so
the rest of the pipeline (rolling windows, feature extraction, the trained
classifier, fault tracker, WebSocket broadcast, and the entire frontend)
runs completely unmodified against a real GPU instead of the simulator.

Requires the optional `nvidia-ml-py` package and an NVIDIA driver:

    pip install nvidia-ml-py

`pynvml` is imported lazily inside `NvmlGpuCollector.__init__` so the rest
of the app has zero real-hardware dependencies unless you explicitly opt
into `TELEMETRY_MODE=nvml` (see `app/api/main.py`).

Two fields have no clean NVML equivalent and are left as documented
approximations rather than guessed at:

- `hangFlag`: NVML has no "kernel is stuck" signal. A real deployment
  should source this from a job-level watchdog/heartbeat instead (e.g.
  the training framework's own liveness check), not from GPU telemetry
  alone \u2014 this collector always reports 0.
- `throttleReason`: NVML's bitmask (see `_THROTTLE_PRIORITY` below) has no
  bit that cleanly maps to this project's "reliability_voltage" category,
  so that category is only ever emitted by the synthetic simulator, never
  by real hardware here.
"""

from __future__ import annotations

# NVML clock-throttle-reason bitmask values. Stable across driver versions
# (see NVIDIA's nvml.h, the "nvmlClocksThrottleReasons" / newer
# "nvmlClocksEventReasons" API group).
_REASON_GPU_IDLE = 0x1
_REASON_APP_CLOCKS = 0x2
_REASON_SW_POWER_CAP = 0x4
_REASON_HW_SLOWDOWN = 0x8
_REASON_SYNC_BOOST = 0x10
_REASON_SW_THERMAL = 0x20
_REASON_HW_THERMAL = 0x40
_REASON_HW_POWER_BRAKE = 0x80
_REASON_DISPLAY_CLOCK = 0x100

# Highest-signal reason wins when multiple bits are set. Administrative
# reasons (idle, app-clocks setting, sync boost, display clock) aren't
# fault signals, so they're intentionally absent here and fall through to
# "none".
_THROTTLE_PRIORITY: list[tuple[int, str]] = [
    (_REASON_HW_THERMAL, "thermal"),
    (_REASON_SW_THERMAL, "thermal"),
    (_REASON_HW_POWER_BRAKE, "power_cap"),
    (_REASON_SW_POWER_CAP, "power_cap"),
    (_REASON_HW_SLOWDOWN, "hw_slowdown"),
]


def map_throttle_reasons(bitmask: int) -> str:
    """Best-effort mapping from NVML's throttle-reason bitmask to this
    project's `ThrottleReason` categories (see `frontend/src/types.ts`).
    """
    for bit, reason in _THROTTLE_PRIORITY:
        if bitmask & bit:
            return reason
    return "none"


class NvmlGpuCollector:
    """Polls every GPU visible to this host via NVML and returns metric
    dicts matching `FIELDS_BY_COMPONENT["gpu"]` in `app/classifier/features.py`.
    """

    def __init__(self) -> None:
        try:
            import pynvml
        except ImportError as exc:
            raise RuntimeError(
                "TELEMETRY_MODE=nvml requires the 'nvidia-ml-py' package and an "
                "NVIDIA driver. Install it with `pip install nvidia-ml-py`, or "
                "unset TELEMETRY_MODE (or set it to 'simulated') to use the "
                "built-in simulator instead."
            ) from exc

        self._pynvml = pynvml
        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        self._handles = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(count)]
        # Per-GPU scratch state for turning NVML's cumulative ECC counters
        # into a per-tick rate, mirroring the `state` dict convention used
        # throughout app/simulator/telemetry.py.
        self._state: dict[int, dict] = {i: {} for i in range(count)}

        # Xid errors surface as async events, not a pollable gauge, so we
        # register an event set once and drain it (non-blocking) every tick.
        self._event_set = None
        try:
            event_set = pynvml.nvmlEventSetCreate()
            for handle in self._handles:
                pynvml.nvmlDeviceRegisterEvents(handle, pynvml.nvmlEventTypeXidCriticalError, event_set)
            self._event_set = event_set
        except Exception:
            self._event_set = None

    @property
    def device_count(self) -> int:
        return len(self._handles)

    def _drain_xid_events(self) -> dict[int, bool]:
        flags = {i: False for i in range(len(self._handles))}
        if self._event_set is None:
            return flags
        pynvml = self._pynvml
        try:
            while True:
                data = pynvml.nvmlEventSetWait(self._event_set, 0)
                idx = pynvml.nvmlDeviceGetIndex(data.device)
                flags[idx] = True
        except pynvml.NVMLError_Timeout:
            pass
        except Exception:
            pass
        return flags

    def poll(self) -> dict[str, dict]:
        """Returns `{gpu_index_as_str: metrics}` for every locally visible GPU."""
        pynvml = self._pynvml
        xid_flags = self._drain_xid_events()
        out: dict[str, dict] = {}

        for i, handle in enumerate(self._handles):
            state = self._state[i]
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            temp_c = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            power_w = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
            clock_mhz = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_SM)

            try:
                sbe = pynvml.nvmlDeviceGetTotalEccErrors(
                    handle, pynvml.NVML_MEMORY_ERROR_TYPE_CORRECTED, pynvml.NVML_AGGREGATE_ECC
                )
                dbe = pynvml.nvmlDeviceGetTotalEccErrors(
                    handle, pynvml.NVML_MEMORY_ERROR_TYPE_UNCORRECTED, pynvml.NVML_AGGREGATE_ECC
                )
            except pynvml.NVMLError:
                sbe, dbe = 0, 0

            # NVML only exposes lifetime counters, not a rate; approximate
            # "this tick's new events" as the delta since the last poll
            # (first poll reports 0 rather than the full lifetime count).
            sbe_rate = max(0, sbe - state.get("prevSbe", sbe))
            dbe_rate = max(0, dbe - state.get("prevDbe", dbe))
            state["prevSbe"], state["prevDbe"] = sbe, dbe

            try:
                retired = len(
                    pynvml.nvmlDeviceGetRetiredPages(
                        handle, pynvml.NVML_PAGE_RETIREMENT_CAUSE_MULTIPLE_SINGLE_BIT_ECC_ERRORS
                    )
                ) + len(
                    pynvml.nvmlDeviceGetRetiredPages(handle, pynvml.NVML_PAGE_RETIREMENT_CAUSE_DOUBLE_BIT_ECC_ERROR)
                )
            except pynvml.NVMLError:
                retired = 0

            try:
                reasons = int(pynvml.nvmlDeviceGetCurrentClocksThrottleReasons(handle))
            except pynvml.NVMLError:
                reasons = 0

            out[str(i)] = {
                "smUtil": round(float(util.gpu), 2),
                "memUtil": round(float(util.memory), 2),
                "tempC": round(float(temp_c), 2),
                "powerW": round(float(power_w), 2),
                "clockMhz": round(float(clock_mhz), 1),
                "eccSbeRate": round(float(sbe_rate), 3),
                "eccDbeRate": round(float(dbe_rate), 3),
                "xidFlag": int(xid_flags.get(i, False)),
                "hangFlag": 0,
                "eccSbeCount": int(sbe),
                "eccDbeCount": int(dbe),
                "retiredPagesCount": int(retired),
                "throttleReason": map_throttle_reasons(reasons),
            }
        return out

    def shutdown(self) -> None:
        try:
            self._pynvml.nvmlShutdown()
        except Exception:
            pass
