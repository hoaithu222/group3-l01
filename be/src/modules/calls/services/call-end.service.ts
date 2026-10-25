import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { callEndTotal } from "../../../infrastructure/metrics/call.metrics";
import type { CallEndReasonValue, CallEntity, CallParticipantEntity } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import { callError } from "./call-scope.resolver";
import {
  connectedSecondsSince,
  computeOutcome,
  durationSecOf,
  evaluateEnd,
  isConnectedLike,
  isRingingLike,
  roomLastActivityAt,
  stateAfterEnd,
} from "./call-state.machine";

interface EndSignal {
  reason: CallEndReasonValue;
  durationSec: number;
  ringingUserIds: string[];
  participantIds: string[];
}

/**
 * `CallEndService` (be.md §5.7) — kết thúc cuộc gọi. `endCall()` là ĐIỂM DUY NHẤT kết thúc một `Call`: p2-03 (phòng
 * thoại kênh) và p2-05 (phòng họp) PHẢI gọi hàm này, không tự đổi `status = ENDED` (khoá `activeKey`, nhả Redis, tín hiệu,
 * tóm tắt đều nằm ở đây).
 */
export class CallEndService {
  /** Ghi tin tóm tắt NGAY sau khi kết thúc (container nối vào `CallSummaryService.post`) — job `call.summary` vẫn chạy và idempotent theo `dedupeKey`. */
  summaryNow: ((callId: string) => Promise<unknown>) | null = null;

  constructor(private readonly d: CallDeps) {}

  /**
   * Kết thúc idempotent: đã ENDED → `null`. Khoá `call:lock` + CAS `status != ENDED` (một trong nhiều tiến trình thắng).
   * Không gọi bên trong `store.withLock(callId)` của cùng cuộc gọi (khoá không re-entrant).
   */
  async endCall(callId: string, reason: CallEndReasonValue, actorId: string | null): Promise<CallEntity | null> {
    const result = await this.d.store.withLock(callId, () => this.commitEnd(callId, reason, actorId), { retries: 20, delayMs: 50 });
    if (!result) return null;
    this.emitEndedNow(result.call, result.signal);
    if (result.wantsSummary) {
      void this.summaryNow?.(callId).catch((err: unknown) =>
        logger.warn("[calls] Ghi tóm tắt tức thì lỗi — job call.summary sẽ ghi", { callId, error: err instanceof Error ? err.message : String(err) })
      );
    }
    await this.afterEnd(result.call, result.participants, reason);
    return result.call;
  }

