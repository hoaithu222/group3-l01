/**
 * ĐIỂM NỐI DUY NHẤT của `pomodoro` với `modules/calls` (p2-01 lõi cuộc gọi, p2-03 phòng ROOM): phòng Pomodoro là một `Call`
 * (`scopeType CHANNEL`, `mode ROOM`) nên trạng thái người tham gia, khoá nóng `call:*`, kết thúc phòng (`endCall`) và cấp token do `calls`
 * sở hữu — file này chỉ GỌI LẠI qua barrel `@modules/calls` (`getCallsContainer()`), không sửa lõi. Ngoài barrel chỉ import các hàm/kiểu THUẦN
 * của chính `calls` (`callEvents`, `CallActiveConflictError`, `isConnectedLike`, `CallRoomPermissions`) — cùng mẫu `meetings/adapters/calls-room.adapter.ts`.
 * Mọi nơi khác trong `pomodoro` chỉ biết cổng `PomodoroCallPort` (`services/pomodoro.ports.ts`).
 *
 * Vì sao Pomodoro không đi `POST /calls`: `CallScopeService.resolveChannel` chỉ nhận kênh VOICE (`CALL_013`), nên kênh POMODORO tự tạo/vào
 * phòng bằng `POST /channels/:id/pomodoro/join` (đúng khuôn `CallRoomService.createRoom/enter`), còn rời phòng/gia hạn token vẫn dùng
 * `POST /calls/:id/leave|token` của lõi (chạy theo `callId`, không kiểm loại kênh).
 */
import type { CallEndReason } from "@prisma/client";
import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { MediaTrackSource } from "../../../infrastructure/media";
import { getCallsContainer, type CallsContainer } from "../../calls";
import { callEvents } from "../../calls/events/call-outbox.events";
import { CallActiveConflictError } from "../../calls/repositories/call.repository.interface";
import { CallRoomPermissions } from "../../calls/services/call-room-permissions";
import { isConnectedLike } from "../../calls/services/call-state.machine";
import type { PomodoroEndReason } from "../entities/pomodoro.interface";
import type { TxHandle } from "../repositories/tx";
import {
  RoomCallConflictError,
  type ActiveLock,
  type CreateRoomCallInput,
  type EnterRequest,
  type EnterResult,
  type PomodoroCall,
  type PomodoroCallPort,
  type PomodoroParticipant,
} from "../services/pomodoro.ports";

const LOCK = { retries: 60, delayMs: 40 } as const;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const callError = (code: typeof ErrorCode.CALL_004 | typeof ErrorCode.CALL_005 | typeof ErrorCode.CALL_014 | typeof ErrorCode.CALL_011, status: 409 | 403 | 410, details?: unknown): AppError =>
  new AppError(ErrorMessages[code], status, code, details);

/** Lý do kết thúc phiên Pomodoro → lý do kết thúc `Call` (điểm DUY NHẤT đổi `Call` sang ENDED là `CallEndService.endCall`). */
const CALL_END_REASON: Record<PomodoroEndReason, CallEndReason> = {
  HOST_ENDED: "HOST_ENDED",
  MANAGER_ENDED: "HOST_ENDED",
  EMPTY_ROOM: "EMPTY",
  CHANNEL_ARCHIVED: "ARCHIVED",
};

const toCall = (c: { id: string; livekitRoom: string; status: PomodoroCall["status"]; endReason: string | null; hostId: string | null; version: number; startedAt: Date }): PomodoroCall => ({
  id: c.id,
  livekitRoom: c.livekitRoom,
  status: c.status,
  endReason: c.endReason,
  hostId: c.hostId,
  version: c.version,
  startedAt: c.startedAt,
});

const toParticipant = (p: {
  userId: string;
  role: string;
  state: string;
  publishPermissions: PomodoroParticipant["publishPermissions"];
  mutedByHost: boolean;
  respondedDeviceId: string | null;
  firstJoinedAt: Date | null;
  version: number;
}): PomodoroParticipant => ({
  userId: p.userId,
  role: p.role,
  state: p.state,
  publishPermissions: { ...p.publishPermissions },
  mutedByHost: p.mutedByHost,
  respondedDeviceId: p.respondedDeviceId,
  firstJoinedAt: p.firstJoinedAt,
  version: p.version,
});

export class CallsRoomAdapter implements PomodoroCallPort {
  /** Lấy container LƯỜI — test đổi `setCallsContainerForTests` sau khi dựng adapter vẫn đúng. */
  constructor(private readonly kit: () => CallsContainer = getCallsContainer) {}

  private get k(): CallsContainer {
    return this.kit();
  }

