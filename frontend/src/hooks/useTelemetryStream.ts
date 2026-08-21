import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../lib/api";
import type { ComponentMetrics, FaultEvent, Prediction, TickPayload } from "../types";

export type ConnectionStatus = "connecting" | "open" | "closed";

const HISTORY_LEN = 40;
const FEED_LEN = 60;

export interface LiveFeedItem extends FaultEvent {
  key: string;
  at: number;
}

export interface TelemetryState {
  status: ConnectionStatus;
  tick: number;
  metrics: Record<string, ComponentMetrics>;
  predictions: Record<string, Prediction>;
  history: Record<string, ComponentMetrics[]>;
  feed: LiveFeedItem[];
}

export function useTelemetryStream(): TelemetryState {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [tick, setTick] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, ComponentMetrics>>({});
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [feed, setFeed] = useState<LiveFeedItem[]>([]);
  const [history, setHistory] = useState<Record<string, ComponentMetrics[]>>({});
  const feedCounter = useRef(0);

  useEffect(() => {
    let closedByUs = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      setStatus("connecting");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => setStatus("open");

      ws.onmessage = (ev) => {
        try {
          const payload: TickPayload = JSON.parse(ev.data);
          setTick(payload.tick);
          setMetrics(payload.metrics);
          setPredictions(payload.predictions);

          setHistory((prev) => {
            const next = { ...prev };
            for (const [key, m] of Object.entries(payload.metrics)) {
              const arr = [...(prev[key] ?? []), m];
              next[key] = arr.length > HISTORY_LEN ? arr.slice(arr.length - HISTORY_LEN) : arr;
            }
            return next;
          });

          if (payload.events.length) {
            setFeed((prev) => {
              const items: LiveFeedItem[] = payload.events.map((e) => ({
                ...e,
                key: `${Date.now()}-${feedCounter.current++}`,
                at: Date.now() / 1000,
              }));
              return [...items.reverse(), ...prev].slice(0, FEED_LEN);
            });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setStatus("closed");
        if (!closedByUs) retryTimer = setTimeout(connect, 1500);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();
    return () => {
      closedByUs = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { status, tick, metrics, predictions, history, feed };
}
