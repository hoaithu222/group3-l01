import { AppError } from "../../../core/exceptions";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { HostAction, HostActionBodyDto } from "../dtos";
import type { CallEntity, CallParticipantEntity, ParticipantPatch } from "../entities/call.interface";
import { callEvents, type CallHostActionType } from "../events/call-outbox.events";
import type { TxHandle } from "../repositories/tx";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import { CallRoomPermissions } from "./call-room-permissions";
import { callError } from "./call-scope.resolver";
import { connectedSecondsSince, isConnectedLike } from "./call-state.machine";

export interface HostActionResult {
  call: CallEntity;
  participant: CallParticipantEntity | null;
}

export type FailoverResult = "NOOP" | "CHANGED" | "NO_CANDIDATE";

const LOCK = { retries: 40, delayMs: 50 } as const;

const ACTION_TYPE: Record<Exclude<HostAction, "end">, CallHostActionType> = {
  "invite-speak": "INVITE_SPEAK",
  "mute-request": "MUTE_REQUEST",
  "block-audio": "AUDIO_BLOCKED",
  "unblock-audio": "AUDIO_UNBLOCKED",
  "end-share": "SCREEN_SHARE_ENDED",
  remove: "REMOVED",
  transfer: "HOST_CHANGED",
};

/** Ném TRONG transaction để cuộn lại mọi ghi dở (CAS participant lệch sau khi đã tăng version `Call`). */
class HostActionConflictError extends Error {}

function warn(message: string, callId: string, err: unknown): void {
  logger.warn(message, { callId, error: err instanceof Error ? err.message : String(err) });
}

/**
 * `CallHostService` (p2-03 be.md §5.4, §5.7) — điều khiển phòng ROOM của chủ phòng + chuyển chủ khi chủ mất kết nối.
 * Mọi tác động: CAS `Call.version` (== `expectedVersion`), outbox `call.host-action`, rồi mới gọi LiveKit (best-effort, log).
 * Thao tác đi qua REST → `IMediaServer` (token client KHÔNG có `roomAdmin`); DB là nguồn sự thật của quyền phát
 * (`CallRoomPermissions` dùng chung cho token lúc vào và `updateParticipant` lúc host đổi quyền).
 */
