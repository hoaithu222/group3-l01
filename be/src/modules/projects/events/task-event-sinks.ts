import { logger } from "../../../infrastructure/logger";
import type { TaskEventPayload } from "./project-events";

/**
 * Điểm cắm cho consumer của sự kiện Task (fan-out một-nguồn-nhiều-đích). Sink chạy trong job `task.events`
 * (queue `notifications`, retry của BullMQ) ⇒ PHẢI idempotent theo `taskId` + `completionCount`/`dueVersion` trong
 * payload. `jobId` = `dedupeKey` outbox đã thế `:` → `_` (`toSafeJobId`), chỉ để log/dựng jobId dẫn xuất.
 * Phase 3: rỗng — p3-03/p4-03/p4-04/p4-06/p6-06 đăng ký sink lúc import file job của họ (side-effect).
 */
export type TaskEventSink = (payload: TaskEventPayload, jobId: string) => Promise<void>;

const sinks = new Map<string, TaskEventSink>();

export function registerTaskEventSink(name: string, sink: TaskEventSink): void {
  sinks.set(name, sink);
}

/** Chỉ dùng trong test. */
export function clearTaskEventSinks(): void {
  sinks.clear();
}

/** Chạy mọi sink (không dừng ở lỗi đầu tiên) rồi ném lỗi gộp để BullMQ retry (sink thành công chạy lại vô hại). */
export async function dispatchTaskEvent(payload: TaskEventPayload, jobId: string): Promise<void> {
  if (sinks.size === 0) {
    logger.debug("[task.events] chưa có sink nào, bỏ qua", { event: payload.event, jobId });
    return;
  }
  const entries = [...sinks.entries()];
  const results = await Promise.allSettled(entries.map(([, sink]) => sink(payload, jobId)));
  const failed = entries.flatMap(([name], i) => (results[i].status === "rejected" ? [name] : []));
  if (failed.length > 0) throw new Error(`task.events: sink lỗi: ${failed.join(", ")} (${payload.event}, ${jobId})`);
}
