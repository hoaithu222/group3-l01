import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { roomNames } from "../../../infrastructure/media";
import { logger } from "../../../infrastructure/logger";
import { callSetupTotal } from "../../../infrastructure/metrics/call.metrics";
import type { CreateCallDto, JoinCallDto } from "../dtos";
import type { CallEntity, CallParticipantEntity, CreateCallResult, NewParticipant } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import { CallActiveConflictError } from "../repositories/call.repository.interface";
import type { TxHandle } from "../repositories/tx";
import type { CallDeps, CallRuntimeLimits } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import type { CallRoomService } from "./call-room.service";
import type { CallResponseService } from "./call-response.service";
import { callError, type ResolvedCallScope } from "./call-scope.resolver";
import { isConnectedLike, isRealCall, isRingingLike } from "./call-state.machine";
import { waitForCall } from "./call-wait";

export type { CreateCallResult };

const LOCK = { retries: 60, delayMs: 40 } as const;

/**
 * `CallRingService` — tạo cuộc gọi RING (1-1/nhóm) và tham gia cuộc đang có (be.md §5.2, §5.3). Hai tầng chống trùng:
 * Redis `SET NX call:active:<scope>` rồi Mongo `Call.activeKey @unique` (Redis mất khoá vẫn không tạo được cuộc thứ hai).
 */
