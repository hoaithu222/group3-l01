import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { roomNames } from "../../../infrastructure/media";
import type { JoinDto } from "../dtos";
import type { PomodoroSessionEntity, PomodoroSnapshotDto } from "../entities/pomodoro.interface";
import { pomodoroError } from "../pomodoro.errors";
import { PomodoroActiveConflictError } from "../repositories/pomodoro.repository.interface";
import { isHostExempt, isMicLockedPhase, publishFor } from "./pomodoro-media-policy";
import { isChannelOpen, requirePomodoroChannel } from "./pomodoro-channel";
import type { PomodoroSnapshotBuilder } from "./pomodoro-snapshot";
import type { PomodoroTransitions } from "./pomodoro-transition.service";
import { isPresentState, RoomCallConflictError, type PomodoroCall, type PomodoroChannelInfo, type PomodoroDeps } from "./pomodoro.ports";

export interface PomodoroJoinResult {
  snapshot: PomodoroSnapshotDto;
  /** `CallDto` (như `POST /calls/:id/join`) — app dùng lại đường kết nối media của phòng thoại. */
  call: unknown;
  token: string;
  livekitUrl: string;
  expiresAt: string;
  serverNow: string;
}

/**
 * "Vào học" (`POST /channels/:id/pomodoro/join`): mở phiên WAITING nếu kênh chưa có (người đầu tiên = chủ phiên), tạo/vào `Call ROOM` của kênh qua
 * cổng `PomodoroCallPort`, cấp token với quyền publish THEO PHASE HIỆN TẠI (FOCUS: không MICROPHONE — thực thi ở máy chủ media, PM-02). Khuôn của
 * `CallRoomService.createRoom/enter` (p2-03): hai tầng chống trùng phòng (`call:active` Redis + `Call.activeKey @unique`), `call:busy`, `call:lock`.
 */
export class PomodoroJoinService {
  constructor(
    private readonly d: PomodoroDeps,
    private readonly snapshots: PomodoroSnapshotBuilder,
    private readonly transitions: PomodoroTransitions
  ) {}

