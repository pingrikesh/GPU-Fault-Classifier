"""Feature extraction: turns a rolling window of raw telemetry ticks for
one component into a fixed-length numeric feature vector.

For every raw metric field we compute six summary statistics over the
window (mean, std, min, max, last value, and linear slope). This keeps
the classifier robust to onset / peak / decay phases of a fault, since
the shape of the trend within the window carries as much signal as the
instantaneous values.
"""

from __future__ import annotations

import numpy as np

# throttleReason is a string enum in raw telemetry; encode it to an ordinal
# so it can flow through the same numeric feature pipeline as everything
# else. "none" -> 0 keeps the healthy baseline at the natural origin.
THROTTLE_REASON_CODES: dict[str, int] = {
    "none": 0,
    "thermal": 1,
    "power_cap": 2,
    "reliability_voltage": 3,
    "sw_slowdown": 4,
    "hw_slowdown": 5,
}

FIELDS_BY_COMPONENT: dict[str, list[str]] = {
    "gpu": [
        "smUtil",
        "memUtil",
        "tempC",
        "powerW",
        "clockMhz",
        "eccSbeRate",
        "eccDbeRate",
        "xidFlag",
        "hangFlag",
        "eccSbeCount",
        "eccDbeCount",
        "retiredPagesCount",
        "throttleReason",
    ],
    "nvlink": [
        "linkUp",
        "txGbps",
        "utilPct",
        "crcErrRate",
        "replayRate",
        "activeLaneCount",
        "expectedLaneCount",
        "crcErrorCount",
        "replayCount",
        "recoveryCount",
    ],
    "pcie": [
        "genCurrent",
        "widthCurrent",
        "txGbps",
        "utilPct",
        "correctableErrRate",
        "uncorrectableErrRate",
    ],
    "network": [
        "linkUp",
        "bwGbps",
        "utilPct",
        "latencyUs",
        "packetLossPct",
        "retransmitRate",
    ],
    "nccl": ["computeMs", "commMs", "allreduceMs", "stragglerScore", "timeoutFlag"],
}

STAT_NAMES = ["mean", "std", "min", "max", "last", "slope"]


def _slope(y: np.ndarray) -> float:
    if len(y) < 2:
        return 0.0
    x = np.arange(len(y), dtype=float)
    x_mean = x.mean()
    y_mean = y.mean()
    denom = ((x - x_mean) ** 2).sum()
    if denom == 0:
        return 0.0
    return float(((x - x_mean) * (y - y_mean)).sum() / denom)


def feature_names(component_type: str) -> list[str]:
    return [
        f"{field}_{stat}"
        for field in FIELDS_BY_COMPONENT[component_type]
        for stat in STAT_NAMES
    ]


def _numeric(field: str, value) -> float:
    if field == "throttleReason":
        return float(THROTTLE_REASON_CODES.get(str(value), 0))
    return float(value)


def extract_features(component_type: str, window: list[dict]) -> np.ndarray:
    fields = FIELDS_BY_COMPONENT[component_type]
    values = np.array(
        [[_numeric(field, tick.get(field, 0.0)) for field in fields] for tick in window],
        dtype=float,
    )  # shape (window_len, n_fields)

    feats: list[float] = []
    for j in range(len(fields)):
        col = values[:, j]
        feats.extend(
            [
                float(col.mean()),
                float(col.std()),
                float(col.min()),
                float(col.max()),
                float(col[-1]),
                _slope(col),
            ]
        )
    return np.array(feats, dtype=float)
