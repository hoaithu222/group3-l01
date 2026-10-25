import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { callActive } from "../../../infrastructure/metrics/call.metrics";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import { isRingingLike } from "./call-state.machine";

const LOCK = { retries: 40, delayMs: 50 } as const;
const BATCH = 200;

/** Hết giờ đổ chuông + khôi phục sau sự cố worker (be.md §3.2, §3.4, §5.10). */
export class CallRecoveryService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService
  ) {}

  /**
   * Job `call.ring-timeout` (delayed qua outbox `availableAt`) và nhánh `RINGING` cũ của recovery. Kiểm lại trạng thái:
   * - còn `RINGING` (chưa ai nhận) → `endCall(NO_ANSWER)` (mọi người còn đổ chuông → `MISSED`);
   * - đã `ACTIVE` (nhóm) → chỉ người còn đổ chuông quá hạn thành `MISSED`, cuộc gọi tiếp tục.
   */
  async ringTimeout(callId: string): Promise<void> {
    const call = await this.d.repo.findById(callId);
    if (!call || call.status === "ENDED") return;
    if (call.status === "RINGING") {
      await this.ends.endCall(callId, "NO_ANSWER", null);
      return;
    }
    const { ringTimeoutSeconds } = await this.d.limits();
    await this.d.store.withLock(
      callId,
      () =>
        this.d.tx.run(async (tx) => {
          const cur = await this.d.repo.findById(callId, tx);
          if (!cur || cur.status === "ENDED") return;
          const now = this.d.now();
          for (const p of await this.d.repo.findParticipants(callId, tx)) {
            const overdue = p.invitedAt && now.getTime() - p.invitedAt.getTime() >= (ringTimeoutSeconds - 1) * 1000;
            if (!isRingingLike(p.state) || !overdue) continue;
            const updated = await this.d.repo.updateParticipant(tx, callId, p.userId, { version: p.version, stateIn: ["INVITED", "RINGING"] }, {
              state: "MISSED",
              outcome: "MISSED",
            });
            if (updated) await this.d.outbox.add(tx, callEvents.participantChanged(callId, cur.version, p.userId, "MISSED", updated.version));
          }
        }),
      LOCK
    );
    await this.ends.evaluateEnd(callId);
  }

  /**
   * `call.recovery` (cron mỗi phút + lúc worker khởi động): `RINGING` quá hạn → timeout; `ACTIVE` lâu không đối soát →
   * xếp `call.reconcile`; cập nhật gauge `call_active`. Chỉ đọc + hành động idempotent theo jobId/CAS.
   */
  async recover(): Promise<{ timedOut: number; reconcileQueued: number }> {
    const now = this.d.now();
    const { ringTimeoutSeconds, staleRingGraceSeconds } = await this.d.limits();
    const ringingCutoff = new Date(now.getTime() - (ringTimeoutSeconds + staleRingGraceSeconds) * 1000);
    const stale = await this.d.repo.findRingingStartedBefore(ringingCutoff, BATCH);
    let timedOut = 0;
    for (const call of stale) {
      try {
        await this.ringTimeout(call.id);
        timedOut += 1;
      } catch (err) {
        logger.error("[calls.recovery] Không xử lý được cuộc gọi đổ chuông quá hạn", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const reconcileCutoff = new Date(now.getTime() - LIMITS.call.reconcileStaleSeconds * 1000);
    const active = await this.d.repo.findActiveNotReconciledSince(reconcileCutoff, BATCH);
    for (const call of active) await this.d.jobs.scheduleReconcile(call.id, 0).catch(() => undefined);

    const open = await this.d.repo.countOpenByMode();
    callActive.set({ mode: "RING" }, open.RING);
    callActive.set({ mode: "ROOM" }, open.ROOM);
    return { timedOut, reconcileQueued: active.length };
  }
}
