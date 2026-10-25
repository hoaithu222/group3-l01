import { logger } from "../../../infrastructure/logger";
import { registerJob } from "../../../infrastructure/queue";
import { getCallsContainer } from "../calls.container";
import type { CallEndReasonValue, CallEntity } from "../entities/call.interface";

/**
 * Consumer outbox `call.force-end` (p2-07 be.md §5.3/§7, queue `calls`): admin nền tảng kết thúc CƯỠNG BỨC một cuộc gọi (`POST /admin/calls/:id/force-end`).
 * Việc kết thúc vẫn đi qua ĐIỂM DUY NHẤT `CallEndService.endCall` (khoá `call:lock` + CAS `status != ENDED`, outcome từng người, `call:ended { endReason: FORCE_ENDED }`,
 * nhả Redis, `deleteRoom`) — file này chỉ giải payload và kiểm lại trạng thái (job có thể đến muộn/retry). Audit + lý do do endpoint admin ghi lúc nhận yêu cầu.
 */
export interface CallForceEndPayload {
  callId: string;
  actorId: string;
  reason?: string;
}

export interface CallForceEndPort {
  findCall(callId: string): Promise<Pick<CallEntity, "status" | "scopeType"> | null>;
  endCall(callId: string, reason: CallEndReasonValue, actorId: string | null): Promise<unknown>;
}

export type CallForceEndResult = "ENDED" | "SKIPPED" | "REFUSED_MEETING";

/** Idempotent: đã ENDED/không còn → `SKIPPED`; cuộc gọi của cuộc họp bị từ chối (phải kết thúc qua `Meeting` để `Meeting.status` không lệch) — API đã chặn, đây là lưới thứ hai. */
export async function handleCallForceEnd(p: CallForceEndPayload, port: CallForceEndPort): Promise<CallForceEndResult> {
  const call = await port.findCall(p.callId);
  if (!call || call.status === "ENDED") return "SKIPPED";
  if (call.scopeType === "MEETING") {
    logger.warn("[calls] Bỏ qua call.force-end của cuộc gọi thuộc cuộc họp", { callId: p.callId });
    return "REFUSED_MEETING";
  }
  await port.endCall(p.callId, "FORCE_ENDED", p.actorId);
  return "ENDED";
}

registerJob("calls", "call.force-end", async (job) => {
  const c = getCallsContainer();
  await handleCallForceEnd(job.data as CallForceEndPayload, {
    findCall: (id) => c.deps.repo.findById(id),
    endCall: (id, reason, actorId) => c.ends.endCall(id, reason, actorId),
  });
});
