"""ML fault classifier suite.

Internally this trains one RandomForest pipeline per component type
(gpu / nvlink / pcie / network / nccl), since each type has its own
metric schema and fault vocabulary. From the outside it behaves as a
single classifier: `predict(component_type, window)` returns the most
likely fault (or "healthy") plus a confidence score.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.classifier.features import extract_features, feature_names

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = MODEL_DIR / "fault_classifier.joblib"
METADATA_PATH = MODEL_DIR / "fault_classifier_metadata.json"


@dataclass
class PredictionResult:
    fault_id: str
    confidence: float
    probabilities: dict = field(default_factory=dict)


class FaultClassifierSuite:
    def __init__(self):
        self.pipelines: dict[str, Pipeline] = {}
        self.metadata: dict = {}

    def build_pipeline(self) -> Pipeline:
        return Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=300,
                        max_depth=14,
                        min_samples_leaf=2,
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=42,
                    ),
                ),
            ]
        )

    def fit(self, component_type: str, X: np.ndarray, y: list[str]) -> Pipeline:
        pipe = self.build_pipeline()
        pipe.fit(X, y)
        self.pipelines[component_type] = pipe
        return pipe

    def predict(self, component_type: str, window: list[dict]) -> PredictionResult:
        pipe = self.pipelines.get(component_type)
        if pipe is None:
            return PredictionResult(fault_id="healthy", confidence=1.0)

        x = extract_features(component_type, window).reshape(1, -1)
        proba = pipe.predict_proba(x)[0]
        classes = pipe.classes_
        idx = int(np.argmax(proba))
        probs = {cls: float(p) for cls, p in zip(classes, proba)}
        return PredictionResult(
            fault_id=str(classes[idx]), confidence=float(proba[idx]), probabilities=probs
        )

    def save(self, path: Path = MODEL_PATH, metadata_path: Path = METADATA_PATH) -> None:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.pipelines, path)
        metadata = dict(self.metadata)
        metadata["savedAt"] = datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata, indent=2))

    @classmethod
    def load(cls, path: Path = MODEL_PATH, metadata_path: Path = METADATA_PATH) -> "FaultClassifierSuite":
        suite = cls()
        suite.pipelines = joblib.load(path)
        if metadata_path.exists():
            suite.metadata = json.loads(metadata_path.read_text())
        return suite

    @staticmethod
    def exists(path: Path = MODEL_PATH) -> bool:
        return path.exists()
