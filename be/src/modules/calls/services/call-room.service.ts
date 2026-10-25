import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { roomNames } from "../../../infrastructure/media";
import { logger } from "../../../infrastructure/logger";
import { callSetupTotal } from "../../../infrastructure/metrics/call.metrics";
import type { CreateCallDto, JoinCallDto, LeaveRoomDto } from "../dtos";
import type { CallEntity, CallParticipantEntity, CreateCallResult } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import { CallActiveConflictError } from "../repositories/call.repository.interface";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import type { CallHostService } from "./call-host.service";
import type { CallResponseService } from "./call-response.service";
import { callError, type ResolvedCallScope } from "./call-scope.resolver";
import { isConnectedLike } from "./call-state.machine";
import { waitForCall } from "./call-wait";

const LOCK = { retries: 60, delayMs: 40 } as const;
/** Phòng mới tạo chưa kịp có ai `CONNECTED` (webhook chậm) vẫn là phòng THẬT trong khoảng này — không coi là mồ côi. */
const FRESH_ROOM_MS = 60_000;

/**
 * `CallRoomService` (p2-03 be.md §5.2, §5.3) — tạo/vào phòng thoại kênh VOICE (`mode = ROOM`, không đổ chuông) và rời phòng.
 * Dùng lại nền p2-01: hai tầng chống trùng (`call:active` Redis + `Call.activeKey @unique`), `call:busy`, `call:lock`, outbox
 * `call.participant-changed`, `CallTokenService`. Khác RING: người tạo là HOST, phòng ACTIVE ngay, ai có `channel.read` đều vào
 * được, trần chỗ = min(`voiceSettings.maxParticipants`, `LIMITS.voice.maxParticipants`), `force` để chuyển thiết bị/cuộc gọi.
 */
