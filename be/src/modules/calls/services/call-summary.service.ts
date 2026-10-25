import type { SystemMessagePostInput } from "../../messages/public";
import type { CallDeps } from "./call.deps";
import { summaryStatusOf } from "./call-state.machine";

/** Cổng tối thiểu của `SystemMessageService.post()` (p1-04) — không import kiểu nội bộ của `messages`. */
export interface SystemMessagePoster {
  post(input: SystemMessagePostInput): Promise<unknown>;
}

/**
 * Job `call.summary` (be.md §7): ghi ĐÚNG MỘT tin `CALL_SUMMARY` vào hội thoại/kênh khi cuộc gọi kết thúc. Tin do server
 * ghi (`kind=SYSTEM`) nên client không giả được; `dedupeKey` cố định theo cuộc gọi nên retry/ghi lặp không nhân đôi.
 */
export class CallSummaryService {
  constructor(
    private readonly d: CallDeps,
    private readonly messages: SystemMessagePoster
  ) {}

  /** Trả `true` khi đã (hoặc đã từng) ghi tin, `false` khi cuộc gọi không cần tin (chưa kết thúc/phạm vi họp). */
  async post(callId: string): Promise<boolean> {
    const call = await this.d.repo.findById(callId);
    if (!call || call.status !== "ENDED" || !call.endReason) return false;
    if (call.scopeType !== "CONVERSATION" && call.scopeType !== "CHANNEL") return false;

    const participants = await this.d.repo.findParticipants(callId);
    const participantIds = participants
      .filter((p) => p.userId === call.initiatorId || p.firstJoinedAt || p.respondedAt || p.state === "MISSED" || p.state === "DECLINED" || p.state === "BUSY")
      .map((p) => p.userId);
    await this.messages.post({
      scopeType: call.scopeType,
      scopeId: call.scopeId,
      workspaceId: call.workspaceId,
      systemType: "CALL_SUMMARY",
      payload: {
        callId,
        mediaKind: call.mediaKind,
        status: summaryStatusOf(call.endReason, call.answeredAt !== null),
        durationSec: call.durationSec ?? 0,
        initiatorId: call.initiatorId,
        participantIds,
      },
      dedupeKey: `call.summary:call:${callId}`,
    });
    return true;
  }
}
