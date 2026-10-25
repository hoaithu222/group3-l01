import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { CallEntity, CallParticipantEntity } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import { CallRoomPermissions } from "./call-room-permissions";
import { callError } from "./call-scope.resolver";

export interface ScreenShareResult {
  granted: boolean;
  holderUserId: string | null;
  participant: CallParticipantEntity;
}

/**
 * Tương tác của người trong phòng ROOM (p2-03 be.md §5.5–§5.6): giơ tay và chia sẻ màn hình (một người/phòng).
 * Slot chia sẻ nằm ở Redis (`call:screen:<id>`, SET NX → tranh chấp chỉ MỘT thắng); DB giữ `publishPermissions.screen`
 * để token/`updateParticipant` tính đúng nguồn được phát (`CallRoomPermissions`).
 */
export class CallRoomInteractionService {
  constructor(private readonly d: CallDeps) {}

  private async requireRoomMember(user: AuthUser, callId: string): Promise<{ call: CallEntity; me: CallParticipantEntity }> {
    const call = await this.d.repo.findById(callId);
    const me = call ? await this.d.repo.findParticipant(callId, user.id) : null;
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    if (!me) throw callError(ErrorCode.CALL_014, 403);
    if (call.mode !== "ROOM") throw callError(ErrorCode.CALL_013, 400);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    if (me.state !== "CONNECTED") throw callError(ErrorCode.CALL_014, 403);
    return { call, me };
  }

  /** Giơ/hạ tay — idempotent (lặp cùng giá trị → 200, không ghi). Thứ tự hàng đợi theo `handRaisedAt` do SERVER đặt. */
  async setHand(user: AuthUser, callId: string, raised: boolean): Promise<CallParticipantEntity> {
    const { call, me } = await this.requireRoomMember(user, callId);
    if (raised === (me.handRaisedAt !== null)) return me;

    const out: { participant: CallParticipantEntity | null } = { participant: null };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.participant = null;
        const cur = await this.d.repo.findParticipant(callId, user.id, tx);
        if (!cur || cur.state !== "CONNECTED") return;
        if (raised === (cur.handRaisedAt !== null)) {
          out.participant = cur;
          return;
        }
        const updated = await this.d.repo.updateParticipant(tx, callId, user.id, { version: cur.version }, { handRaisedAt: raised ? this.d.now() : null });
        if (!updated) return;
        out.participant = updated;
        await this.d.outbox.add(tx, callEvents.participantChanged(callId, call.version, user.id, updated.state, updated.version));
      }),
      { retries: 40, delayMs: 50 }
    );
    if (!out.participant) throw callError(ErrorCode.CALL_011, 409);
    const p = out.participant;
    await this.d.media()
      .updateParticipant(call.livekitRoom, user.id, { attributes: { handRaised: p.handRaisedAt ? p.handRaisedAt.toISOString() : "" } })
      .catch((err: unknown) => logger.warn("[calls] Không đặt thuộc tính giơ tay (non-fatal)", { callId, error: err instanceof Error ? err.message : String(err) }));
    return p;
  }

  /** Bật/tắt chia sẻ màn hình. Bật khi người khác đang giữ slot → 409 `CALL_017 { holderUserId }`. */
  async setScreenShare(user: AuthUser, callId: string, on: boolean): Promise<ScreenShareResult> {
    const { call, me } = await this.requireRoomMember(user, callId);
    if (on) {
      const slot = await this.d.store.acquireScreen(callId, user.id);
      if (!slot.acquired) throw callError(ErrorCode.CALL_017, 409, { holderUserId: slot.existing });
    } else {
      const holder = await this.d.store.peekScreen(callId);
      if (holder !== user.id) return { granted: false, holderUserId: holder, participant: me }; // không giữ slot: idempotent
    }

    let participant: CallParticipantEntity;
    try {
      participant = await this.writeScreen(call, user.id, on);
      await this.d.media().updateParticipant(call.livekitRoom, user.id, { permission: CallRoomPermissions.permission(participant) });
    } catch (err) {
      // Bật không thành (DB/LiveKit): trả slot để người khác còn chia sẻ được, rồi báo lỗi cho client thử lại.
      if (on) await this.d.store.releaseScreen(callId, user.id).catch(() => false);
      throw err;
    }
    if (!on) await this.d.store.releaseScreen(callId, user.id).catch(() => false);
    return { granted: on, holderUserId: on ? user.id : null, participant };
  }

  private async writeScreen(call: CallEntity, userId: string, on: boolean): Promise<CallParticipantEntity> {
    const out: { participant: CallParticipantEntity | null } = { participant: null };
    await this.d.store.withLock(call.id, () =>
      this.d.tx.run(async (tx) => {
        out.participant = null;
        const cur = await this.d.repo.findParticipant(call.id, userId, tx);
        if (!cur || cur.state !== "CONNECTED") return;
        const updated = await this.d.repo.updateParticipant(tx, call.id, userId, { version: cur.version }, {
          publishPermissions: { ...cur.publishPermissions, screen: on },
        });
        if (!updated) return;
        out.participant = updated;
        await this.d.outbox.add(tx, callEvents.participantChanged(call.id, call.version, userId, updated.state, updated.version));
      }),
      { retries: 40, delayMs: 50 }
    );
    if (!out.participant) throw callError(ErrorCode.CALL_011, 409);
    return out.participant;
  }
}
