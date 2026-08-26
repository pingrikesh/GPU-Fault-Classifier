import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
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
import { InfoPopover } from "./components/InfoPopover";
import { Card } from "./components/common";
import { ErrorState, OverviewSkeleton, StatusBanner } from "./components/Status";
import { inferComponentType } from "./lib/format";
import { mostUnhealthyKey } from "./lib/health";
import type { TaxonomyEntry } from "./types";

function useTimedOut(active: boolean, ms: number) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!active) {
      setTimedOut(false);
      return;
    }
    const id = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return timedOut;
}

export default function App() {
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [selected, setSelected] = useState<{ key: string; type: string } | null>(null);
  const topologyQuery = useFetch(() => api.topology(), []);
  const taxonomyQuery = useFetch(() => api.taxonomy(), []);
  const stream = useTelemetryStream();

  const topology = topologyQuery.data;
  const taxonomy = taxonomyQuery.data;

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

  const hasLive = Object.keys(stream.predictions).length > 0;
  const awaitingLive = !hasLive;
  const liveTimedOut = useTimedOut(awaitingLive, 8000);
  const dashboardLoading = topologyQuery.loading && !topology;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header status={stream.status} tab={tab} onTabChange={setTab} />

      {tab === "overview" ? (
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
          {topologyQuery.error && !topology ? (
            <Card className="flex min-h-0 flex-1 items-center justify-center">
              <ErrorState
                title="Couldn't load the cluster map"
                message={topologyQuery.error}
                onRetry={topologyQuery.refetch}
              />
            </Card>
          ) : liveTimedOut && awaitingLive ? (
            <Card className="flex min-h-0 flex-1 items-center justify-center">
              <ErrorState
                title="Live telemetry is unavailable"
                message="The dashboard couldn't open a live connection to the backend. Confirm the API is running, then reconnect. The app will keep retrying in the background."
                onRetry={() => {
                  topologyQuery.refetch();
                  stream.reconnect();
                }}
                retryLabel="Reconnect"
              />
            </Card>
          ) : dashboardLoading || awaitingLive ? (
            <OverviewSkeleton />
          ) : topology ? (
            <>
              {taxonomyQuery.error && (
                <StatusBanner
                  tone="warning"
                  title="Fault names may be incomplete"
                  message={taxonomyQuery.error}
                  action={
                    <button
                      type="button"
                      onClick={taxonomyQuery.refetch}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-current/30 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <RefreshCw size={11} /> Retry
                    </button>
                  }
                />
              )}
              {hasLive && stream.status !== "open" && (
                <StatusBanner
                  tone="warning"
                  title={stream.status === "connecting" ? "Reconnecting to live telemetry…" : "Live stream dropped"}
                  message="The last received snapshot is still on screen. New faults will appear once the connection recovers."
                  action={
                    stream.status === "closed" ? (
                      <button
                        type="button"
                        onClick={stream.reconnect}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-current/30 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <RefreshCw size={11} /> Reconnect
                      </button>
                    ) : undefined
                  }
                />
              )}

              <SummaryBar
                predictions={stream.predictions}
                taxonomyById={taxonomyById}
                tick={stream.tick}
                status={stream.status}
              />

              <section className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cluster Topology</h2>
                      <InfoPopover glossaryKey="clusterTopology" />
                    </div>
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
                      streamStatus={stream.status}
                    />
                    <FaultFeed
                      className="h-full min-h-0 min-w-0 flex-[7]"
                      feed={stream.feed}
                      taxonomyById={taxonomyById}
                      streamStatus={stream.status}
                    />
                  </div>
                </div>
              </section>
            </>
          ) : (
            <Card className="flex min-h-0 flex-1 items-center justify-center">
              <ErrorState
                title="Nothing to display"
                message="The cluster map and live stream both failed to load."
                onRetry={() => {
                  topologyQuery.refetch();
                  stream.reconnect();
                }}
              />
            </Card>
          )}
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <HistoryView taxonomyById={taxonomyById} />
        </main>
      )}

      <footer className="w-full shrink-0 px-4 pb-2 pt-1 text-center text-[11px] text-slate-600 sm:px-6 lg:px-8">
        Emulated cluster
        {topology ? ` · ${topology.nNodes} nodes × ${topology.gpusPerNode} GPUs` : topologyQuery.loading ? " · loading topology…" : ""}
        {" · "}
        synthetic telemetry for training & demonstration
      </footer>
    </div>
  );
}