  acquireActive(channelId: string, callId: string): Promise<ActiveLock> {
    return this.k.deps.store.acquireActive("CHANNEL", channelId, callId);
  }

  promoteActive(channelId: string, callId: string): Promise<boolean> {
    return this.k.deps.store.promoteActive("CHANNEL", channelId, callId).catch(() => false);
  }

  releaseActive(channelId: string, callId: string): Promise<boolean> {
    return this.k.deps.store.releaseActive("CHANNEL", channelId, callId).catch(() => false);
  }

  async createRoomCall(tx: TxHandle, i: CreateRoomCallInput): Promise<PomodoroCall> {
    const now = this.k.deps.now();
    try {
      const created = await this.k.deps.repo.createCall(tx, {
        id: i.callId,
        scopeType: "CHANNEL",
        scopeId: i.channelId,
        workspaceId: i.workspaceId,
        mode: "ROOM",
        mediaKind: "VIDEO",
        status: "ACTIVE",
        initiatorId: i.initiatorId,
        hostId: i.hostId,
        livekitRoom: i.livekitRoom,
        clientCallId: `pomodoro:${i.channelId}:${i.callId}`,
        activeKey: `CHANNEL:${i.channelId}`,
        invitedCount: 0,
        startedAt: now,
        answeredAt: now,
      });
      return toCall(created);
    } catch (e) {
      if (e instanceof CallActiveConflictError) throw new RoomCallConflictError();
      throw e;
    }
  }

  async findCall(callId: string): Promise<PomodoroCall | null> {
    const c = await this.k.deps.repo.findById(callId);
    return c ? toCall(c) : null;
  }

  /** Khoá `call:active` được giữ TRƯỚC khi hàng `Call` commit — chờ ngắn cho hàng xuất hiện (như `waitForCall` của calls) trước khi coi là mồ côi. */
  async awaitCall(callId: string): Promise<PomodoroCall | null> {
    for (let i = 0; i < 10; i += 1) {
      const c = await this.findCall(callId);
      if (c) return c;
      await sleep(50);
    }
    return null;
  }

  async findOpenCall(channelId: string): Promise<PomodoroCall | null> {
    const [open] = await this.k.deps.repo.findOpenByScope("CHANNEL", [channelId]);
    return open ? toCall(open) : null;
  }

  async listParticipants(callId: string): Promise<PomodoroParticipant[]> {
    return (await this.k.deps.repo.findParticipants(callId)).map(toParticipant);
  }

  async findParticipant(callId: string, userId: string): Promise<PomodoroParticipant | null> {
    const p = await this.k.deps.repo.findParticipant(callId, userId);
    return p ? toParticipant(p) : null;
  }

  /** Vào phòng NGUYÊN TỬ (khuôn `CallRoomService.enter`): đọc-quyết-định-ghi nằm TRONG `call:lock` + transaction — hai người tranh chỗ cuối chỉ MỘT thắng. */
  async enter(r: EnterRequest): Promise<EnterResult> {
    const d = this.k.deps;
    const out: { result: EnterResult | null; kickRoom: string | null } = { result: null, kickRoom: null };
    await d.store.withLock(
      r.callId,
      () =>
        d.tx.run(async (tx) => {
          out.result = null;
          out.kickRoom = null;
          const call = await d.repo.findById(r.callId, tx);
          if (!call || call.status === "ENDED") {
            out.result = { kind: "ENDED" };
            return;
          }
          const all = await d.repo.findParticipants(r.callId, tx);
          const mine = all.find((p) => p.userId === r.userId);
          if (mine?.state === "REMOVED") {
            out.result = { kind: "BLOCKED" };
            return;
          }
          const connectedNow = !!mine && isConnectedLike(mine.state);
          let kicked = false;
          if (mine && connectedNow && mine.respondedDeviceId && mine.respondedDeviceId !== r.deviceId) {
            if (!r.force) {
              out.result = { kind: "OTHER_DEVICE" };
              return;
            }
            kicked = true;
          }
          if (!connectedNow && all.filter((p) => p.userId !== r.userId && isConnectedLike(p.state)).length + 1 > r.maxParticipants) {
            out.result = { kind: "FULL" };
            return;
          }
          const now = d.now();
          let version = 1;
          if (!mine) {
            await d.repo.createParticipants(tx, [
              {
                callId: r.callId,
                userId: r.userId,
                role: r.role,
                state: "JOINING",
                respondedAt: now,
                respondedDeviceId: r.deviceId,
                joiningAt: now,
                publishPermissions: r.publish,
                callStartedAt: call.startedAt,
                scopeType: call.scopeType,
                scopeId: call.scopeId,
                mediaKind: call.mediaKind,
                mode: call.mode,
              },
            ]);
          } else {
            const updated = await d.repo.updateParticipant(tx, r.callId, r.userId, { version: mine.version }, {
              role: r.role,
              state: "JOINING",
              respondedAt: now,
              respondedDeviceId: r.deviceId,
              joiningAt: now,
              handRaisedAt: null,
              publishPermissions: r.publish,
            });
            if (!updated) throw callError(ErrorCode.CALL_011, 409);
            version = updated.version;
          }
          await d.outbox.add(tx, callEvents.participantChanged(r.callId, call.version, r.userId, "JOINING", version));
          const participant = await d.repo.findParticipant(r.callId, r.userId, tx);
          if (!participant) throw callError(ErrorCode.CALL_011, 409);
          out.result = { kind: "OK", participant: toParticipant(participant), rejoined: !!mine?.firstJoinedAt };
          out.kickRoom = kicked ? call.livekitRoom : null;
        }),
      LOCK
    );
    if (out.kickRoom) await d.media().removeParticipant(out.kickRoom, r.userId).catch(() => undefined); // máy cũ nhận DUPLICATE_IDENTITY
    return out.result ?? { kind: "ENDED" };
  }

