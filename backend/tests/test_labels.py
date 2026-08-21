from app.classifier.labels import FAULT_DEFS, Layer


def test_every_fault_def_has_layer():
    for fault in FAULT_DEFS:
        assert fault.layer is not None
        assert isinstance(fault.layer, Layer)


def test_interconnect_layer_mapping():
    by_id = {f.id: f.layer for f in FAULT_DEFS}
    assert by_id["nvlink_degradation"] == Layer.DATA_LINK
    assert by_id["nvlink_flap"] == Layer.DATA_LINK
    assert by_id["pcie_bottleneck"] == Layer.TRANSPORT
    assert by_id["network_congestion"] == Layer.NETWORK
    assert by_id["network_link_down"] == Layer.NETWORK
    assert by_id["nccl_straggler"] == Layer.NCCL
    assert by_id["nccl_timeout"] == Layer.NCCL


def test_gpu_health_layer_mapping():
    gpu_faults = [
        "ecc_uncorrectable",
        "thermal_throttle",
        "power_throttle",
        "xid_driver_error",
        "gpu_hang",
    ]
    by_id = {f.id: f.layer for f in FAULT_DEFS}
    for fault_id in gpu_faults:
        assert by_id[fault_id] == Layer.GPU_HEALTH
