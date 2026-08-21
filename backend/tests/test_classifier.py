import numpy as np

from app.classifier.features import extract_features, feature_names
from app.classifier.labels import HEALTHY
from app.classifier.model import FaultClassifierSuite
from app.simulator.telemetry import TICK_FUNCS


def test_feature_vector_length_matches_names():
    rng = np.random.default_rng(0)
    window = [TICK_FUNCS["gpu"](rng, HEALTHY, 0.0) for _ in range(20)]
    feats = extract_features("gpu", window)
    names = feature_names("gpu")
    assert feats.shape[0] == len(names)


def test_classifier_suite_predicts_healthy_by_default():
    suite = FaultClassifierSuite()
    rng = np.random.default_rng(0)
    window = [TICK_FUNCS["gpu"](rng, HEALTHY, 0.0) for _ in range(20)]
    result = suite.predict("gpu", window)
    assert result.fault_id == HEALTHY


def test_trained_model_predicts_thermal_throttle_clearly():
    suite = FaultClassifierSuite()
    rng = np.random.default_rng(42)

    X, y = [], []
    for fault_id in ["healthy", "thermal_throttle"]:
        for _ in range(80):
            intensity = 0.0 if fault_id == "healthy" else 0.9
            window = [TICK_FUNCS["gpu"](rng, fault_id, intensity) for _ in range(20)]
            X.append(extract_features("gpu", window))
            y.append(fault_id)
    suite.fit("gpu", np.vstack(X), y)

    hot_window = [TICK_FUNCS["gpu"](rng, "thermal_throttle", 0.95) for _ in range(20)]
    result = suite.predict("gpu", hot_window)
    assert result.fault_id == "thermal_throttle"
    assert result.confidence > 0.7
