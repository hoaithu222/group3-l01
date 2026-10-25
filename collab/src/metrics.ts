import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { ALL_KINDS } from "./resource-kinds";

/** Số đo Prometheus của collab — mỗi server tự có `Registry` riêng (test dựng nhiều server trong một tiến trình). */
export interface CollabMetrics {
  registry: Registry;
  authTotal: Counter<"result">;
  storeTotal: Counter<"kind" | "result">;
  storeDuration: Histogram<"kind" | "result">;
  kicksTotal: Counter<"reason">;
  updatesTotal: Counter<"kind">;
  awarenessDropped: Counter<"kind">;
  beDuration: Histogram<"op" | "status">;
  beUnavailableTotal: Counter<"op">;
  pendingLost: Counter;
  connections: Gauge<"kind">;
  documentsOpen: Gauge<"kind">;
  pendingStates: Gauge;
}

export interface MetricsSources {
  connectionsByKind(): Record<string, number>;
  documentsByKind(): Record<string, number>;
  pendingCount(): number;
}

export function createMetrics(sources: MetricsSources, withDefaults = true): CollabMetrics {
  const registry = new Registry();
  if (withDefaults) collectDefaultMetrics({ register: registry, prefix: "collab_process_" });

  const gaugeByKind = (name: string, help: string, read: () => Record<string, number>): Gauge<"kind"> =>
    new Gauge({
      name,
      help,
      labelNames: ["kind"],
      registers: [registry],
      collect() {
        const values = read();
        for (const kind of ALL_KINDS) this.set({ kind }, values[kind] ?? 0);
      },
    });

  return {
    registry,
    authTotal: new Counter({ name: "collab_auth_total", help: "Kết quả xác thực kết nối", labelNames: ["result"], registers: [registry] }),
    storeTotal: new Counter({ name: "collab_store_total", help: "Lượt lưu state về BE", labelNames: ["kind", "result"], registers: [registry] }),
    storeDuration: new Histogram({
      name: "collab_store_duration_seconds",
      help: "Thời gian lưu state về BE",
      labelNames: ["kind", "result"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [registry],
    }),
    kicksTotal: new Counter({ name: "collab_kicks_total", help: "Kết nối bị đóng do thu hồi quyền/lưu trữ", labelNames: ["reason"], registers: [registry] }),
    updatesTotal: new Counter({ name: "collab_updates_total", help: "Số update Yjs nhận từ client", labelNames: ["kind"], registers: [registry] }),
    awarenessDropped: new Counter({
      name: "collab_awareness_dropped_total",
      help: "Tin awareness bị bỏ vì vượt trần tần suất của loại tài nguyên (WB_AWARENESS_MAX_HZ)",
      labelNames: ["kind"],
      registers: [registry],
    }),
    beDuration: new Histogram({
      name: "collab_be_request_duration_seconds",
      help: "Thời gian gọi BE nội bộ",
      labelNames: ["op", "status"],
      buckets: [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [registry],
    }),
    beUnavailableTotal: new Counter({ name: "collab_be_unavailable_total", help: "Lần BE không phản hồi/5xx sau khi thử lại", labelNames: ["op"], registers: [registry] }),
    pendingLost: new Counter({ name: "collab_pending_lost_total", help: "Document bị bỏ khỏi hàng chờ lưu vì vượt PENDING_MAX_DOCS", registers: [registry] }),
    connections: gaugeByKind("collab_connections", "Kết nối tài liệu đang mở", sources.connectionsByKind),
    documentsOpen: gaugeByKind("collab_documents_open", "Document đang mở trong RAM", sources.documentsByKind),
    pendingStates: new Gauge({
      name: "collab_pending_states",
      help: "Document đang giữ state chưa lưu được về BE",
      registers: [registry],
      collect() {
        this.set(sources.pendingCount());
      },
    }),
  };
}
