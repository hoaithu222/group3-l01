import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { callRingToAnswerSeconds } from "../../../infrastructure/metrics/call.metrics";
import type { CallEntity, CallParticipantEntity, CallTokenResponse } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import type { TxHandle } from "../repositories/tx";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import { callError } from "./call-scope.resolver";
import { isConnectedLike, isRingingLike } from "./call-state.machine";
import { waitForCall } from "./call-wait";

export interface AnswerResult {
  call: CallEntity;
  token: CallTokenResponse;
}

export interface DeclineResult {
  call: CallEntity;
  ignored: boolean;
}

const LOCK = { retries: 40, delayMs: 50 } as const;

/**
 * `CallResponseService` — người được gọi trả lời/từ chối, người gọi huỷ (be.md §5.4–§5.6). Chuyển trạng thái bằng
 * compare-and-set (version + trạng thái cũ) dưới khoá `call:lock`, nên 2 thiết bị trả lời cùng lúc chỉ một thắng.
 */
export class CallResponseService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService
  ) {}

  /**
   * Áp "trả lời" trong transaction: participant → JOINING, call RINGING → ACTIVE (khi người trả lời ≠ người gọi) và ghi
   * outbox `call.answered`. Dùng chung với `POST /calls/:id/answer` và join-existing (be.md §5.3 bước 4–5).
   */
  async applyAnswer(tx: TxHandle, call: CallEntity, p: CallParticipantEntity, deviceId: string, now: Date): Promise<CallEntity> {
    const updated = await this.d.repo.updateParticipant(tx, call.id, p.userId, { version: p.version }, {
      state: "JOINING",
      respondedAt: now,
      respondedDeviceId: deviceId,
      joiningAt: now,
    });
    if (!updated) throw callError(ErrorCode.CALL_011, 409);

    let current = call;
    let becameActive = false;
    if (call.status === "RINGING" && p.userId !== call.initiatorId) {
      const active = await this.d.repo.updateCall(tx, call.id, { status: ["RINGING"] }, { status: "ACTIVE", answeredAt: now });
      if (active) {
        current = active;
        becameActive = true;
      }
    }
    await this.d.outbox.add(tx, callEvents.answered(call.id, current.version, p.userId, deviceId));
    await this.d.outbox.add(tx, callEvents.participantChanged(call.id, current.version, p.userId, "JOINING", updated.version));
    if (becameActive) callRingToAnswerSeconds.observe(Math.max(0, (now.getTime() - call.startedAt.getTime()) / 1000));
    return current;
  }

  async answer(user: AuthUser, callId: string, deviceId: string): Promise<AnswerResult> {
    const call = await this.d.repo.findById(callId);
    const first = call ? await this.d.repo.findParticipant(callId, user.id) : null;
    if (!call || !first) throw callError(ErrorCode.CALL_014, 403);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });

    // Đã trả lời rồi: cùng thiết bị → idempotent (token mới); thiết bị khác → thua.
    const settled = this.settledAnswer(first, deviceId);
    if (settled === "SAME") return { call, token: await this.d.tokens.issueFor(user, call, first) };
    if (settled === "OTHER") throw callError(ErrorCode.CALL_006, 409, { answeredElsewhere: true });
    if (!isRingingLike(first.state)) throw callError(ErrorCode.CALL_006, 409);

    await this.acquireBusyOrThrow(user.id, callId);

    // Object giữ kết quả — TS không thu hẹp kiểu qua closure bất đồng bộ, nên dùng thuộc tính thay vì biến `let`.
    const out: { after: { call: CallEntity; participant: CallParticipantEntity } | null; lost: "OTHER" | "GONE" | null } = {
      after: null,
      lost: null,
    };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.after = null;
        out.lost = null;
        const cur = await this.d.repo.findById(callId, tx);
        const p = await this.d.repo.findParticipant(callId, user.id, tx);
        if (!cur || !p || cur.status === "ENDED") {
          out.lost = "GONE";
          return;
        }
        const state = this.settledAnswer(p, deviceId);
        if (state === "SAME") {
          out.after = { call: cur, participant: p };
          return;
        }
        if (state === "OTHER") {
          out.lost = "OTHER";
          return;
        }
        if (!isRingingLike(p.state)) {
          out.lost = "GONE";
          return;
        }
        const updatedCall = await this.applyAnswer(tx, cur, p, deviceId, this.d.now());
        out.after = { call: updatedCall, participant: (await this.d.repo.findParticipant(callId, user.id, tx)) ?? p };
      }),
      LOCK
    );

    if (out.lost === "OTHER") throw callError(ErrorCode.CALL_006, 409, { answeredElsewhere: true });
    const done = out.after;
    if (out.lost === "GONE" || !done) throw callError(ErrorCode.CALL_006, 409);
    if (done.call.status === "ACTIVE") {
      await this.d.store.promoteActive(done.call.scopeType, done.call.scopeId, callId).catch(() => false);
    }
    return { call: done.call, token: await this.d.tokens.issueFor(user, done.call, done.participant) };
  }

  /** `SAME`: đã trả lời từ CHÍNH thiết bị này; `OTHER`: đã trả lời từ thiết bị khác; `NONE`: chưa trả lời. */
  private settledAnswer(p: CallParticipantEntity, deviceId: string): "SAME" | "OTHER" | "NONE" {
    if (!isConnectedLike(p.state)) return "NONE";
    return p.respondedDeviceId === deviceId ? "SAME" : "OTHER";
  }

  /** `acquireBusy` — khoá của cuộc gọi đã kết thúc (mồ côi) được dọn rồi thử lại; còn sống → `CALL_004`. */
  async acquireBusyOrThrow(userId: string, callId: string): Promise<void> {
    for (let i = 0; i < 2; i += 1) {
      const res = await this.d.store.acquireBusy(userId, callId);
      if (res.acquired) return;
      const other = await waitForCall(this.d.repo, res.existing); // cuộc gọi kia có thể đang được tạo (chưa commit)
      const stillIn = other && other.status !== "ENDED" ? await this.d.repo.findParticipant(other.id, userId) : null;
      if (stillIn && (isConnectedLike(stillIn.state) || (userId === other?.initiatorId && other.status === "RINGING"))) {
        throw callError(ErrorCode.CALL_004, 409, { activeCallId: res.existing });
      }
      await this.d.store.releaseBusyIf(userId, res.existing);
    }
    throw callError(ErrorCode.CALL_004, 409);
  }

  async decline(user: AuthUser, callId: string, deviceId: string): Promise<DeclineResult> {
    const call = await this.d.repo.findById(callId);
    const p = call ? await this.d.repo.findParticipant(callId, user.id) : null;
    if (!call || !p) throw callError(ErrorCode.CALL_014, 403);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    // Máy khác đã nhận (JOINING/CONNECTED) → bỏ qua, KHÔNG đổi trạng thái (học Sun PMS, CL-03).
    if (isConnectedLike(p.state)) return { call, ignored: true };
    if (!isRingingLike(p.state)) return { call, ignored: false }; // LEFT/DECLINED/MISSED: idempotent 200

    const out = { ignored: false };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.ignored = false;
        const cur = await this.d.repo.findParticipant(callId, user.id, tx);
        if (!cur) return;
        if (isConnectedLike(cur.state)) {
          out.ignored = true;
          return;
        }
        if (!isRingingLike(cur.state)) return;
        const now = this.d.now();
        const updated = await this.d.repo.updateParticipant(tx, callId, user.id, { version: cur.version }, {
          state: "DECLINED",
          respondedAt: now,
          respondedDeviceId: deviceId,
        });
        if (!updated) return;
        const fresh = (await this.d.repo.findById(callId, tx)) ?? call;
        await this.d.outbox.add(tx, callEvents.declined(callId, fresh.version, user.id, deviceId));
      }),
      LOCK
    );
    if (out.ignored) return { call, ignored: true };
    await this.ends.evaluateEnd(callId);
    return { call: (await this.d.repo.findById(callId)) ?? call, ignored: false };
  }

  /** Chỉ INITIATOR, call `RINGING`, chưa ai khác vào (be.md §5.6) — ngược lại `CALL_011` ("dùng /end"). */
  async cancel(user: AuthUser, callId: string): Promise<CallEntity> {
    const call = await this.d.repo.findById(callId);
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    if (call.initiatorId !== user.id) throw callError(ErrorCode.CALL_015, 403);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    const participants = await this.d.repo.findParticipants(callId);
    const othersIn = participants.some((p) => p.userId !== user.id && (p.state === "JOINING" || p.state === "CONNECTED"));
    if (call.status !== "RINGING" || othersIn) throw callError(ErrorCode.CALL_011, 409);
    await this.ends.endCall(callId, "CANCELLED", user.id);
    return (await this.d.repo.findById(callId)) ?? call;
  }
}
