"""Generate a labeled synthetic dataset from the simulator and train the
fault classifier suite.

Run with:
    python -m app.classifier.train
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from app.classifier.features import extract_features, feature_names
from app.classifier.labels import HEALTHY
from app.classifier.model import FaultClassifierSuite, MODEL_DIR
from app.simulator.engine import WINDOW_SIZE
from app.simulator.faults import COMPONENT_FAULT_IDS, intensity_profile
from app.simulator.telemetry import TICK_FUNCS

SAMPLES_PER_CLASS = 260
SEED = 42
STAGES = ["onset", "peak", "decay"]

STAGE_RANGES = {
    "onset": (0.0, 0.35),
    "peak": (0.4, 0.6),
    "decay": (0.75, 1.0),
}


def make_window(component_type: str, fault_id: str, rng: np.random.Generator) -> list[dict]:
    # A fresh cumulative-counter state per generated window/episode, so
    # counters (ECC counts, NVLink CRC/replay/recovery) rise naturally across
    # the window instead of resetting every tick \u2014 matching how the live
    # engine accumulates them across a real fault episode.
    state: dict = {}

    if fault_id == HEALTHY:
        return [TICK_FUNCS[component_type](rng, HEALTHY, 0.0, state=state) for _ in range(WINDOW_SIZE)]

    stage = STAGES[rng.integers(0, len(STAGES))]
    lo, hi = STAGE_RANGES[stage]
    fracs = np.linspace(lo, hi, WINDOW_SIZE)
    peak_intensity = float(rng.uniform(0.5, 1.0))
    window = []
    for frac in fracs:
        intensity = intensity_profile(float(frac), peak_intensity)
        window.append(TICK_FUNCS[component_type](rng, fault_id, intensity, state=state))
    return window


def build_dataset(component_type: str, rng: np.random.Generator) -> tuple[np.ndarray, list[str]]:
    X_rows: list[np.ndarray] = []
    y: list[str] = []
    for fault_id in COMPONENT_FAULT_IDS[component_type]:
        for _ in range(SAMPLES_PER_CLASS):
            window = make_window(component_type, fault_id, rng)
            X_rows.append(extract_features(component_type, window))
            y.append(fault_id)
    return np.vstack(X_rows), y


def main() -> None:
    rng = np.random.default_rng(SEED)
    suite = FaultClassifierSuite()
    report: dict = {"componentTypes": {}}
    accuracies: list[float] = []

    for component_type in COMPONENT_FAULT_IDS:
        X, y = build_dataset(component_type, rng)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=SEED, stratify=y
        )
        pipe = suite.fit(component_type, X_train, y_train)
        y_pred = pipe.predict(X_test)

        acc = accuracy_score(y_test, y_pred)
        accuracies.append(acc)
        cls_report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
        labels_sorted = sorted(set(y_test) | set(y_pred))
        cm = confusion_matrix(y_test, y_pred, labels=labels_sorted).tolist()

        importances = pipe.named_steps["clf"].feature_importances_
        names = feature_names(component_type)
        feature_importances = sorted(
            [{"feature": n, "importance": float(v)} for n, v in zip(names, importances)],
            key=lambda x: -x["importance"],
        )

        report["componentTypes"][component_type] = {
            "accuracy": acc,
            "classes": labels_sorted,
            "confusionMatrix": cm,
            "classificationReport": cls_report,
            "featureImportances": feature_importances[:15],
            "nTrain": len(y_train),
            "nTest": len(y_test),
        }
        print(f"[{component_type}] accuracy={acc:.4f} classes={labels_sorted}")
        print(f"  top features: {[f['feature'] for f in feature_importances[:5]]}")

    report["overallAccuracy"] = float(np.mean(accuracies))
    suite.metadata = report
    suite.save()

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    (MODEL_DIR / "training_report.json").write_text(json.dumps(report, indent=2))
    print(f"\nOverall mean accuracy across component types: {report['overallAccuracy']:.4f}")
    print(f"Model saved to {MODEL_DIR}")


if __name__ == "__main__":
    main()
