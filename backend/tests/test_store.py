from pathlib import Path

from app.store.db import FaultStore


def test_open_fault_persists_layer(tmp_path: Path):
    db_path = tmp_path / "faults.db"
    store = FaultStore(db_path=db_path)
    row = store.open_fault(
        fault_id="nvlink_degradation",
        component_type="nvlink",
        component_key="n0-nvl-0-1",
        node=0,
        severity="warning",
        layer="data_link",
        confidence=0.8,
    )
    assert row.layer == "data_link"
    listed = store.list_faults()
    assert listed[0].to_dict()["layer"] == "data_link"