export class CallRoomService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService,
    private readonly responses: CallResponseService,
    private readonly host: CallHostService
  ) {}

  // ── tạo / vào ──────────────────────────────────────────────────────────────

  /** `POST /calls { scopeType: CHANNEL }` sau khi `resolveChannel` đã kiểm quyền/loại kênh/lưu trữ. */
  async createOrJoin(user: AuthUser, dto: CreateCallDto, scope: ResolvedCallScope): Promise<CreateCallResult> {
    const callId = newObjectId();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await this.d.store.acquireActive(scope.scopeType, scope.scopeId, callId);
      if (res.acquired) return this.createRoom(user, dto, scope, callId);
      // Khoá có thể do người khác đang tạo (chưa commit) — chờ hàng `Call` xuất hiện trước khi coi là mồ côi.
      const existing = await waitForCall(this.d.repo, res.existing);
      if (existing && existing.status !== "ENDED") {
        const participants = await this.d.repo.findParticipants(existing.id);
        if (this.isLiveRoom(existing, participants)) return this.enter(user, existing, dto.deviceId, dto.force === true, scope);
        // Phòng trống (mọi người đã rời/không ai kết nối được) nhưng chưa được đóng: đóng `EMPTY` (thời lượng tới lúc người cuối rời,
        // không phát sinh tin tóm tắt rác) rồi người vào sau mở phiên MỚI làm chủ phòng.
        await this.ends.endCall(existing.id, "EMPTY", null);
      }
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, res.existing); // DB đã ENDED/không có: khoá thừa
    }
    throw callError(ErrorCode.CALL_011, 409);
  }

  /** `POST /calls/:id/join` cho phòng ROOM. */
  async join(user: AuthUser, call: CallEntity, dto: JoinCallDto): Promise<CreateCallResult> {
    const scope = await this.d.scopes.resolveChannel(user, call.scopeId, call.mediaKind);
    return this.enter(user, call, dto.deviceId, dto.force === true, scope);
  }

  private isLiveRoom(call: CallEntity, participants: CallParticipantEntity[]): boolean {
    return participants.some((p) => isConnectedLike(p.state)) || this.d.now().getTime() - call.startedAt.getTime() <= FRESH_ROOM_MS;
  }

  private async createRoom(user: AuthUser, dto: CreateCallDto, scope: ResolvedCallScope, callId: string): Promise<CreateCallResult> {
    const release = async (): Promise<void> => {
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, callId).catch(() => false);
      await this.d.store.releaseBusy(user.id, callId).catch(() => false);
    };
    try {
      await this.acquireBusy(user, callId, dto.force === true);
    } catch (err) {
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, callId).catch(() => false);
      throw err;
    }
    try {
      await this.d.media().createRoom({
        name: roomNames.call(callId),
        emptyTimeoutSeconds: LIMITS.voice.emptyRoomEndSeconds,
        maxParticipants: scope.maxParticipants,
      });
      const now = this.d.now();
      const call = await this.d.tx.run(async (tx) => {
        const created = await this.d.repo.createCall(tx, {
          id: callId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          workspaceId: scope.workspaceId,
          mode: "ROOM",
          mediaKind: dto.mediaKind,
          status: "ACTIVE",
          initiatorId: user.id,
          hostId: user.id,
          livekitRoom: roomNames.call(callId),
          clientCallId: dto.clientCallId,
          activeKey: `${scope.scopeType}:${scope.scopeId}`,
          invitedCount: 0,
          startedAt: now,
          answeredAt: now,
        });
        await this.d.repo.createParticipants(tx, [
          {
            callId,
            userId: user.id,
            role: "HOST",
            state: "JOINING",
            respondedAt: now,
            respondedDeviceId: dto.deviceId,
            joiningAt: now,
            publishPermissions: { audio: true, video: scope.allowVideo, screen: false },
            callStartedAt: now,
            scopeType: scope.scopeType,
            scopeId: scope.scopeId,
            mediaKind: dto.mediaKind,
            mode: "ROOM",
          },
        ]);
        await this.d.outbox.add(tx, callEvents.participantChanged(callId, created.version, user.id, "JOINING", 1));
        return created;
      });
      await this.d.store.promoteActive(scope.scopeType, scope.scopeId, callId).catch(() => false);
      callSetupTotal.inc({ mode: "ROOM", result: "created" });
      const me = await this.d.repo.findParticipant(callId, user.id);
      try {
        const token = me ? await this.d.tokens.issueFor(user, call, me) : undefined;
        return { call, joined: false, created: true, token };
      } catch (err) {
        await this.ends.endCall(callId, "FAILED", user.id).catch(() => null);
        throw err;
      }
    } catch (err) {
      const committed = await this.d.repo.findById(callId);
      if (!committed) await release(); // chưa commit: nhả khoá; đã commit thì `endCall` (nhánh trên) lo nhả
      if (err instanceof CallActiveConflictError) return this.recoverFromConflict(user, dto, scope, err);
      throw err;
    }
  }

  /** `activeKey` trùng (Redis mất khoá) hoặc `clientCallId` trùng đồng thời → vào phòng đang có / replay. */
  private async recoverFromConflict(user: AuthUser, dto: CreateCallDto, scope: ResolvedCallScope, err: CallActiveConflictError): Promise<CreateCallResult> {
    if (err.field === "clientCallId") {
      const again = await this.d.repo.findByInitiatorClientId(user.id, dto.clientCallId);
      if (again) return { call: again, joined: false, created: false };
    }
    const [open] = await this.d.repo.findOpenByScope(scope.scopeType, [scope.scopeId]);
    if (!open) throw callError(ErrorCode.CALL_011, 409);
    return this.enter(user, open, dto.deviceId, dto.force === true, scope);
  }

  /** Vào phòng đang có (be.md §5.2 bước 3, 5, 6). */
  private async enter(user: AuthUser, call: CallEntity, deviceId: string, force: boolean, scope: ResolvedCallScope): Promise<CreateCallResult> {
    const before = await this.d.repo.findParticipants(call.id);
    const mine = before.find((p) => p.userId === user.id);
    if (mine?.state === "REMOVED") throw callError(ErrorCode.CALL_016, 403);

    if (mine && isConnectedLike(mine.state)) {
      if (mine.respondedDeviceId === deviceId) return this.granted(user, call.id, mine, false); // cùng thiết bị: chỉ cấp token mới
      if (!force) throw callError(ErrorCode.CALL_004, 409, { sameCallOtherDevice: true });
      return this.takeOverDevice(user, call, deviceId);
    }

    const others = before.filter((p) => p.userId !== user.id && isConnectedLike(p.state)).length;
    if (others + 1 > scope.maxParticipants) throw callError(ErrorCode.CALL_008, 409);
    await this.acquireBusy(user, call.id, force);

    const out: { call: CallEntity | null; participant: CallParticipantEntity | null; full: boolean } = { call: null, participant: null, full: false };
    await this.d.store.withLock(call.id, () =>
      this.d.tx.run(async (tx) => {
        out.call = null;
        out.participant = null;
        out.full = false;
        const cur = await this.d.repo.findById(call.id, tx);
        if (!cur || cur.status === "ENDED") return;
        const all = await this.d.repo.findParticipants(call.id, tx);
        const p = all.find((x) => x.userId === user.id);
        if (p?.state === "REMOVED") return;
        if (all.filter((x) => x.userId !== user.id && isConnectedLike(x.state)).length + 1 > scope.maxParticipants) {
          out.full = true;
          return;
        }
        const now = this.d.now();
        let participantVersion = 1;
        if (!p) {
          await this.d.repo.createParticipants(tx, [
            {
              callId: call.id,
              userId: user.id,
              role: "MEMBER",
              state: "JOINING",
              respondedAt: now,
              respondedDeviceId: deviceId,
              joiningAt: now,
              publishPermissions: { audio: true, video: scope.allowVideo, screen: false },
              callStartedAt: cur.startedAt,
              scopeType: cur.scopeType,
              scopeId: cur.scopeId,
              mediaKind: cur.mediaKind,
              mode: cur.mode,
            },
          ]);
        } else {
          const updated = await this.d.repo.updateParticipant(tx, call.id, user.id, { version: p.version }, {
            state: "JOINING",
            respondedAt: now,
            respondedDeviceId: deviceId,
            joiningAt: now,
            handRaisedAt: null,
            publishPermissions: { ...p.publishPermissions, video: scope.allowVideo, screen: false },
          });
          if (!updated) throw callError(ErrorCode.CALL_011, 409);
          participantVersion = updated.version;
        }
        await this.d.outbox.add(tx, callEvents.participantChanged(call.id, cur.version, user.id, "JOINING", participantVersion));
        out.call = cur;
        out.participant = await this.d.repo.findParticipant(call.id, user.id, tx);
      }),
      LOCK
    );

    if (!out.call || !out.participant) {
      await this.d.store.releaseBusy(user.id, call.id).catch(() => false);
      const fresh = await this.d.repo.findParticipant(call.id, user.id);
      if (fresh?.state === "REMOVED") throw callError(ErrorCode.CALL_016, 403);
      throw callError(out.full ? ErrorCode.CALL_008 : ErrorCode.CALL_005, out.full ? 409 : 410);
    }
    callSetupTotal.inc({ mode: "ROOM", result: "joined" });
    logger.info("[calls] Vào phòng thoại kênh", { callId: call.id });
    return this.granted(user, call.id, out.participant, true, out.call);
  }

  /** `force` cùng phòng, thiết bị khác: máy cũ bị đá (`DUPLICATE_IDENTITY`), giữ participant, cấp token cho máy mới. */
  private async takeOverDevice(user: AuthUser, call: CallEntity, deviceId: string): Promise<CreateCallResult> {
    const out: { participant: CallParticipantEntity | null } = { participant: null };
    await this.d.store.withLock(call.id, () =>
      this.d.tx.run(async (tx) => {
        out.participant = null;
        const cur = await this.d.repo.findParticipant(call.id, user.id, tx);
        if (!cur || !isConnectedLike(cur.state)) return;
        const now = this.d.now();
        out.participant = await this.d.repo.updateParticipant(tx, call.id, user.id, { version: cur.version }, {
          state: "JOINING",
          respondedDeviceId: deviceId,
          joiningAt: now,
        });
      }),
      LOCK
    );
    if (!out.participant) throw callError(ErrorCode.CALL_011, 409);
    await this.d.media().removeParticipant(call.livekitRoom, user.id).catch((err: unknown) =>
      logger.warn("[calls] Không đá được thiết bị cũ (non-fatal)", { callId: call.id, error: err instanceof Error ? err.message : String(err) })
    );
    return this.granted(user, call.id, out.participant, true);
  }

  private async granted(user: AuthUser, callId: string, participant: CallParticipantEntity, joined: boolean, known?: CallEntity): Promise<CreateCallResult> {
    const call = known ?? (await this.d.repo.findById(callId));
    if (!call || call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call?.endReason ?? null });
    return { call, joined, created: false, token: await this.d.tokens.issueFor(user, call, participant) };
  }

  /**
   * `call:busy` cho phòng (be.md §5.2 bước 3). Khoá của cuộc gọi khác còn sống: không `force` → 409 `CALL_004`
   * `{ activeCall }`; `force` → rời cuộc gọi cũ (RING hoặc ROOM) rồi lấy lại. Khoá mồ côi được dọn.
   */
  private async acquireBusy(user: AuthUser, callId: string, force: boolean): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
      const res = await this.d.store.acquireBusy(user.id, callId);
      if (res.acquired) return;
      const other = await waitForCall(this.d.repo, res.existing);
      const stillIn = other && other.status !== "ENDED" ? await this.d.repo.findParticipant(other.id, user.id) : null;
      const live = !!other && !!stillIn && (isConnectedLike(stillIn.state) || (user.id === other.initiatorId && other.status === "RINGING"));
      if (!live || !other) {
        await this.d.store.releaseBusyIf(user.id, res.existing);
        continue;
      }
      if (!force) {
        const info = await this.d.scopes.scopeInfo(user.id, other, []);
        throw callError(ErrorCode.CALL_004, 409, { activeCall: { id: other.id, scopeType: other.scopeType, scopeTitle: info.title }, activeCallId: other.id });
      }
      if (other.mode === "ROOM") await this.leave(user, other.id, { endForEveryone: false });
      else await this.ends.leave(user, other.id);
    }
    await this.responses.acquireBusyOrThrow(user.id, callId); // hết lượt thử: để p2-01 quyết định (CALL_004)
  }

  // ── rời phòng ──────────────────────────────────────────────────────────────

  /**
   * `POST /calls/:id/leave` cho phòng ROOM (be.md §5.3). Người thường: như p2-01. Chủ phòng: `endForEveryone` → kết thúc;
   * `transferToUserId` → chuyển chủ trước khi rời; không chọn → rời rồi failover NGAY (delay 0, không chờ grace).
   */
  async leave(user: AuthUser, callId: string, dto: LeaveRoomDto): Promise<CallEntity> {
    const call = await this.d.repo.findById(callId);
    const me = call ? await this.d.repo.findParticipant(callId, user.id) : null;
    if (!call || !me) throw callError(ErrorCode.CALL_014, 403);
    if (call.status === "ENDED" || !isConnectedLike(me.state)) return call;

    if (call.hostId !== user.id) return this.ends.leave(user, callId);

    if (dto.endForEveryone) {
      await this.ends.endCall(callId, "HOST_ENDED", user.id);
      return (await this.d.repo.findById(callId)) ?? call;
    }
    let transferred = false;
    if (dto.transferToUserId) {
      if (dto.transferToUserId === user.id) throw callError(ErrorCode.CALL_019, 400);
      transferred = (await this.host.transferOnLeave(call, user.id, dto.transferToUserId)) !== null;
    }
    const after = await this.ends.leave(user, callId);
    if (!transferred && after.status !== "ENDED") {
      const cur = (await this.d.repo.findById(callId)) ?? after;
      if (cur.hostId === user.id) await this.d.jobs.scheduleHostFailover?.(callId, cur.version, 0).catch(() => undefined);
    }
    return after;
  }
}
