/**
 * ĐIỂM NỐI DUY NHẤT của `meetings` với `modules/calls` (p2-01 lõi cuộc gọi, p2-03 phòng ROOM): phòng họp là một `Call`
 * (`scopeType MEETING`, `mode ROOM`) nên trạng thái người tham gia, khoá nóng `call:*`, kết thúc phiên (`endCall`) và cấp token do
 * `calls` sở hữu — file này chỉ GỌI LẠI qua barrel `@modules/calls` (`getCallsContainer()`), không sửa lõi cuộc gọi. Ngoài barrel chỉ import
 * ba hàm/kiểu THUẦN của chính `calls` (`callEvents`, `CallActiveConflictError`, `isConnectedLike`) để không nhân đôi khuôn tín hiệu/outbox.
 * Mọi nơi khác trong `meetings` chỉ biết `MeetingCallPort` (`services/meeting-call.port.ts`).
 *
 * Lưu ý `Call.hostId = null` cho phiên họp: vai trò điều khiển nằm ở `MeetingAttendee` + `CallParticipant.role`, còn `hostId` của `calls`
 * kích hoạt failover chủ phòng (p2-03) — vốn đổi `hostId`/vai trò người tham gia, KHÔNG được áp cho cuộc họp.
 */
import type { CallEndReason } from "@prisma/client";
import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { getCallsContainer, type CallsContainer } from "../../calls";
import { callEvents } from "../../calls/events/call-outbox.events";
import { CallActiveConflictError } from "../../calls/repositories/call.repository.interface";
import { isConnectedLike } from "../../calls/services/call-state.machine";
import type { PublishPermissionsDto, RoomRole } from "../entities/meeting-room.interface";
import type { TxHandle } from "../repositories/tx";
import {
  RoomCallConflictError,
  type ActiveLock,
  type CreateRoomCallInput,
  type EnterRequest,
  type EnterResult,
  type MeetingCallPort,
  type RoomCall,
  type RoomParticipant,
} from "../services/meeting-call.port";
import { enterRoom } from "./calls-room-enter";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const err = (code: typeof ErrorCode.CALL_004 | typeof ErrorCode.CALL_014 | typeof ErrorCode.CALL_005, status: 409 | 403 | 410, details?: unknown): AppError =>
  new AppError(ErrorMessages[code], status, code, details);

export class CallsRoomAdapter implements MeetingCallPort {
  /** Lấy container LƯỜI — test đổi `setCallsContainerForTests` sau khi dựng adapter vẫn đúng. */
  constructor(private readonly kit: () => CallsContainer = getCallsContainer) {}

  private get k(): CallsContainer {
    return this.kit();
  }

  acquireActive(meetingId: string, callId: string): Promise<ActiveLock> {
    return this.k.deps.store.acquireActive("MEETING", meetingId, callId);
  }

  promoteActive(meetingId: string, callId: string): Promise<boolean> {
    return this.k.deps.store.promoteActive("MEETING", meetingId, callId).catch(() => false);
  }

  releaseActive(meetingId: string, callId: string): Promise<boolean> {
    return this.k.deps.store.releaseActive("MEETING", meetingId, callId).catch(() => false);
  }

  async createRoomCall(tx: TxHandle, i: CreateRoomCallInput): Promise<RoomCall> {
    const now = this.k.deps.now();
    try {
      return await this.k.deps.repo.createCall(tx, {
        id: i.callId,
        scopeType: "MEETING",
        scopeId: i.meetingId,
        workspaceId: i.workspaceId,
        mode: "ROOM",
        mediaKind: "VIDEO",
        status: "ACTIVE",
        initiatorId: i.initiatorId,
        hostId: null,
        livekitRoom: i.livekitRoom,
        clientCallId: `meeting:${i.meetingId}:${i.callId}`,
        activeKey: `MEETING:${i.meetingId}`,
        invitedCount: 0,
        startedAt: now,
        answeredAt: now,
      });
    } catch (e) {
      if (e instanceof CallActiveConflictError) throw new RoomCallConflictError();
      throw e;
    }
  }

  findCall(callId: string): Promise<RoomCall | null> {
    return this.k.deps.repo.findById(callId);
  }

  listParticipants(callId: string): Promise<RoomParticipant[]> {
    return this.k.deps.repo.findParticipants(callId);
  }

  findParticipant(callId: string, userId: string): Promise<RoomParticipant | null> {
    return this.k.deps.repo.findParticipant(callId, userId);
  }