  /**
   * Phát `call:ended`/`call:cancelled` NGAY sau commit — đường bền (outbox → hàng đợi → worker → cầu Redis) tốn nhiều vòng nên bên kia thấy
   * cuộc gọi tắt muộn. Job `call.signal-dispatch` vẫn phát lại cùng `version` (client bỏ qua trùng). Best-effort, không bao giờ ném.
   */
  private emitEndedNow(call: CallEntity, s: EndSignal): void {
    try {
      const base = { callId: call.id, version: call.version };
      const ended = { ...base, endReason: s.reason, durationSec: s.durationSec };
      emitToUsers(s.participantIds, SocketEvent.CALL_ENDED, ended);
      emitToRoom(ROOM.call(call.id), SocketEvent.CALL_ENDED, ended);
      if (s.ringingUserIds.length > 0) {
        emitToUsers(s.ringingUserIds, SocketEvent.CALL_CANCELLED, { ...base, reason: s.reason === "NO_ANSWER" ? "NO_ANSWER" : "CANCELLED" });
      }
    } catch (err) {
      logger.warn("[calls] Phát nhanh call:ended lỗi — job outbox sẽ phát", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private commitEnd(callId: string, reason: CallEndReasonValue, actorId: string | null) {
    return this.d.tx.run(async (tx) => {
      const call = await this.d.repo.findById(callId, tx);
      if (!call || call.status === "ENDED") return null;
      const participants = await this.d.repo.findParticipants(callId, tx);
      const now = this.d.now();
      // Phòng ROOM đóng vì trống (webhook `room_finished`/reconcile): thời lượng tới lúc người cuối rời, không cộng 5 phút chờ tự đóng.
      const trimmedToLastLeave = reason === "EMPTY" && call.mode === "ROOM" && participants.every((p) => !isConnectedLike(p.state));
      const measuredUntil = trimmedToLastLeave ? new Date(Math.min(now.getTime(), roomLastActivityAt(call, participants).getTime())) : now;
      const durationSec = durationSecOf(call.answeredAt, measuredUntil);

      const updated = await this.d.repo.updateCall(tx, callId, { statusNot: "ENDED" }, {
        status: "ENDED",
        endReason: reason,
        endedAt: now,
        endedBy: actorId,
        durationSec,
        activeKey: `ended:${callId}`,
      });
      if (!updated) return null;

      const ringingUserIds: string[] = [];
      const missedUserIds: string[] = [];
      const participantIds = new Set<string>([call.initiatorId]);
      for (const p of participants) {
        const next = stateAfterEnd(p.state);
        const connected = isConnectedLike(p.state);
        await this.d.repo.updateParticipant(tx, callId, p.userId, {}, {
          state: next,
          outcome: computeOutcome(call, p, p.state, reason),
          ...(connected ? { lastLeftAt: now, connectedSeconds: p.connectedSeconds + connectedSecondsSince(p.lastJoinedAt, now) } : {}),
        });
        if (isRingingLike(p.state)) ringingUserIds.push(p.userId);
        if (p.userId !== call.initiatorId && (next === "MISSED" || p.state === "BUSY")) missedUserIds.push(p.userId);
        if (connected || p.role === "INITIATOR" || p.firstJoinedAt || p.respondedAt) participantIds.add(p.userId);
      }

      const participantList = [...participantIds];
      await this.d.outbox.add(tx, callEvents.ended(callId, {
        version: updated.version,
        reason,
        durationSec,
        ringingUserIds,
        missedUserIds,
        participantIds: participantList,
      }));
      const wantsSummary = this.wantsSummary(updated);
      if (wantsSummary) await this.d.outbox.add(tx, callEvents.summary(callId));
      const signal: EndSignal = { reason, durationSec, ringingUserIds, participantIds: participantList };
      return { call: updated, participants, signal, wantsSummary };
    });
  }

  /** Cuộc họp tự đăng tin trong nhóm chat họp (p2-05/p2-06); phòng ROOM quá ngắn không tạo tin rác. */
  private wantsSummary(call: CallEntity): boolean {
    if (call.scopeType === "MEETING") return false;
    if (call.mode === "ROOM") {
      const min = call.scopeType === "CHANNEL" ? LIMITS.voice.summaryMinDurationSeconds : LIMITS.call.summaryMinRoomSeconds;
      return (call.durationSec ?? 0) >= min;
    }
    return true;
  }

  /** Sau commit: nhả khoá Redis (compare-delete), xoá phòng LiveKit (non-fatal), metric. */
  private async afterEnd(call: CallEntity, participants: CallParticipantEntity[], reason: CallEndReasonValue): Promise<void> {
    callEndTotal.inc({ reason });
    try {
      await this.d.store.releaseActive(call.scopeType, call.scopeId, call.id);
      await Promise.all(participants.map((p) => this.d.store.releaseBusy(p.userId, call.id)));
      await this.d.store.releaseBusy(call.initiatorId, call.id);
      if (call.mode === "ROOM") {
        const holder = await this.d.store.peekScreen(call.id); // slot chia sẻ màn hình của phòng (p2-03)
        if (holder) await this.d.store.releaseScreen(call.id, holder);
      }
    } catch (err) {
      logger.warn("[calls] Không nhả được khoá Redis sau khi kết thúc (TTL sẽ dọn)", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      await this.d.media().deleteRoom(call.livekitRoom);
    } catch (err) {
      // non-fatal: `emptyTimeout` của phòng tự đóng; recovery/reconcile dọn sau.
      logger.warn("[calls] deleteRoom lỗi (non-fatal)", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
      await this.d.jobs.scheduleReconcile(call.id, 5000).catch(() => undefined);
    }
  }

  /** `leave` (be.md §5.7) — idempotent: đã rời/đã kết thúc → trả trạng thái hiện tại. */
  async leave(user: AuthUser, callId: string): Promise<CallEntity> {
    const call = await this.d.repo.findById(callId);
    const p = call ? await this.d.repo.findParticipant(callId, user.id) : null;
    if (!call || !p) throw callError(ErrorCode.CALL_014, 403);
    if (call.status === "ENDED" || !isConnectedLike(p.state)) return call;

    const out = { changed: false };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.changed = false; // `withTransaction` có thể chạy lại closure khi WriteConflict
        const cur = await this.d.repo.findParticipant(callId, user.id, tx);
        if (!cur || !isConnectedLike(cur.state)) return;
        const now = this.d.now();
        const updated = await this.d.repo.updateParticipant(tx, callId, user.id, { version: cur.version }, {
          state: "LEFT",
          lastLeftAt: now,
          connectedSeconds: cur.connectedSeconds + connectedSecondsSince(cur.lastJoinedAt, now),
        });
        if (!updated) return;
        out.changed = true;
        const fresh = (await this.d.repo.findById(callId, tx)) ?? call;
        await this.d.outbox.add(tx, callEvents.participantChanged(callId, fresh.version, user.id, "LEFT", updated.version));
      }),
      { retries: 20, delayMs: 50 }
    );
    if (!out.changed) return (await this.d.repo.findById(callId)) ?? call;

    await this.d.store.releaseBusy(user.id, callId).catch(() => false);
    if (call.mode === "ROOM") await this.d.store.releaseScreen(callId, user.id).catch(() => false);
    // Đá khỏi phòng LiveKit chạy SONG SONG với việc quyết định kết thúc — trước đây tuần tự nên bên kia phải chờ thêm một vòng gọi LiveKit.
    const removal = this.d.media().removeParticipant(call.livekitRoom, user.id).catch((err: unknown) =>
      logger.warn("[calls] removeParticipant lỗi (non-fatal)", { callId, error: err instanceof Error ? err.message : String(err) })
    );

    if (user.id === call.initiatorId && call.status === "RINGING") {
      await this.endCall(callId, "CANCELLED", user.id);
    } else {
      await this.evaluateEnd(callId);
    }
    await removal;
    return (await this.d.repo.findById(callId)) ?? call;
  }

  /** `end` (be.md §5.7): 1-1 mọi người đã vào; nhóm chỉ người gọi hoặc OWNER/ADMIN nhóm (`forEveryone`). */
  async end(user: AuthUser, callId: string, forEveryone: boolean): Promise<CallEntity> {
    const call = await this.d.repo.findById(callId);
    const participants = call ? await this.d.repo.findParticipants(callId) : [];
    const me = participants.find((p) => p.userId === user.id);
    if (!call || !me) throw callError(ErrorCode.CALL_014, 403);
    if (call.status === "ENDED") return call;

    const oneToOne = call.mode === "RING" && call.invitedCount <= 1;
    if (call.mode === "ROOM") {
      // Phòng thoại kênh: chỉ chủ phòng kết thúc cho mọi người (p2-03 be.md §5.4 `end`).
      if (call.hostId !== user.id) throw callError(ErrorCode.CALL_015, 403);
      await this.endCall(callId, "HOST_ENDED", user.id);
    } else if (oneToOne) {
      if (!(isConnectedLike(me.state) || me.userId === call.initiatorId)) throw callError(ErrorCode.CALL_015, 403);
      await this.endCall(callId, "COMPLETED", user.id);
    } else {
      const allowed = forEveryone && (user.id === call.initiatorId || (await this.d.scopes.isScopeAdmin(user.id, call)));
      if (!allowed) throw callError(ErrorCode.CALL_015, 403);
      await this.endCall(callId, "HOST_ENDED", user.id);
    }
    return (await this.d.repo.findById(callId)) ?? call;
  }

  /** Đọc dữ liệu MỚI NHẤT rồi áp `evaluateEnd`: kết thúc, hoặc hẹn kiểm lại sau `reconnectGraceSeconds` (nhóm còn 1 người). */
  async evaluateEnd(callId: string): Promise<void> {
    const call = await this.d.repo.findById(callId);
    if (!call) return;
    const participants = await this.d.repo.findParticipants(callId);
    const decision = evaluateEnd(call, participants);
    if (decision.action === "END") {
      await this.endCall(callId, decision.reason, null);
    } else if (decision.action === "GRACE") {
      const { reconnectGraceSeconds } = await this.d.limits();
      await this.d.jobs.scheduleReconcile(callId, reconnectGraceSeconds * 1000);
    }
  }

  /**
   * Đưa participant ra khỏi cuộc gọi vì mất quyền (be.md §5.11): `REMOVED` + đá khỏi phòng LiveKit; 1-1 → `REVOKED`,
   * nhóm → `evaluateEnd`. Trả `true` khi có thay đổi.
   */
  async removeParticipant(callId: string, userId: string, removedBy: string | null): Promise<boolean> {
    const out = { removed: false };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.removed = false;
        const call = await this.d.repo.findById(callId, tx);
        const p = await this.d.repo.findParticipant(callId, userId, tx);
        if (!call || call.status === "ENDED" || !p || p.state === "REMOVED") return;
        const now = this.d.now();
        const connected = isConnectedLike(p.state);
        const updated = await this.d.repo.updateParticipant(tx, callId, userId, { version: p.version }, {
          state: "REMOVED",
          removedBy,
          ...(connected ? { lastLeftAt: now, connectedSeconds: p.connectedSeconds + connectedSecondsSince(p.lastJoinedAt, now) } : {}),
        });
        if (!updated) return;
        out.removed = true;
        await this.d.outbox.add(tx, callEvents.participantChanged(callId, call.version, userId, "REMOVED", updated.version));
      }),
      { retries: 20, delayMs: 50 }
    );
    if (!out.removed) return false;
    const call = await this.d.repo.findById(callId);
    if (!call) return true;
    await this.d.store.releaseBusy(userId, callId).catch(() => false);
    await this.d.media().removeParticipant(call.livekitRoom, userId).catch(() => undefined);
    if (call.mode === "ROOM") {
      // Mất quyền/bị mời ra: nhả slot chia sẻ; chủ phòng đi thì chuyển chủ NGAY (không chờ grace — p2-03 be.md §5.9).
      await this.d.store.releaseScreen(callId, userId).catch(() => false);
      if (call.hostId === userId) await this.d.jobs.scheduleHostFailover?.(callId, call.version, 0).catch(() => undefined);
    }
    if (call.mode === "RING" && call.invitedCount <= 1) await this.endCall(callId, "REVOKED", removedBy);
    else await this.evaluateEnd(callId);
    return true;
  }
}
