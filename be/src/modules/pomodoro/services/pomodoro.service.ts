import { IdempotencyInProgressError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { CommandDto, ConfigDto } from "../dtos";
import type { PomodoroConfig, PomodoroSessionEntity, PomodoroSnapshotDto } from "../entities/pomodoro.interface";
import { pomodoroError } from "../pomodoro.errors";
import { PomodoroActiveConflictError } from "../repositories/pomodoro.repository.interface";
import { isChannelOpen, requirePomodoroChannel } from "./pomodoro-channel";
import type { PomodoroSnapshotBuilder } from "./pomodoro-snapshot";
import type { ApplyOptions, PomodoroTransitions } from "./pomodoro-transition.service";
import type { PomodoroEvent } from "./pomodoro-state-machine";
import type { PomodoroChannelInfo, PomodoroDeps } from "./pomodoro.ports";

/**
 * Lệnh của chủ phòng + cấu hình + đọc snapshot (be.md §4/§5). Mọi lệnh ghi đi qua `command()`: idempotency `commandId` (PM-08) → kiểm quyền/phase →
 * `PomodoroTransitions.apply` (CAS `version`+`phase`, PM-03). Kiểm quyền: chủ PHIÊN (`hostUserId`, đồng bộ với `Call.hostId` sau failover) điều
 * khiển; người có `manage` kênh chỉ kết thúc khẩn cấp hoặc chỉnh cấu hình mặc định khi CHƯA có phiên. Đọc kênh qua reader (không import module `channels`).
 */
export class PomodoroService {
  constructor(
    private readonly d: PomodoroDeps,
    private readonly snapshots: PomodoroSnapshotBuilder,
    private readonly transitions: PomodoroTransitions
  ) {}

  // ── đọc ────────────────────────────────────────────────────────────────────

  /** `GET /channels/:id/pomodoro` — preview + phòng: snapshot theo góc nhìn người xem (kèm `myActions`, `myGoal`). */
  async getSnapshot(user: AuthUser, channelId: string): Promise<PomodoroSnapshotDto> {
    const channel = await this.channel(channelId);
    const session = await this.d.repo.findActiveByChannel(channelId);
    if (!session) return this.snapshots.virtual(channel, user);
    return this.snapshots.build(await this.transitions.syncHost(session), user, channel);
  }

  // ── lệnh ───────────────────────────────────────────────────────────────────

  start(user: AuthUser, channelId: string, body: CommandDto): Promise<PomodoroSnapshotDto> {
    return this.command(user, channelId, body.commandId, async (channel) => {
      this.assertOpen(channel);
      const existing = await this.d.repo.findActiveByChannel(channelId);
      if (!existing) return this.createRunning(user, channel, body.expectedVersion);
      if (existing.phase !== "WAITING") throw pomodoroError(ErrorCode.CALL_POMO_002, 409);
      const session = await this.transitions.syncHost(existing);
      this.assertHost(session, user);
      this.assertVersion(session, body.expectedVersion);
      return this.applyOrThrow(session, { type: "start" });
    });
  }

  pause(user: AuthUser, channelId: string, body: CommandDto): Promise<PomodoroSnapshotDto> {
    return this.control(user, channelId, body, { type: "pause" });
  }

  resume(user: AuthUser, channelId: string, body: CommandDto): Promise<PomodoroSnapshotDto> {
    return this.control(user, channelId, body, { type: "resume" });
  }

  skip(user: AuthUser, channelId: string, body: CommandDto): Promise<PomodoroSnapshotDto> {
    return this.control(user, channelId, body, { type: "skip" });
  }

  /** Chủ phòng kết thúc, hoặc người có `manage` kênh kết thúc KHẨN CẤP (`MANAGER_ENDED`). */
  end(user: AuthUser, channelId: string, body: CommandDto): Promise<PomodoroSnapshotDto> {
    return this.command(user, channelId, body.commandId, async () => {
      const session = await this.transitions.syncHost(await this.requireActive(channelId));
      const isHost = session.hostUserId === user.id;
      if (!isHost && !(await this.d.access.canManage(user, channelId))) throw pomodoroError(ErrorCode.CALL_POMO_004, 403);
      this.assertVersion(session, body.expectedVersion);
      return this.applyOrThrow(session, { type: "end", reason: isHost ? "HOST_ENDED" : "MANAGER_ENDED" }, { actorId: user.id });
    });
  }

  /**
   * `PATCH .../config`: có phiên WAITING → chủ phiên sửa `config` của phiên (CAS); phiên đã chạy → `CALL_POMO_003`; CHƯA có phiên → người có `manage`
   * sửa cấu hình mặc định của kênh (`Channel.settings.pomodoro`) dùng cho các phiên sau.
   */
  async updateConfig(user: AuthUser, channelId: string, dto: ConfigDto): Promise<PomodoroSnapshotDto> {
    const channel = await this.channel(channelId);
    this.assertOpen(channel);
    const existing = await this.d.repo.findActiveByChannel(channelId);
    const config: PomodoroConfig = {
      focusMinutes: dto.focusMinutes,
      shortBreakMinutes: dto.shortBreakMinutes,
      longBreakMinutes: dto.longBreakMinutes,
      cyclesBeforeLongBreak: dto.cyclesBeforeLongBreak,
      autoAdvance: dto.autoAdvance,
      hostCanSpeakInFocus: dto.hostCanSpeakInFocus ?? existing?.config.hostCanSpeakInFocus ?? channel.defaultConfig.hostCanSpeakInFocus,
    };
    if (!existing) {
      if (!(await this.d.access.canManage(user, channelId))) throw pomodoroError(ErrorCode.CALL_POMO_004, 403);
      await this.d.channels.saveDefaultConfig(channelId, config);
      return this.snapshots.virtual({ ...channel, defaultConfig: config }, user);
    }
    if (existing.phase !== "WAITING") throw pomodoroError(ErrorCode.CALL_POMO_003, 409);
    const session = await this.transitions.syncHost(existing);
    this.assertHost(session, user);
    if (dto.expectedVersion !== undefined) this.assertVersion(session, dto.expectedVersion);
    const updated = await this.d.repo.updateSession(undefined, session.id, { version: session.version, phase: "WAITING" }, { config });
    if (!updated) throw await this.conflict(session);
    await this.d.broadcaster.broadcast(updated.id).catch(() => undefined);
    return this.snapshots.build(updated, user, channel);
  }

  // ── nội bộ ─────────────────────────────────────────────────────────────────

  private control(user: AuthUser, channelId: string, body: CommandDto, event: PomodoroEvent): Promise<PomodoroSnapshotDto> {
    return this.command(user, channelId, body.commandId, async () => {
      const session = await this.transitions.syncHost(await this.requireActive(channelId));
      this.assertHost(session, user);
      this.assertVersion(session, body.expectedVersion);
      return this.applyOrThrow(session, event);
    });
  }

  /** Wrapper idempotent (be.md §5): trùng `commandId` đã xong → trả trạng thái HIỆN TẠI (không áp lại, PM-08); đang chạy → 409 `RES_004`. */
  private async command(
    user: AuthUser,
    channelId: string,
    commandId: string,
    run: (channel: PomodoroChannelInfo) => Promise<PomodoroSessionEntity>
  ): Promise<PomodoroSnapshotDto> {
    const channel = await this.channel(channelId);
    const key = this.d.commands.keyOf(channelId, user.id, commandId);
    const claim = await this.d.commands.begin(key);
    if (claim.state === "PENDING") throw new IdempotencyInProgressError();
    if (claim.state === "DONE") return this.getSnapshot(user, channelId);
    try {
      const session = await run(channel);
      await this.d.commands.complete(key, { sessionId: session.id, version: session.version });
      return await this.snapshots.build(session, user, channel);
    } catch (err) {
      await this.d.commands.abort(key);
      throw err;
    }
  }

  /** Kênh chưa có phiên: tạo phiên FOCUS ngay (chủ phiên = người bấm). Hai người bấm cùng lúc → `activeKey` unique: bên thua thấy `CALL_POMO_002`. */
  private async createRunning(user: AuthUser, channel: PomodoroChannelInfo, expectedVersion: number): Promise<PomodoroSessionEntity> {
    if (expectedVersion !== 0) throw new VersionConflictError(0);
    try {
      return await this.transitions.create(channel, user.id, true);
    } catch (err) {
      if (err instanceof PomodoroActiveConflictError) throw pomodoroError(ErrorCode.CALL_POMO_002, 409);
      throw err;
    }
  }

  private async applyOrThrow(session: PomodoroSessionEntity, event: PomodoroEvent, opts?: ApplyOptions): Promise<PomodoroSessionEntity> {
    const r = await this.transitions.apply(session, event, opts);
    if (r.kind === "OK") return r.session;
    if (r.kind === "CONFLICT") throw await this.conflict(session);
    throw pomodoroError(ErrorCode.CALL_POMO_005, 409);
  }

  private async conflict(session: PomodoroSessionEntity): Promise<VersionConflictError> {
    return new VersionConflictError((await this.d.repo.findById(session.id))?.version ?? session.version);
  }

  private channel(channelId: string): Promise<PomodoroChannelInfo> {
    return requirePomodoroChannel(this.d.channels, channelId);
  }

  private assertOpen(channel: PomodoroChannelInfo): void {
    if (!isChannelOpen(channel)) throw pomodoroError(ErrorCode.CALL_018, 409);
  }

  private assertHost(session: PomodoroSessionEntity, user: AuthUser): void {
    if (session.hostUserId !== user.id) throw pomodoroError(ErrorCode.CALL_POMO_004, 403);
  }

  private assertVersion(session: PomodoroSessionEntity, expected: number): void {
    if (session.version !== expected) throw new VersionConflictError(session.version);
  }

  private async requireActive(channelId: string): Promise<PomodoroSessionEntity> {
    const session = await this.d.repo.findActiveByChannel(channelId);
    if (!session) throw pomodoroError(ErrorCode.CALL_POMO_005, 409);
    return session;
  }
}
