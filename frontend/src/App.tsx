import { useMemo, useState } from "react";
import { api } from "./lib/api";
import { useFetch } from "./hooks/useFetch";
import { useTelemetryStream } from "./hooks/useTelemetryStream";
import { Header } from "./components/Header";
import { SummaryBar } from "./components/SummaryBar";
import { NodeGrid } from "./components/NodeGrid";
import { NetworkFabric } from "./components/NetworkFabric";
import { DetailPanel } from "./components/DetailPanel";
import { FaultFeed } from "./components/FaultFeed";
import { HistoryView } from "./components/HistoryView";
import { TopologyLegend } from "./components/TopologyLegend";
import { inferComponentType } from "./lib/format";
import { mostUnhealthyKey } from "./lib/health";
import type { TaxonomyEntry } from "./types";

export default function App() {
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [selected, setSelected] = useState<{ key: string; type: string } | null>(null);
  const { data: topology } = useFetch(() => api.topology(), []);
  const { data: taxonomy } = useFetch(() => api.taxonomy(), []);
  const stream = useTelemetryStream();

  const taxonomyById = useMemo(() => {
    const map = new Map<string, TaxonomyEntry>();
    (taxonomy ?? []).forEach((t) => map.set(t.id, t));
    return map;
  }, [taxonomy]);

  const autoKey = useMemo(
    () => mostUnhealthyKey(stream.predictions, taxonomyById),
    [stream.predictions, taxonomyById]
  );
  const isAuto = selected === null && autoKey !== null;
  const inspected = selected ?? (autoKey ? { key: autoKey, type: inferComponentType(autoKey) } : null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header status={stream.status} tab={tab} onTabChange={setTab} />

      {tab === "overview" ? (
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
          <SummaryBar predictions={stream.predictions} taxonomyById={taxonomyById} tick={stream.tick} status={stream.status} />

          {!topology ? (
            <p className="py-20 text-center text-sm text-slate-500">Loading cluster topology…</p>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cluster Topology</h2>
                  <p className="text-xs text-slate-500">NVLink mesh per node · click a GPU or link to inspect</p>
                </div>
                <TopologyLegend />
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[23fr_17fr]">
                <div className="flex min-h-0 min-w-0 gap-4">
                  <NetworkFabric
                    className="h-full min-w-0 flex-[7.5]"
                    topology={topology}
                    predictions={stream.predictions}
                    taxonomyById={taxonomyById}
                    selected={selected?.key ?? null}
                    onSelect={(key, type) => setSelected({ key, type })}
                  />
                  <NodeGrid
                    className="min-w-0 flex-[15.5]"
                    topology={topology}
                    predictions={stream.predictions}
                    taxonomyById={taxonomyById}
                    metrics={stream.metrics}
                    selected={selected?.key ?? null}
                    onSelect={(key, type) => setSelected({ key, type })}
                  />
                </div>

                <div className="flex min-h-0 min-w-0 gap-4">
                  <DetailPanel
                    className="h-full min-h-0 min-w-0 flex-[10]"
                    componentKey={inspected?.key ?? null}
                    componentType={inspected?.type ?? null}
                    predictions={stream.predictions}
                    taxonomyById={taxonomyById}
                    history={stream.history}
                    isAuto={isAuto}
                  />
                  <FaultFeed
                    className="h-full min-h-0 min-w-0 flex-[7]"
                    feed={stream.feed}
                    taxonomyById={taxonomyById}
                  />
                </div>
              </div>
            </section>
          )}
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <HistoryView taxonomyById={taxonomyById} />
        </main>
      )}

      <footer className="w-full shrink-0 px-4 pb-2 pt-1 text-center text-[11px] text-slate-600 sm:px-6 lg:px-8">
        Emulated cluster · {topology ? `${topology.nNodes} nodes × ${topology.gpusPerNode} GPUs` : ""} · synthetic telemetry for training & demonstration
      </footer>
    </div>
  );
}