  async join(user: AuthUser, channelId: string, dto: JoinDto): Promise<PomodoroJoinResult> {
    const channel = await requirePomodoroChannel(this.d.channels, channelId);
    if (!isChannelOpen(channel)) throw pomodoroError(ErrorCode.CALL_018, 409);
    let session = (await this.d.repo.findActiveByChannel(channel.id)) ?? (await this.openSession(user, channel));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const call = await this.ensureCall(session, user, channel);
      if ((await this.enterCall(user, call, session, dto)) === "ENDED") {
        session = (await this.d.repo.findById(session.id)) ?? session; // phòng vừa đóng giữa chừng: tạo phòng mới ở vòng sau
        continue;
      }
      const [token, callDto, fresh] = await Promise.all([this.d.calls.issueToken(user, call.id), this.d.calls.buildCallDto(user, call.id), this.d.repo.findById(session.id)]);
      const snapshot = await this.snapshots.build(fresh ?? session, user, channel);
      return { snapshot, call: callDto, ...token, serverNow: this.d.now().toISOString() };
    }
    throw pomodoroError(ErrorCode.CALL_011, 409);
  }

  /** Kênh chưa có phiên: mở WAITING với chủ = người này; hai người vào cùng lúc → `activeKey` unique, bên thua dùng phiên của bên thắng. */
  private async openSession(user: AuthUser, channel: PomodoroChannelInfo): Promise<PomodoroSessionEntity> {
    try {
      return await this.transitions.create(channel, user.id, false);
    } catch (err) {
      const existing = err instanceof PomodoroActiveConflictError ? await this.d.repo.findActiveByChannel(channel.id) : null;
      if (existing) return existing;
      throw err;
    }
  }

  /** Phòng đang mở của phiên; chưa có (hoặc đã đóng) thì tạo — `Call.hostId` = chủ phiên (failover của `calls` đổi thì `syncHost` đồng bộ lại). */
  private async ensureCall(session: PomodoroSessionEntity, user: AuthUser, channel: PomodoroChannelInfo): Promise<PomodoroCall> {
    const known = session.callId ? await this.d.calls.findCall(session.callId) : null;
    if (known && known.status !== "ENDED") return known;
    const open = await this.d.calls.findOpenCall(channel.id);
    if (open) return this.link(session, open);
    const callId = newObjectId();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lock = await this.d.calls.acquireActive(channel.id, callId);
      if (!lock.acquired) {
        // Khoá do người khác đang tạo (chưa commit) — chờ hàng `Call` xuất hiện trước khi coi là mồ côi.
        const other = await this.d.calls.awaitCall(lock.existing);
        if (other && other.status !== "ENDED") return this.link(session, other);
        await this.d.calls.releaseActive(channel.id, lock.existing); // DB đã ENDED/không có: khoá thừa
        continue;
      }
      return this.createCall(session, user, channel, callId);
    }
    throw pomodoroError(ErrorCode.CALL_011, 409);
  }

  private async createCall(session: PomodoroSessionEntity, user: AuthUser, channel: PomodoroChannelInfo, callId: string): Promise<PomodoroCall> {
    try {
      const livekitRoom = roomNames.call(callId);
      await this.d.media().createRoom({ name: livekitRoom, emptyTimeoutSeconds: LIMITS.pomodoro.emptyRoomEndMinutes * 60, maxParticipants: LIMITS.pomodoro.maxParticipants });
      const call = await this.d.tx.run((tx) =>
        this.d.calls.createRoomCall(tx, { callId, channelId: channel.id, workspaceId: channel.workspaceId, livekitRoom, initiatorId: user.id, hostId: session.hostUserId })
      );
      await this.d.calls.promoteActive(channel.id, callId);
      return await this.link(session, call);
    } catch (err) {
      if (!(await this.d.calls.findCall(callId))) await this.d.calls.releaseActive(channel.id, callId); // chưa commit: nhả khoá; đã commit thì `endCall` lo
      if (err instanceof RoomCallConflictError) {
        const open = await this.d.calls.findOpenCall(channel.id);
        if (open) return this.link(session, open);
      }
      throw err;
    }
  }

  private async link(session: PomodoroSessionEntity, call: PomodoroCall): Promise<PomodoroCall> {
    if (session.callId !== call.id) await this.d.repo.linkCall(session.id, call.id);
    return call;
  }

  /** Vào phòng (be.md §5.2 bước 3, 5): cùng máy chỉ cấp token mới; máy khác cần `force`; `call:busy`; trần chỗ; quyền publish theo phase. */
  private async enterCall(user: AuthUser, call: PomodoroCall, session: PomodoroSessionEntity, dto: JoinDto): Promise<"OK" | "ENDED"> {
    const mine = await this.d.calls.findParticipant(call.id, user.id);
    const publish = publishFor(isMicLockedPhase(session.phase, session.previousPhase), isHostExempt(session.config, session.hostUserId === user.id));
    if (mine?.state === "REMOVED") throw pomodoroError(ErrorCode.CALL_016, 403);
    if (mine && isPresentState(mine.state)) {
      if (mine.respondedDeviceId === dto.deviceId) {
        await this.d.calls.setPublish(call.id, user.id, publish); // cùng thiết bị: chỉ cấp token mới — nhưng theo luật phase HIỆN TẠI
        return "OK";
      }
      if (!dto.force) throw pomodoroError(ErrorCode.CALL_004, 409, { sameCallOtherDevice: true });
    }
    await this.d.calls.claimBusy(user, call.id, dto.force);
    const res = await this.d.calls.enter({
      callId: call.id,
      userId: user.id,
      deviceId: dto.deviceId,
      role: call.hostId === user.id ? "HOST" : "MEMBER",
      publish,
      maxParticipants: LIMITS.pomodoro.maxParticipants,
      force: dto.force,
    });
    if (res.kind === "OK") return "OK";
    await this.d.calls.releaseBusy(user.id, call.id);
    if (res.kind === "ENDED") return "ENDED";
    if (res.kind === "BLOCKED") throw pomodoroError(ErrorCode.CALL_016, 403);
    if (res.kind === "FULL") throw pomodoroError(ErrorCode.CALL_008, 409);
    throw pomodoroError(ErrorCode.CALL_004, 409, { sameCallOtherDevice: true });
  }
}
