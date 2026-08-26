export interface GlossaryEntry {
  title: string;
  definition: string;
  whyItMatters: string;
}

export const GLOSSARY = {
  clusterHealth: {
    title: "Cluster Health",
    definition:
      "The share of watched parts (GPUs, cables, and software paths) that currently look normal. 100% means nothing is raising a warning or a critical alert.",
    whyItMatters:
      "Treat this like an overall “is the factory running?” score. When it drops, jobs may slow down or fail even if some GPUs still look fine.",
  },
  criticalFaults: {
    title: "Critical Faults",
    definition:
      "Problems serious enough that they can stop training, crash a job, or risk hardware. These need someone to look now — not later.",
    whyItMatters:
      "Each critical item is a likely outage. A rising count usually means lost GPU hours and delayed model work.",
  },
  warnings: {
    title: "Warnings",
    definition:
      "Parts that are still working, but slower or less reliable than they should be. Jobs may still finish, just not at full speed.",
    whyItMatters:
      "Warnings are early smoke. If they linger, they often become critical and quietly inflate cost per training run.",
  },
  monitoredComponents: {
    title: "Monitored Components",
    definition:
      "How many individual pieces we watch: each GPU, each high-speed GPU-to-GPU cable (NVLink), each PCIe path, each network link between machines, and each collective-communication path (NCCL).",
    whyItMatters:
      "A bigger number is inventory size, not a problem. It tells you the scope of what this dashboard can catch.",
  },
  simulationUptime: {
    title: "Simulation Uptime",
    definition:
      "How long this demo cluster has been running in the current session. This is a simulated environment used for training and demonstration, not a production SLA clock.",
    whyItMatters:
      "Use it to know how much history you are looking at. A short uptime means the trend arrows have not had time to mean much yet.",
  },
  clusterTopology: {
    title: "Cluster Topology",
    definition:
      "A map of the GPU machines and how they are wired together. Each node is one server of GPUs; the fabric on the left is how those servers talk across the room.",
    whyItMatters:
      "Color and icons show where a problem sits. Click a GPU or a line to open its live readings on the right.",
  },
  interNodeFabric: {
    title: "Inter-Node Fabric",
    definition:
      "The network that lets GPUs on different machines share work. Spine is the backbone (like a building’s main switch); leaf switches sit closer to each pair of servers; circles at the bottom are the servers themselves.",
    whyItMatters:
      "If this path is unhealthy, GPUs cannot cooperate across machines. Distributed training then waits, even when every GPU chip is healthy.",
  },
  nodeCard: {
    title: "Node",
    definition:
      "One physical server full of GPUs. Circles are GPUs. Lines between them are NVLink — a very fast private highway between GPUs in the same box. A dashed yellow ring around a GPU is the PCIe bus, the slower path to the rest of the server.",
    whyItMatters:
      "A red or amber node means something inside that box is degraded. Training that uses those GPUs will be slower or may fail.",
  },
  inspector: {
    title: "Component Inspector",
    definition:
      "Live vital signs for whatever you clicked (or the worst problem, if nothing is selected). Charts are the last few seconds of readings for that part.",
    whyItMatters:
      "This is the “why is it red?” panel. Numbers here explain whether the issue is heat, power, a flaky cable, or software waiting on a slow teammate.",
  },
  classifierConfidence: {
    title: "Classifier Confidence",
    definition:
      "How sure the AI is about the diagnosis, shown as a percentage. It is like a weather forecast: 90% means a strong match to a known problem pattern; 50% means it is guessing among similar symptoms.",
    whyItMatters:
      "High confidence is a good reason to act. Low confidence means treat the label as a hint and look at the charts before paging a team.",
  },
  throttleReason: {
    title: "Throttle Reason",
    definition:
      "Why a GPU is deliberately slowing itself down. Common causes are heat (thermal) or hitting its power budget (power cap). “None” means it is allowed to run at full speed.",
    whyItMatters:
      "Throttling protects the chip but stretches job time. Repeated thermal or power caps usually mean cooling or power provisioning is the bottleneck, not the model.",
  },
  faultFeed: {
    title: "Live Fault Feed",
    definition:
      "A running log of problems the classifier just found or just cleared. Newest events sit at the top. “Unresolved” means the issue is still open.",
    whyItMatters:
      "This is the operations ticker. Executives can scan it for “what broke, where, and did it recover?” without reading charts.",
  },
  faultFrequency: {
    title: "Fault Frequency by Type",
    definition:
      "Which kinds of problems have shown up most since this backend session started. Each bar is a count of episodes, not minutes of downtime.",
    whyItMatters:
      "A tall bar is a repeating pattern. That is more useful for investment (cables, cooling, software) than a one-off incident.",
  },
  classifierAccuracy: {
    title: "Classifier Accuracy",
    definition:
      "How often the AI correctly named a problem in a practice test (held-out synthetic data). It is scored separately for GPUs, NVLink, PCIe, fabric, and NCCL.",
    whyItMatters:
      "This is a quality check on the detector itself, not cluster health. Low accuracy here means more false alarms or missed issues in this demo.",
  },
  faultHistory: {
    title: "Fault Episode History",
    definition:
      "A table of every problem episode: what it was called, which part, how serious, how sure the AI was, whether it is still open, and when it started.",
    whyItMatters:
      "Use this for after-action reviews — what failed, how long it lasted, and whether the same part keeps coming back.",
  },
  gpuTempC: {
    title: "GPU Temperature",
    definition:
      "How hot the GPU chip is, in Celsius. Around 85°C many GPUs start slowing themselves down so they do not overheat.",
    whyItMatters:
      "Hot GPUs finish jobs later and cost more electricity. Persistent heat is a facilities issue (airflow, liquid cooling), not a model bug.",
  },
  gpuSmUtil: {
    title: "SM Utilization",
    definition:
      "How busy the GPU’s compute cores (Streaming Multiprocessors) are. 100% means the chip is fully occupied. Very low during a running job often means the GPU is stuck waiting on data or another GPU.",
    whyItMatters:
      "You pay for GPUs whether they compute or wait. Low utilization during training is wasted capital.",
  },
  gpuPowerW: {
    title: "Power Draw",
    definition:
      "How many watts of electricity this GPU is using right now. Hitting the power cap means it cannot go faster even if work remains.",
    whyItMatters:
      "Power is both a bill and a speed limit. Caps and throttles here show the cluster is energy-bound, not algorithm-bound.",
  },
  gpuEccSbe: {
    title: "ECC Single-Bit Errors",
    definition:
      "Tiny memory “typos” the GPU caught and fixed by itself. Occasional counts are normal. A sudden climb can mean aging or stressed memory.",
    whyItMatters:
      "Correctable errors are an early hardware-wear signal. They rarely crash a job today, but they often precede uncorrectable failures.",
  },
  gpuEccDbe: {
    title: "ECC Double-Bit Errors",
    definition:
      "Memory errors the GPU could not repair. These can crash a job or silently corrupt results.",
    whyItMatters:
      "Treat rising double-bit errors as a replace-the-GPU conversation. They put training correctness at risk.",
  },
  gpuRetiredPages: {
    title: "Retired Pages",
    definition:
      "Bad spots in GPU memory that the chip has permanently taken out of service, like closing off a damaged hotel room.",
    whyItMatters:
      "A growing count is hardware aging. Too many retired pages reduce usable memory and raise the chance of job failure.",
  },
  nvlinkUtil: {
    title: "NVLink Utilization",
    definition:
      "How full the ultra-fast GPU-to-GPU highway inside a server is. High is normal during heavy multi-GPU training; stuck-high with errors is not.",
    whyItMatters:
      "NVLink is how GPUs in the same box share work. Congestion or faults here slow every job that spans those GPUs.",
  },
  nvlinkCrcRate: {
    title: "CRC Error Rate",
    definition:
      "How often a message on the cable arrives garbled and must be checked again. CRC is a “did this arrive intact?” checksum.",
    whyItMatters:
      "A rising rate usually means a flaky cable, connector, or port — not the model. Retries steal training time.",
  },
  nvlinkReplayRate: {
    title: "Replay Rate",
    definition:
      "How often traffic is sent again because the first try did not succeed. Extra replays are wasted trips on the GPU highway.",
    whyItMatters:
      "Replays are the tax you pay for an unreliable link. Persistent replays stretch job duration.",
  },
  nvlinkActiveLanes: {
    title: "Active Lanes",
    definition:
      "How many of the expected parallel “lanes” on an NVLink cable are still working. Fewer lanes means the highway has been narrowed.",
    whyItMatters:
      "Down-trained lanes silently cut bandwidth in half (or worse) with no obvious “link down” alarm. Jobs get slower without a crash.",
  },
  nvlinkCrcCount: {
    title: "CRC Errors (cumulative)",
    definition:
      "Total garbled messages counted since we started watching this link, not just the latest second.",
    whyItMatters:
      "A climbing total over a stable job is a hardware or cabling story, useful for deciding what to reseat or replace.",
  },
  nvlinkReplayCount: {
    title: "Replays (cumulative)",
    definition: "Total times this link had to resend data since the session began.",
    whyItMatters: "Compare against job length: many replays in a short window means the link is costing real GPU hours.",
  },
  nvlinkRecoveryCount: {
    title: "Link Recoveries (cumulative)",
    definition:
      "Times the link had to restart itself after a serious glitch — like rebooting a network port mid-job.",
    whyItMatters:
      "Recoveries are disruptive. Even a few during training can stall collectives and fail checkpoints.",
  },
  pcieUtil: {
    title: "PCIe Utilization",
    definition:
      "How busy the path is between the GPU and the rest of the server (CPU, storage, network cards). PCIe is slower than NVLink.",
    whyItMatters:
      "If this path is saturated or erroring, the GPU starves for data even when its compute cores are ready.",
  },
  pcieUncorrectable: {
    title: "Uncorrectable PCIe Errors",
    definition:
      "Errors on the GPU’s connection to the server that could not be silently fixed. Often a slot, cable, riser, or board issue.",
    whyItMatters:
      "These can freeze or eject a GPU from a job. They are typically hardware, not software, and need a physical look.",
  },
  netLatency: {
    title: "Fabric Latency",
    definition:
      "How long a packet takes to travel between machines, in microseconds (millionths of a second). Lower is better.",
    whyItMatters:
      "Multi-machine training waits on the slowest hop. Extra delay here is idle GPUs you are still paying for.",
  },
  netPacketLoss: {
    title: "Packet Loss",
    definition:
      "The percent of messages between machines that never arrive and must be sent again.",
    whyItMatters:
      "Even a fraction of a percent can stall large training jobs, because thousands of GPUs wait on the missing piece.",
  },
  netUtil: {
    title: "Fabric Utilization",
    definition: "How full the network between machines is. High during all-to-all training is expected; high plus errors is not.",
    whyItMatters:
      "A clogged fabric is a cluster-wide slowdown: every node sharing that path pays the tax.",
  },
  ncclAllreduce: {
    title: "AllReduce Time",
    definition:
      "How long it takes for every GPU in a group to share and combine a result. This is the heartbeat of multi-GPU training.",
    whyItMatters:
      "When AllReduce stretches, the whole job stretches. It is often the first number that shows a network or straggler problem in business terms: “the team meeting is taking longer.”",
  },
  ncclStraggler: {
    title: "Straggler Score",
    definition:
      "Whether one GPU is lagging the others. Training is only as fast as the slowest teammate — like a relay waiting on the last runner.",
    whyItMatters:
      "One sick GPU can idle an entire expensive job. A high score says “find the lagging node,” not “buy more GPUs.”",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