export class CallHostService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService
  ) {}

  async act(user: AuthUser, callId: string, action: HostAction, body: HostActionBodyDto): Promise<HostActionResult> {
    const call = await this.d.repo.findById(callId);
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    const me = await this.d.repo.findParticipant(callId, user.id);
    if (!me) throw callError(ErrorCode.CALL_014, 403);
    if (call.mode !== "ROOM") throw callError(ErrorCode.CALL_013, 400);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    if (call.hostId !== user.id) throw callError(ErrorCode.CALL_015, 403);

    if (action === "end") {
      // Kết thúc là ý định dứt khoát của chủ phòng — không bắt khớp version (phiên bản cũ vẫn phải kết thúc được).
      await this.ends.endCall(callId, "HOST_ENDED", user.id);
      return { call: (await this.d.repo.findById(callId)) ?? call, participant: null };
    }
    if (body.expectedVersion !== call.version) throw callError(ErrorCode.CALL_011, 409, { currentVersion: call.version, hostId: call.hostId });

    if (!body.targetUserId) throw new AppError("Thiếu targetUserId", 400, ErrorCode.VAL_001);
    const targetId = body.targetUserId;
    const target = await this.d.repo.findParticipant(callId, targetId);
    if (!target || !isConnectedLike(target.state)) throw callError(ErrorCode.CALL_014, 403, { reason: "TARGET_NOT_IN_ROOM" });
    if (action === "transfer") await this.assertTransferable(call, target);
    else if (targetId === user.id) throw new AppError("Không thể áp dụng cho chủ phòng", 400, ErrorCode.VAL_001);

    const out: { call: CallEntity | null; participant: CallParticipantEntity | null; conflict: boolean } = { call: null, participant: null, conflict: false };
    try {
      await this.d.store.withLock(callId, () =>
        this.d.tx.run(async (tx) => {
          out.call = null;
          out.participant = null;
          out.conflict = false;
          const applied = await this.applyInTx(tx, call, user.id, target, action, body);
          if (!applied) {
            out.conflict = true;
            return;
          }
          out.call = applied.call;
          out.participant = applied.participant;
        }),
        LOCK
      );
    } catch (err) {
      if (!(err instanceof HostActionConflictError)) throw err;
      out.conflict = true;
    }
    if (out.conflict || !out.call) {
      const current = await this.d.repo.findById(callId);
      throw callError(ErrorCode.CALL_011, 409, { currentVersion: current?.version ?? call.version, hostId: current?.hostId ?? call.hostId });
    }
    await this.afterCommit(out.call, user.id, action, target, out.participant);
    // Nhật ký nhẹ (be.md §5.4): AuditLog dành cho quản trị nền tảng/nhóm — thao tác trong phòng chỉ cần log để truy vết khi có khiếu nại.
    logger.info("[calls] Chủ phòng thao tác", { callId, action, byUserId: user.id, targetUserId: targetId, version: out.call.version });
    return { call: out.call, participant: out.participant };
  }

  /** Ghi DB của một host action trong transaction; `null` = version lệch/phòng đã đổi (CAS). */
  private async applyInTx(
    tx: TxHandle,
    call: CallEntity,
    hostId: string,
    target: CallParticipantEntity,
    action: Exclude<HostAction, "end">,
    body: HostActionBodyDto
  ): Promise<HostActionResult | null> {
    const now = this.d.now();
    const cas = { version: body.expectedVersion, status: ["ACTIVE" as const] };
    const fresh = await this.d.repo.findParticipant(call.id, target.userId, tx);
    if (!fresh || !isConnectedLike(fresh.state)) return null;

    let participantPatch: ParticipantPatch | null = null;
    switch (action) {
      case "invite-speak":
        participantPatch = { handRaisedAt: null, ...(fresh.mutedByHost ? { mutedByHost: false, publishPermissions: { ...fresh.publishPermissions, audio: true } } : {}) };
        break;
      case "block-audio":
        participantPatch = { mutedByHost: true, publishPermissions: { ...fresh.publishPermissions, audio: false } };
        break;
      case "unblock-audio":
        participantPatch = { mutedByHost: false, publishPermissions: { ...fresh.publishPermissions, audio: true } };
        break;
      case "end-share":
        participantPatch = { publishPermissions: { ...fresh.publishPermissions, screen: false } };
        break;
      case "remove":
        participantPatch = {
          state: "REMOVED",
          removedBy: hostId,
          lastLeftAt: now,
          connectedSeconds: fresh.connectedSeconds + connectedSecondsSince(fresh.lastJoinedAt, now),
        };
        break;
      case "transfer":
        participantPatch = { role: "HOST" };
        break;
      case "mute-request":
        break;
    }

    const updatedCall = await this.d.repo.updateCall(tx, call.id, cas, action === "transfer" ? { hostId: target.userId } : {});
    if (!updatedCall) return null;
    let participant: CallParticipantEntity | null = fresh;
    if (participantPatch) {
      participant = await this.d.repo.updateParticipant(tx, call.id, target.userId, { version: fresh.version }, participantPatch);
      if (!participant) throw new HostActionConflictError();
    }
    if (action === "transfer") {
      // Chủ cũ hạ xuống MEMBER: báo riêng để bản công khai ở `ch:{id}` (preview kênh) không còn hiện họ là "Chủ phòng".
      const previous = await this.d.repo.updateParticipant(tx, call.id, hostId, {}, { role: "MEMBER" });
      if (previous) await this.d.outbox.add(tx, callEvents.participantChanged(call.id, updatedCall.version, hostId, previous.state, previous.version));
    }
    await this.d.outbox.add(tx, callEvents.hostAction(call.id, updatedCall.version, {
      type: ACTION_TYPE[action],
      targetUserId: target.userId,
      byUserId: hostId,
      ...(body.reason ? { reason: body.reason } : {}),
    }));
    if (participant && action !== "mute-request") {
      await this.d.outbox.add(tx, callEvents.participantChanged(call.id, updatedCall.version, target.userId, participant.state, participant.version));
    }
    return { call: updatedCall, participant };
  }

  /** Sau commit: đồng bộ LiveKit (best-effort — DB là nguồn sự thật, token lần sau lấy quyền từ DB) + dọn Redis/quyền. */
  private async afterCommit(
    call: CallEntity,
    hostId: string,
    action: Exclude<HostAction, "end">,
    target: CallParticipantEntity,
    participant: CallParticipantEntity | null
  ): Promise<void> {
    const room = call.livekitRoom;
    const media = this.d.media();
    try {
      switch (action) {
        case "block-audio":
        case "unblock-audio":
        case "invite-speak":
          if (participant) {
            // `invite-speak` hạ tay của người được mời: xoá luôn thuộc tính `handRaised` trên LiveKit (DB đã `handRaisedAt = null`).
            await media.updateParticipant(room, target.userId, {
              permission: CallRoomPermissions.permission(participant),
              ...(action === "invite-speak" ? { attributes: { handRaised: "" } } : {}),
            });
          }
          if (action === "block-audio") await this.muteTracks(room, target.userId, "MICROPHONE");
          break;
        case "end-share":
          await this.d.store.releaseScreen(call.id, target.userId).catch(() => false);
          if (participant) await media.updateParticipant(room, target.userId, { permission: CallRoomPermissions.permission(participant) });
          await this.muteTracks(room, target.userId, "SCREEN_SHARE");
          break;
        case "remove":
          await this.d.store.releaseBusy(target.userId, call.id).catch(() => false);
          await this.d.store.releaseScreen(call.id, target.userId).catch(() => false);
          await media.removeParticipant(room, target.userId);
          // Bump quyền `CALL:<id>` + đá khỏi room socket `call:{id}` — vào lại bằng token/room cũ bị từ chối ngay.
          await permissionService.revokeScope({ scope: { type: "CALL", id: call.id }, userIds: [target.userId], reason: "REMOVED", cascade: false });
          break;
        case "transfer":
          await this.syncRoles(call, [hostId, target.userId]);
          break;
        case "mute-request":
          break;
      }
    } catch (err) {
      warn("[calls] Đồng bộ LiveKit sau host action lỗi (non-fatal)", call.id, err);
    }
  }

  /** Tắt (mute) track đang phát của `identity` theo nguồn — lấy `trackSid` từ `listParticipants` (không cache). */
  private async muteTracks(room: string, identity: string, source: "MICROPHONE" | "SCREEN_SHARE"): Promise<void> {
    const live = await this.d.media().listParticipants(room);
    const tracks = live.find((p) => p.identity === identity)?.tracks.filter((t) => t.source === source && !t.muted) ?? [];
    for (const t of tracks) await this.d.media().mutePublishedTrack(room, identity, t.sid, true);
  }

  private async syncRoles(call: CallEntity, userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      const p = await this.d.repo.findParticipant(call.id, userId);
      if (!p) continue;
      await this.d.media()
        .updateParticipant(call.livekitRoom, userId, { metadata: JSON.stringify({ callId: call.id, role: p.role }) })
        .catch((err: unknown) => warn("[calls] Không cập nhật metadata vai trò (non-fatal)", call.id, err));
    }
  }

  private async assertTransferable(call: CallEntity, target: CallParticipantEntity): Promise<void> {
    if (target.userId === call.hostId || target.state !== "CONNECTED") throw callError(ErrorCode.CALL_019, 400);
    if (!(await this.d.scopes.canStayInScope({ id: target.userId, email: "" }, call))) throw callError(ErrorCode.CALL_019, 400);
  }

  /**
   * Chủ phòng rời có chọn người nhận (`POST /leave { transferToUserId }`): CAS theo `hostId` (không cần `expectedVersion`
   * vì client không giữ version lúc rời). Trả `null` khi chủ đã đổi (job/hành động khác thắng) — caller coi như xong.
   */
  async transferOnLeave(call: CallEntity, hostId: string, targetUserId: string): Promise<CallEntity | null> {
    const target = await this.d.repo.findParticipant(call.id, targetUserId);
    if (!target || !isConnectedLike(target.state)) throw callError(ErrorCode.CALL_019, 400);
    await this.assertTransferable(call, target);
    const out: { call: CallEntity | null } = { call: null };
    await this.d.store.withLock(call.id, () =>
      this.d.tx.run(async (tx) => {
        out.call = null;
        out.call = await this.changeHost(tx, call.id, hostId, targetUserId, null);
      }),
      LOCK
    );
    if (out.call) await this.syncRoles(out.call, [hostId, targetUserId]);
    return out.call;
  }

  /** CAS `hostId` cũ → mới (+ vai trò participant, outbox `HOST_CHANGED`). `null` khi không khớp. */
  private async changeHost(tx: TxHandle, callId: string, fromId: string, toId: string, reason: string | null): Promise<CallEntity | null> {
    const updated = await this.d.repo.updateCall(tx, callId, { hostId: fromId, status: ["ACTIVE"] }, { hostId: toId });
    if (!updated) return null;
    const next = await this.d.repo.updateParticipant(tx, callId, toId, {}, { role: "HOST" });
    const previous = await this.d.repo.updateParticipant(tx, callId, fromId, {}, { role: "MEMBER" });
    await this.d.outbox.add(tx, callEvents.hostAction(callId, updated.version, { type: "HOST_CHANGED", targetUserId: toId, byUserId: fromId, ...(reason ? { reason } : {}) }));
    // `call:host-action` chỉ tới `call:{id}` + người nhận; người xem preview ở `ch:{id}` cần bản công khai của CẢ HAI người để đổi nhãn chủ phòng.
    for (const p of [next, previous]) {
      if (p) await this.d.outbox.add(tx, callEvents.participantChanged(callId, updated.version, p.userId, p.state, p.version));
    }
    return updated;
  }

  /**
   * Job `call.host-failover` (be.md §5.7). No-op khi: phòng đã kết thúc, chủ vẫn còn trong LiveKit (đã quay lại), không có
   * ứng viên, hoặc job khác đã đổi chủ (CAS `hostId`). Ứng viên = người đang trong phòng, còn `channel.read`, vào sớm nhất.
   */
  async failover(callId: string): Promise<FailoverResult> {
    const call = await this.d.repo.findById(callId);
    if (!call || call.status === "ENDED" || call.mode !== "ROOM" || !call.hostId) return "NOOP";
    const oldHost = call.hostId;
    const live = await this.d.media().listParticipants(call.livekitRoom);
    const liveIds = new Set(live.map((p) => p.identity));
    if (liveIds.has(oldHost)) return "NOOP";

    const participants = await this.d.repo.findParticipants(callId);
    const order = (p: CallParticipantEntity): number => (p.firstJoinedAt ?? p.joiningAt ?? p.lastJoinedAt ?? new Date(8.64e15)).getTime();
    const candidates = participants
      .filter((p) => p.userId !== oldHost && isConnectedLike(p.state) && liveIds.has(p.userId))
      .sort((a, b) => order(a) - order(b));
    let chosen: string | null = null;
    for (const c of candidates) {
      if (await this.d.scopes.canStayInScope({ id: c.userId, email: "" }, call)) {
        chosen = c.userId;
        break;
      }
    }
    if (!chosen) return "NO_CANDIDATE";

    const next = chosen;
    const out: { call: CallEntity | null } = { call: null };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.call = null;
        out.call = await this.changeHost(tx, callId, oldHost, next, "FAILOVER");
      }),
      LOCK
    );
    if (!out.call) return "NOOP";
    await this.syncRoles(out.call, [oldHost, next]);
    logger.info("[calls] Chuyển chủ phòng (failover)", { callId, to: next });
    return "CHANGED";
  }
}
