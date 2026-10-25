import { Counter, Gauge, Histogram } from "prom-client";
import { registry } from "./metrics.client";

/**
 * Metric cuộc gọi/họp (p2-01 be.md §9) — đăng ký vào `registry` chung (`metrics.client.ts`), nhưng khai ở file riêng
 * để không làm phình file dùng chung. Nhãn ít giá trị (mode/result/reason) — KHÔNG gắn callId/userId.
 */

/** Lượt thiết lập cuộc gọi: `result` = created | joined | busy | replay | rejected. */
export const callSetupTotal = new Counter({
  name: "call_setup_total",
  help: "Số lượt thiết lập cuộc gọi, gộp theo mode và kết quả",
  labelNames: ["mode", "result"] as const,
  registers: [registry],
});

/** Số cuộc gọi đang diễn ra (RINGING/ACTIVE) — cập nhật mỗi lượt recovery. */
export const callActive = new Gauge({
  name: "call_active",
  help: "Số cuộc gọi chưa kết thúc theo mode",
  labelNames: ["mode"] as const,
  registers: [registry],
});

/** Thời gian từ lúc đổ chuông tới lúc có người trả lời (giây). */
export const callRingToAnswerSeconds = new Histogram({
  name: "call_ring_to_answer_seconds",
  help: "Thời gian từ đổ chuông tới trả lời (giây)",
  buckets: [1, 3, 5, 10, 20, 30, 45, 60],
  registers: [registry],
});

/** Cuộc gọi kết thúc theo lý do (`CallEndReason`). */
export const callEndTotal = new Counter({
  name: "call_end_total",
  help: "Số cuộc gọi kết thúc, gộp theo lý do",
  labelNames: ["reason"] as const,
  registers: [registry],
});

/** Số lần reconcile phải sửa trạng thái participant so với LiveKit. */
export const callReconcileCorrectionsTotal = new Counter({
  name: "call_reconcile_corrections_total",
  help: "Số lần đối soát LiveKit làm thay đổi trạng thái participant",
  registers: [registry],
});

/** Tin tóm tắt cuộc gọi bị gọi lại nhiều lần (đã có tin — bỏ qua nhờ dedupeKey). */
export const callSummaryDuplicatesTotal = new Counter({
  name: "call_summary_duplicates_total",
  help: "Số lần job tóm tắt gặp tin đã tồn tại",
  registers: [registry],
});