  /** `call:busy` (khuôn `CallRoomService.acquireBusy`): khoá mồ côi được dọn; cuộc gọi khác còn sống: không `force` → `CALL_004`, `force` → rời cuộc cũ. */
  async claimBusy(user: AuthUser, callId: string, force: boolean): Promise<void> {
    const { store, repo } = this.k.deps;
    for (let i = 0; i < 3; i += 1) {
      const res = await store.acquireBusy(user.id, callId);
      if (res.acquired) return;
      const other = await this.awaitCall(res.existing);
      const stillIn = other && other.status !== "ENDED" ? await repo.findParticipant(other.id, user.id) : null;
      if (!other || !stillIn || !isConnectedLike(stillIn.state)) {
        await store.releaseBusyIf(user.id, res.existing);
        continue;
      }
      if (other.id === callId) return; // đang ở CHÍNH phòng này (thiết bị khác): `enter` quyết định `OTHER_DEVICE`/đá máy cũ
      if (!force) throw callError(ErrorCode.CALL_004, 409, { activeCallId: other.id, activeCall: { id: other.id } });
      await this.k.rooms.leave(user, other.id, { endForEveryone: false });
    }
    throw callError(ErrorCode.CALL_004, 409);
  }

  async releaseBusy(userId: string, callId: string): Promise<void> {
    await this.k.deps.store.releaseBusy(userId, callId).catch(() => false);
  }

  async issueToken(user: AuthUser, callId: string): Promise<{ token: string; livekitUrl: string; expiresAt: string }> {
    const call = await this.k.deps.repo.findById(callId);
    const me = call ? await this.k.deps.repo.findParticipant(callId, user.id) : null;
    if (!call || call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410);
    if (!me) throw callError(ErrorCode.CALL_014, 403);
    return this.k.deps.tokens.issueFor(user, call, me);
  }

  async buildCallDto(user: AuthUser, callId: string): Promise<unknown> {
    const call = await this.k.deps.repo.findById(callId);
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    return this.k.query.buildDto(user, call);
  }

  async endCall(callId: string, reason: PomodoroEndReason, actorId: string | null): Promise<void> {
    await this.k.ends.endCall(callId, CALL_END_REASON[reason], actorId);
  }

  /** CAS participant (thử lại một lần khi `markJoined` của reconcile chen vào). Không phát `participant-changed`: quyền phát không phải thông tin client vẽ. */
  async setPublish(callId: string, userId: string, publish: PomodoroParticipant["publishPermissions"]): Promise<PomodoroParticipant | null> {
    const { repo } = this.k.deps;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const p = await repo.findParticipant(callId, userId);
      if (!p || p.state === "REMOVED" || p.state === "LEFT") return null;
      const same = p.publishPermissions.audio === publish.audio && p.publishPermissions.video === publish.video && p.publishPermissions.screen === publish.screen;
      if (same) return toParticipant(p);
      const updated = await repo.updateParticipant(undefined, callId, userId, { version: p.version }, { publishPermissions: publish });
      if (updated) return toParticipant(updated);
    }
    return null;
  }

  baseSources(p: PomodoroParticipant): MediaTrackSource[] {
    return CallRoomPermissions.sources({ publishPermissions: p.publishPermissions, mutedByHost: p.mutedByHost });
  }
}
