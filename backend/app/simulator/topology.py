"""Static description of the emulated GPU cluster topology.

Layout: N_NODES nodes, each with GPUS_PER_NODE GPUs fully connected via
NVLink (NVSwitch-style all-to-all within a node) and each GPU attached to
the host via a PCIe link. Nodes are connected to each other through a
RoCE/InfiniBand fabric (modeled as one logical inter-node link per node
pair, aggregated to keep the topology simple but representative).
"""

from dataclasses import dataclass, field

N_NODES = 4
GPUS_PER_NODE = 4

NVLINK_PEAK_GBPS = 300.0  # aggregate bidirectional NVLink bandwidth per pair
PCIE_PEAK_GBPS = 63.0  # PCIe Gen4 x16 approx unidirectional
NETWORK_PEAK_GBPS = 200.0  # 200G IB/RoCE NIC per node


@dataclass(frozen=True)
class GpuId:
    node: int
    gpu: int

    @property
    def key(self) -> str:
        return f"n{self.node}g{self.gpu}"


@dataclass(frozen=True)
class NvLinkId:
    node: int
    gpu_a: int
    gpu_b: int

    @property
    def key(self) -> str:
        return f"n{self.node}-nvl-{self.gpu_a}-{self.gpu_b}"


@dataclass(frozen=True)
class PcieId:
    node: int
    gpu: int

    @property
    def key(self) -> str:
        return f"n{self.node}-pcie-{self.gpu}"


@dataclass(frozen=True)
class NetworkLinkId:
    node_a: int
    node_b: int

    @property
    def key(self) -> str:
        return f"net-{self.node_a}-{self.node_b}"


@dataclass
class Topology:
    n_nodes: int = N_NODES
    gpus_per_node: int = GPUS_PER_NODE

    gpus: list[GpuId] = field(default_factory=list)
    nvlinks: list[NvLinkId] = field(default_factory=list)
    pcie_links: list[PcieId] = field(default_factory=list)
    network_links: list[NetworkLinkId] = field(default_factory=list)

    def __post_init__(self):
        self.gpus = [
            GpuId(node=n, gpu=g)
            for n in range(self.n_nodes)
            for g in range(self.gpus_per_node)
        ]
        self.pcie_links = [
            PcieId(node=n, gpu=g)
            for n in range(self.n_nodes)
            for g in range(self.gpus_per_node)
        ]
        self.nvlinks = [
            NvLinkId(node=n, gpu_a=a, gpu_b=b)
            for n in range(self.n_nodes)
            for a in range(self.gpus_per_node)
            for b in range(a + 1, self.gpus_per_node)
        ]
        self.network_links = [
            NetworkLinkId(node_a=a, node_b=b)
            for a in range(self.n_nodes)
            for b in range(a + 1, self.n_nodes)
        ]

    def to_dict(self) -> dict:
        return {
            "nNodes": self.n_nodes,
            "gpusPerNode": self.gpus_per_node,
            "gpus": [{"id": g.key, "node": g.node, "gpu": g.gpu} for g in self.gpus],
            "nvlinks": [
                {"id": l.key, "node": l.node, "gpuA": l.gpu_a, "gpuB": l.gpu_b}
                for l in self.nvlinks
            ],
            "pcieLinks": [
                {"id": p.key, "node": p.node, "gpu": p.gpu} for p in self.pcie_links
            ],
            "networkLinks": [
                {"id": nl.key, "nodeA": nl.node_a, "nodeB": nl.node_b}
                for nl in self.network_links
            ],
            "peaks": {
                "nvlinkGbps": NVLINK_PEAK_GBPS,
                "pcieGbps": PCIE_PEAK_GBPS,
                "networkGbps": NETWORK_PEAK_GBPS,
            },
        }


DEFAULT_TOPOLOGY = Topology()