  async connectedSecondsByUser(meetingId: string, userIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const userId of userIds) {
      let total = 0;
      let cursor: { at: Date; id: string } | undefined;
      for (let page = 0; page < 5; page += 1) {
        const rows = await this.k.deps.repo.listHistory(userId, { filter: "all", scopeType: "MEETING", scopeId: meetingId, cursor, limit: 100 });
        const slice = rows.slice(0, 100);
        total += slice.reduce((sum, p) => sum + p.connectedSeconds, 0);
        const last = slice[slice.length - 1];
        if (rows.length <= 100 || !last) break;
        cursor = { at: last.callStartedAt, id: last.id };
      }
      out.set(userId, total);
    }
    return out;
  }

  enter(req: EnterRequest): Promise<EnterResult> {
    return enterRoom(this.k, req);
  }

  /** Khoá `call:busy` được giữ TRƯỚC khi hàng `Call` commit — chờ ngắn cho hàng xuất hiện rồi mới coi là mồ côi (như `waitForCall` của calls). */
  private async waitFor(callId: string) {
    for (let i = 0; i < 10; i += 1) {
      const call = await this.k.deps.repo.findById(callId);
      if (call) return call;
      await sleep(50);
    }
    return null;
  }

  async claimBusy(user: AuthUser, callId: string, force: boolean): Promise<void> {
    const { store, repo } = this.k.deps;
    for (let i = 0; i < 3; i += 1) {
      const res = await store.acquireBusy(user.id, callId);
      if (res.acquired) return;
      const other = await this.waitFor(res.existing);
      const stillIn = other && other.status !== "ENDED" ? await repo.findParticipant(other.id, user.id) : null;
      const live = !!other && !!stillIn && (isConnectedLike(stillIn.state) || (user.id === other.initiatorId && other.status === "RINGING"));
      if (!live || !other) {
        await store.releaseBusyIf(user.id, res.existing); // khoá mồ côi: dọn rồi thử lại
        continue;
      }
      if (!force) throw err(ErrorCode.CALL_004, 409, { activeCallId: other.id, activeCall: { id: other.id, scopeType: other.scopeType } });
      if (other.mode === "ROOM") await this.k.rooms.leave(user, other.id, { endForEveryone: false });
      else await this.k.ends.leave(user, other.id);
    }
    throw err(ErrorCode.CALL_004, 409);
  }

  async releaseBusy(userId: string, callId: string): Promise<void> {
    await this.k.deps.store.releaseBusy(userId, callId).catch(() => false);
  }

  async issueToken(user: AuthUser, callId: string): Promise<{ token: string; livekitUrl: string; expiresAt: string }> {
    const call = await this.k.deps.repo.findById(callId);
    const me = call ? await this.k.deps.repo.findParticipant(callId, user.id) : null;
    if (!call || call.status === "ENDED") throw err(ErrorCode.CALL_005, 410);
    if (!me) throw err(ErrorCode.CALL_014, 403);
    return this.k.deps.tokens.issueFor(user, call, me);
  }

  async leave(user: AuthUser, callId: string): Promise<void> {
    await this.k.ends.leave(user, callId);
  }

  endCall(callId: string, reason: CallEndReason, actorId: string | null): Promise<RoomCall | null> {
    return this.k.ends.endCall(callId, reason, actorId);
  }

  removeParticipant(callId: string, userId: string, removedBy: string | null): Promise<boolean> {
    return this.k.ends.removeParticipant(callId, userId, removedBy);
  }

  /** CAS participant + tín hiệu `participant-changed` (một transaction) — `null` khi không còn trong phòng/lệch version. */
  private patchParticipant(callId: string, userId: string, patch: { role?: RoomRole; mutedByHost?: boolean; publishPermissions?: PublishPermissionsDto }): Promise<RoomParticipant | null> {
    const d = this.k.deps;
    return d.tx.run(async (tx) => {
      const [call, p] = await Promise.all([d.repo.findById(callId, tx), d.repo.findParticipant(callId, userId, tx)]);
      if (!call || call.status === "ENDED" || !p || !isConnectedLike(p.state)) return null;
      const updated = await d.repo.updateParticipant(tx, callId, userId, { version: p.version }, patch);
      if (!updated) return null;
      await d.outbox.add(tx, callEvents.participantChanged(callId, call.version, userId, updated.state, updated.version));
      return updated;
    });
  }

  setRole(callId: string, userId: string, role: RoomRole): Promise<RoomParticipant | null> {
    return this.patchParticipant(callId, userId, { role });
  }

  setMutedByHost(callId: string, userId: string, muted: boolean): Promise<RoomParticipant | null> {
    return this.patchParticipant(callId, userId, { mutedByHost: muted });
  }

  setPublishPermissions(callId: string, userId: string, publish: PublishPermissionsDto): Promise<RoomParticipant | null> {
    return this.patchParticipant(callId, userId, { publishPermissions: publish });
  }

  withCallLock<T>(callId: string, fn: () => Promise<T>): Promise<T> {
    return this.k.deps.store.withLock(callId, fn, { retries: 60, delayMs: 40 });
  }

  scheduleReconcile(callId: string, delayMs: number): Promise<void> {
    return this.k.deps.jobs.scheduleReconcile(callId, delayMs);
  }

  reconcile(callId: string): Promise<void> {
    return this.k.reconcile.reconcile(callId);
  }

  async acquireScreen(callId: string, userId: string): Promise<{ acquired: true } | { acquired: false; holder: string }> {
    const res = await this.k.deps.store.acquireScreen(callId, userId);
    return res.acquired ? { acquired: true } : { acquired: false, holder: res.existing };
  }

  releaseScreen(callId: string, userId: string): Promise<boolean> {
    return this.k.deps.store.releaseScreen(callId, userId).catch(() => false);
  }

  async isRemoved(callId: string, userId: string): Promise<boolean> {
    return (await this.k.deps.repo.findParticipant(callId, userId))?.state === "REMOVED";
  }
}