export class CallRingService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService,
    private readonly responses: CallResponseService,
    /** (p2-03) Phòng thoại kênh — `scope.mode === "ROOM"` đi nhánh này thay vì đổ chuông. */
    private readonly rooms?: CallRoomService
  ) {}

  async create(user: AuthUser, dto: CreateCallDto): Promise<CreateCallResult> {
    const replay = await this.d.repo.findByInitiatorClientId(user.id, dto.clientCallId);
    if (replay) return this.replay(user, replay);

    const scope = await this.d.scopes.resolveForCreate(user, dto.scopeType, dto.scopeId, dto.mediaKind);
    if (scope.mode === "ROOM") {
      if (!this.rooms) throw callError(ErrorCode.CALL_013, 400);
      return this.rooms.createOrJoin(user, dto, scope);
    }
    if (scope.mode !== "RING") throw callError(ErrorCode.CALL_013, 400);

    const limits = await this.d.limits();
    const callId = newObjectId();
    const existing = await this.acquireScope(scope, callId, limits);
    if (existing) return this.joinExisting(user, existing, dto.deviceId);

    try {
      await this.responses.acquireBusyOrThrow(user.id, callId);
    } catch (err) {
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, callId).catch(() => false);
      throw err;
    }
    try {
      return await this.createRinging(user, dto, scope, callId, limits);
    } catch (err) {
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, callId).catch(() => false);
      await this.d.store.releaseBusy(user.id, callId).catch(() => false);
      if (err instanceof CallActiveConflictError) return this.recoverFromConflict(user, dto, scope, err);
      throw err;
    }
  }

  /** `SET NX call:active` (tối đa 2 lượt: khoá mồ côi được dọn rồi thử lại). Trả cuộc gọi THẬT đang có, hoặc `null` khi đã giữ được khoá. */
  private async acquireScope(scope: ResolvedCallScope, callId: string, limits: CallRuntimeLimits): Promise<CallEntity | null> {
    const staleRingMs = (limits.ringTimeoutSeconds + limits.staleRingGraceSeconds) * 1000;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await this.d.store.acquireActive(scope.scopeType, scope.scopeId, callId);
      if (res.acquired) return null;
      // Khoá có thể được giữ bởi người đang tạo (chưa commit) — chờ hàng `Call` xuất hiện trước khi coi là mồ côi.
      const existing = await waitForCall(this.d.repo, res.existing);
      if (existing && existing.status !== "ENDED") {
        const participants = await this.d.repo.findParticipants(existing.id);
        if (isRealCall(existing, participants, this.d.now(), staleRingMs)) return existing;
        await this.ends.endCall(existing.id, "FAILED", null); // mồ côi: DB còn nhưng không ai trong cuộc
      }
      await this.d.store.releaseActive(scope.scopeType, scope.scopeId, res.existing); // DB đã ENDED/không có: khoá thừa
    }
    throw callError(ErrorCode.CALL_011, 409);
  }

  private async createRinging(user: AuthUser, dto: CreateCallDto, scope: ResolvedCallScope, callId: string, limits: CallRuntimeLimits): Promise<CreateCallResult> {
    const busy = await this.resolveBusy(scope.ringIds);
    const allBusy = scope.ringIds.length > 0 && scope.ringIds.every((id) => busy.has(id));
    if (!allBusy) {
      await this.d.media().createRoom({ name: roomNames.call(callId), emptyTimeoutSeconds: 60, maxParticipants: limits.maxParticipants });
    }

    const now = this.d.now();
    const base = { callId, scopeType: scope.scopeType, scopeId: scope.scopeId, mediaKind: dto.mediaKind, mode: "RING" as const, callStartedAt: now };
    const publishPermissions = { audio: true, video: dto.mediaKind === "VIDEO", screen: false };
    const participants: NewParticipant[] = [
      { ...base, userId: user.id, role: "INITIATOR", state: "JOINING", respondedAt: now, respondedDeviceId: dto.deviceId, joiningAt: now, publishPermissions },
      ...scope.ringIds.map<NewParticipant>((userId) => ({
        ...base,
        userId,
        role: "MEMBER",
        state: busy.has(userId) ? "BUSY" : "INVITED",
        invitedAt: now,
        invitedBy: user.id,
        publishPermissions,
      })),
    ];

    const call = await this.d.tx.run(async (tx) => {
      const created = await this.d.repo.createCall(tx, {
        id: callId,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        workspaceId: scope.workspaceId,
        mode: "RING",
        mediaKind: dto.mediaKind,
        status: "RINGING",
        initiatorId: user.id,
        hostId: null,
        livekitRoom: roomNames.call(callId),
        clientCallId: dto.clientCallId,
        activeKey: `${scope.scopeType}:${scope.scopeId}`,
        invitedCount: scope.ringIds.length,
        startedAt: now,
        answeredAt: null,
      });
      await this.d.repo.createParticipants(tx, participants);
      if (!allBusy) {
        await this.d.outbox.add(tx, callEvents.ringing(created, scope.ringIds.filter((id) => !busy.has(id)), scope.silentIds));
        await this.d.outbox.add(tx, callEvents.scheduleTimeout(callId, new Date(now.getTime() + limits.ringTimeoutSeconds * 1000)));
      }
      return created;
    });

    if (allBusy) {
      // Mọi người được gọi đều bận: kết thúc ngay (ENDED/BUSY), không token (CL-04).
      await this.ends.endCall(callId, "BUSY", null);
      callSetupTotal.inc({ mode: "RING", result: "busy" });
      return { call: (await this.d.repo.findById(callId)) ?? call, joined: false, created: true };
    }
    callSetupTotal.inc({ mode: "RING", result: "created" });
    const me = await this.d.repo.findParticipant(callId, user.id);
    try {
      const token = me ? await this.d.tokens.issueFor(user, call, me) : undefined;
      return { call, joined: false, created: true, token };
    } catch (err) {
      // Đã commit nhưng không cấp được token (media lỗi): kết thúc hẳn để callee không đổ chuông vô nghĩa và khoá được nhả.
      await this.ends.endCall(callId, "FAILED", user.id).catch(() => null);
      throw err;
    }
  }

  /** `activeKey` trùng (Redis mất khoá) hoặc `clientCallId` trùng đồng thời → chuyển sang tham gia/replay cuộc gọi đang có. */
  private async recoverFromConflict(user: AuthUser, dto: CreateCallDto, scope: ResolvedCallScope, err: CallActiveConflictError): Promise<CreateCallResult> {
    if (err.field === "clientCallId") {
      const again = await this.d.repo.findByInitiatorClientId(user.id, dto.clientCallId);
      if (again) return this.replay(user, again);
    }
    const [open] = await this.d.repo.findOpenByScope(scope.scopeType, [scope.scopeId]);
    if (!open) throw callError(ErrorCode.CALL_011, 409);
    return this.joinExisting(user, open, dto.deviceId);
  }

  /** Retry `POST /calls` cùng `clientCallId` (CL-09): cùng `callId`, token mới nếu còn trong cuộc gọi. */
  private async replay(user: AuthUser, call: CallEntity): Promise<CreateCallResult> {
    callSetupTotal.inc({ mode: call.mode, result: "replay" });
    if (call.status === "ENDED") return { call, joined: false, created: false };
    const me = await this.d.repo.findParticipant(call.id, user.id);
    if (!me || !isConnectedLike(me.state)) return { call, joined: false, created: false };
    return { call, joined: false, created: false, token: await this.d.tokens.issueFor(user, call, me) };
  }

  /** `userId → callId` đang bận, đã loại khoá MỒ CÔI (cuộc gọi đã kết thúc hoặc người đó không còn trong cuộc). */
  private async resolveBusy(userIds: string[]): Promise<Map<string, string>> {
    const raw = await this.d.store.peekBusy(userIds);
    if (raw.size === 0) return raw;
    const live = new Map<string, string>();
    for (const [userId, callId] of raw) {
      const call = await waitForCall(this.d.repo, callId); // khoá của cuộc gọi đang được tạo (chưa commit) ≠ khoá mồ côi
      const p = call && call.status !== "ENDED" ? await this.d.repo.findParticipant(callId, userId) : null;
      const busy = !!p && (isConnectedLike(p.state) || (call?.initiatorId === userId && call.status === "RINGING"));
      if (busy) live.set(userId, callId);
      else await this.d.store.releaseBusyIf(userId, callId).catch(() => false);
    }
    return live;
  }

  /** `POST /calls/:id/join` (be.md §5.3) và nhánh "tham gia cuộc đang có" của `create`. */
  async join(user: AuthUser, callId: string, dto: JoinCallDto): Promise<CreateCallResult> {
    const call = await this.d.repo.findById(callId);
    if (!call) throw callError(ErrorCode.CALL_005, 410);
    if (call.status === "ENDED") throw callError(ErrorCode.CALL_005, 410, { endReason: call.endReason });
    if (call.mode === "ROOM" && this.rooms) return this.rooms.join(user, call, dto);
    return this.joinExisting(user, call, dto.deviceId);
  }

  async joinExisting(user: AuthUser, call: CallEntity, deviceId: string): Promise<CreateCallResult> {
    if (call.scopeType === "MEETING") throw callError(ErrorCode.CALL_013, 400);
    if (!(await this.d.scopes.canStayInScope(user, call))) throw callError(ErrorCode.CALL_001, 404);
    const limits = await this.d.limits();
    const before = await this.d.repo.findParticipants(call.id);
    const mine = before.find((p) => p.userId === user.id);
    if (mine?.state === "REMOVED") throw callError(ErrorCode.CALL_016, 403);
    if (mine && isConnectedLike(mine.state)) {
      // Đã ở trong cuộc gọi: idempotent, chỉ cấp token mới — không cần khoá/ghi (giảm tranh chấp khi bấm gọi liên tục).
      const fresh = await this.d.repo.findById(call.id);
      if (fresh && fresh.status !== "ENDED") {
        callSetupTotal.inc({ mode: call.mode, result: "joined" });
        return { call: fresh, joined: true, created: false, token: await this.d.tokens.issueFor(user, fresh, mine) };
      }
    }
    const others = before.filter((p) => p.userId !== user.id && isConnectedLike(p.state)).length;
    if (!(mine && isConnectedLike(mine.state)) && others + 1 > limits.maxParticipants) throw callError(ErrorCode.CALL_008, 409);

    await this.responses.acquireBusyOrThrow(user.id, call.id);

    const out: { call: CallEntity | null; participant: CallParticipantEntity | null } = { call: null, participant: null };
    await this.d.store.withLock(call.id, () =>
      this.d.tx.run(async (tx) => {
        out.call = null;
        out.participant = null;
        const cur = await this.d.repo.findById(call.id, tx);
        if (!cur || cur.status === "ENDED") return;
        const p = await this.d.repo.findParticipant(call.id, user.id, tx);
        const now = this.d.now();
        if (p && isConnectedLike(p.state)) {
          out.call = cur;
          out.participant = p;
        } else if (p && isRingingLike(p.state)) {
          out.call = await this.responses.applyAnswer(tx, cur, p, deviceId, now);
          out.participant = await this.d.repo.findParticipant(call.id, user.id, tx);
        } else {
          out.call = await this.enterCall(tx, cur, p, user.id, deviceId, now);
          out.participant = await this.d.repo.findParticipant(call.id, user.id, tx);
        }
      }),
      LOCK
    );

    if (!out.call || !out.participant) {
      await this.d.store.releaseBusy(user.id, call.id).catch(() => false);
      throw callError(ErrorCode.CALL_005, 410);
    }
    if (out.call.status === "ACTIVE") await this.d.store.promoteActive(out.call.scopeType, out.call.scopeId, call.id).catch(() => false);
    callSetupTotal.inc({ mode: call.mode, result: "joined" });
    logger.info("[calls] Tham gia cuộc gọi đang có", { callId: call.id });
    return { call: out.call, joined: true, created: false, token: await this.d.tokens.issueFor(user, out.call, out.participant) };
  }

  /** Vào cuộc: participant mới hoặc `LEFT/DECLINED/MISSED/BUSY → JOINING`; RINGING + người vào ≠ người gọi → ACTIVE. */
  private async enterCall(tx: TxHandle, call: CallEntity, p: CallParticipantEntity | null, userId: string, deviceId: string, now: Date): Promise<CallEntity> {
    let participantVersion = 1;
    if (!p) {
      await this.d.repo.createParticipants(tx, [
        {
          callId: call.id,
          userId,
          role: "MEMBER",
          state: "JOINING",
          respondedAt: now,
          respondedDeviceId: deviceId,
          joiningAt: now,
          publishPermissions: { audio: true, video: call.mediaKind === "VIDEO", screen: false },
          callStartedAt: call.startedAt,
          scopeType: call.scopeType,
          scopeId: call.scopeId,
          mediaKind: call.mediaKind,
          mode: call.mode,
        },
      ]);
    } else {
      const updated = await this.d.repo.updateParticipant(tx, call.id, userId, { version: p.version }, {
        state: "JOINING",
        respondedAt: now,
        respondedDeviceId: deviceId,
        joiningAt: now,
      });
      if (!updated) throw callError(ErrorCode.CALL_011, 409);
      participantVersion = updated.version;
    }

    let current = call;
    if (call.status === "RINGING" && userId !== call.initiatorId) {
      const active = await this.d.repo.updateCall(tx, call.id, { status: ["RINGING"] }, { status: "ACTIVE", answeredAt: now });
      if (active) {
        current = active;
        await this.d.outbox.add(tx, callEvents.answered(call.id, current.version, userId, deviceId));
      }
    }
    await this.d.outbox.add(tx, callEvents.participantChanged(call.id, current.version, userId, "JOINING", participantVersion));
    return current;
  }
}
