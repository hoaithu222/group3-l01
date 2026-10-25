import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IMediaOpsForceEndRepository } from "../repositories/media-ops-force-end.repository.interface";
import type { IOutboxPort, ITxRunner, TxHandle } from "../repositories/tx";
import { callAlreadyEnded, callBelongsToMeeting, callNotFound, meetingNotFound, meetingNotLive } from "./admin-media-errors";

export interface AuditPort {
  record(input: { actorId: string; actorRole?: string; action: string; targetType: string; targetId: string; workspaceId?: string; reason?: string; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface ForceEndActor {
  id: string;
  role?: string;
}

interface Outcome {
  duplicate: boolean;
  audit?: Parameters<AuditPort["record"]>[0];
}

/**
 * Kết thúc CƯỠNG BỨC cuộc họp/cuộc gọi cho admin nền tảng (p2-07 be.md §5.3). Module này KHÔNG tự đổi trạng thái của module khác: ghi hàng outbox (`meeting.force-end` /
 * `call.force-end`, queue `calls`) rồi consumer của module sở hữu chạy `endBySystem(FORCE_ENDED)` / `CallEndService.endCall(FORCE_ENDED)` — điểm DUY NHẤT kết thúc `Call`.
 * Lý do bắt buộc (DTO `reasonSchema`) đi vào audit. `dedupeKey` gắn `version` nên bấm hai lần khi version chưa đổi chỉ tạo MỘT hàng outbox và MỘT audit; cả hai lần đều trả 202.
 * Audit ghi SAU commit (`AuditService` không nhận transaction; lỗi ghi audit chỉ log) — cùng mẫu các thao tác quản trị khác.
 */
export class AdminMediaForceEndService {
  constructor(
    private readonly repo: IMediaOpsForceEndRepository,
    private readonly tx: ITxRunner,
    private readonly outbox: IOutboxPort,
    private readonly audit: AuditPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  async forceEndMeeting(actor: ForceEndActor, meetingId: string, reason: string): Promise<{ accepted: true }> {
    const outcome = await this.commit(async (tx) => {
      const m = await this.repo.loadMeeting(meetingId, tx);
      if (!m) throw meetingNotFound();
      if (m.status !== "LIVE") throw meetingNotLive();
      const dedupeKey = `meeting.force-end:meeting:${m.id}:v${m.version}`;
      if (await this.repo.outboxExists(dedupeKey, tx)) return { duplicate: true };
      const connectedCount = m.currentCallId ? await this.repo.connectedCount(m.currentCallId, tx) : 0;
      await this.outbox.add(tx, this.event("meeting.force-end", "Meeting", m.id, dedupeKey, { meetingId: m.id, actorId: actor.id, callId: m.currentCallId, reason }));
      return { duplicate: false, audit: { actorId: actor.id, actorRole: actor.role, action: "meeting.force-end", targetType: "Meeting", targetId: m.id, workspaceId: m.workspaceId, reason, metadata: { title: m.title, connectedCount } } };
    });
    if (outcome.audit) await this.audit.record(outcome.audit);
    return { accepted: true };
  }

  async forceEndCall(actor: ForceEndActor, callId: string, reason: string): Promise<{ accepted: true }> {
    const outcome = await this.commit(async (tx) => {
      const c = await this.repo.loadCall(callId, tx);
      if (!c) throw callNotFound();
      if (c.status === "ENDED") throw callAlreadyEnded();
      // Cuộc gọi của cuộc họp phải kết thúc qua cuộc họp để `Meeting.status` không lệch với `Call.status`.
      if (c.scopeType === "MEETING") throw callBelongsToMeeting(c.scopeId);
      const dedupeKey = `call.force-end:call:${c.id}:v${c.version}`;
      if (await this.repo.outboxExists(dedupeKey, tx)) return { duplicate: true };
      await this.outbox.add(tx, this.event("call.force-end", "Call", c.id, dedupeKey, { callId: c.id, actorId: actor.id, reason }));
      // Metadata KHÔNG có userId/conversationId/scopeId (cuộc gọi 1-1 là dữ liệu riêng tư).
      return {
        duplicate: false,
        audit: { actorId: actor.id, actorRole: actor.role, action: "call.force-end", targetType: "Call", targetId: c.id, ...(c.workspaceId ? { workspaceId: c.workspaceId } : {}), reason, metadata: { scopeType: c.scopeType, mode: c.mode, peakParticipants: c.peakParticipants } },
      };
    });
    if (outcome.audit) await this.audit.record(outcome.audit);
    return { accepted: true };
  }

  /** Hai yêu cầu ĐỒNG THỜI cùng `dedupeKey` (vượt qua `outboxExists`): bên thua nhận P2002 — coi như đã chấp nhận, không audit lần hai. */
  private async commit(fn: (tx: TxHandle) => Promise<Outcome>): Promise<Outcome> {
    try {
      return await this.tx.run(fn);
    } catch (err) {
      if (this.repo.isDuplicateError(err)) return { duplicate: true };
      throw err;
    }
  }

  private event(type: string, aggregateType: string, aggregateId: string, dedupeKey: string, payload: Record<string, unknown>): OutboxEventInput {
    return { type, aggregateType, aggregateId, queue: "calls", jobName: type, dedupeKey, payload: { ...payload, requestedAt: this.now().toISOString() } };
  }
}
