import { Counter, Gauge } from "prom-client";
import { registry } from "./metrics.client";

/**
 * Metric ghi hình cuộc họp (p2-06 be.md §9, p2-07 be.md §8 dashboard/cảnh báo) — đăng ký vào `registry` chung nhưng khai ở file riêng như
 * `call.metrics.ts`. KHÔNG gắn meetingId/userId/workspaceId (nhãn ít giá trị).
 */

/** Tổng dung lượng bản ghi READY chưa xoá (byte) — cập nhật bởi cron `recording.retention-cleanup` và mỗi lần import/xoá xong. */
export const recordingStorageBytes = new Gauge({
  name: "recording_storage_bytes",
  help: "Tổng dung lượng các bản ghi hình họp đang lưu (READY, chưa xoá)",
  registers: [registry],
});

/** Kết thúc egress theo trạng thái: `started` | `complete` | `failed` (kể cả ABORTED/LIMIT_REACHED không có tệp). */
export const recordingEgressTotal = new Counter({
  name: "recording_egress_total",
  help: "Số egress ghi hình họp, gộp theo trạng thái",
  labelNames: ["status"] as const,
  registers: [registry],
});
