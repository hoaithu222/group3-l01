import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode } from "../../../core/utils/error.codes";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { GoalDto, HistoryQueryDto } from "../dtos";
import type { PomodoroHistoryItemDto, PomodoroSessionEntity, PomodoroSessionResultDto } from "../entities/pomodoro.interface";
import { pomodoroError } from "../pomodoro.errors";
import type { PomodoroMediaSync } from "./pomodoro-media-sync.service";
import { summaryOf } from "./pomodoro-snapshot";
import { isPresentState, type PomodoroDeps } from "./pomodoro.ports";

const HOST_SYNC_BUFFER_SECONDS = 5;

/**
 * Hiện diện + mục tiêu cá nhân + kết quả phiên + lịch sử (be.md §5 "Presence"). Hiện diện CHỈ là nhật ký cá nhân (không dùng để chấm điểm/đóng góp):
 * ghi từ webhook LiveKit `participant_joined/left` (đối chiếu ở `PomodoroLiveKitHandler`), không phải từ client tự khai.
 */
export class PomodoroPresenceService {
  constructor(
    private readonly d: PomodoroDeps,
    private readonly media: PomodoroMediaSync
  ) {}

  /** Người vừa kết nối LiveKit vào phòng của một phiên: mở/mở lại hiện diện + áp ngay luật mic hiện tại. `null` khi phòng không thuộc phiên Pomodoro nào. */
  async onJoined(callId: string, userId: string): Promise<PomodoroSessionEntity | null> {
    const session = await this.d.repo.findByCallId(callId);
    if (!session || session.phase === "ENDED") return null;
    await this.d.repo.markJoined(session.id, userId, this.d.now());
    await this.media.syncOne(session.id, userId);
    return session;
  }

  /** Người vừa rời: chốt hiện diện; chủ phiên rời → hẹn đồng bộ chủ phòng theo failover của `calls` (grace 30 s). */
  async onLeft(callId: string, userId: string): Promise<PomodoroSessionEntity | null> {
    const session = await this.d.repo.findByCallId(callId);
    if (!session || session.phase === "ENDED") return null;
    await this.d.repo.markLeft(session.id, userId, this.d.now());
    if (userId === session.hostUserId) await this.d.jobs.scheduleHostSync(session.id, (LIMITS.pomodoro.hostGraceSeconds + HOST_SYNC_BUFFER_SECONDS) * 1000);
    return session;
  }

  /** `PUT .../goal`: phải đang ở trong phòng (`CALL_POMO_006`); chỉ phát `pomodoro:updated` khi phần CHIA SẺ với phòng đổi (không bump `version` — lệnh của chủ phòng không bị vô hiệu). */
  async setGoal(user: AuthUser, channelId: string, dto: GoalDto): Promise<{ goal: string; shared: boolean }> {
    const session = await this.d.repo.findActiveByChannel(channelId);
    const me = session?.callId ? await this.d.calls.findParticipant(session.callId, user.id) : null;
    if (!session || !me || !isPresentState(me.state)) throw pomodoroError(ErrorCode.CALL_POMO_006, 409);
    const before = await this.d.repo.findPresence(session.id, user.id);
    const row = await this.d.repo.setGoal(session.id, user.id, this.d.now(), dto.text === "" ? null : dto.text, dto.shared);
    const visibleBefore = before?.goalShared ? before.goal : null;
    const visibleAfter = row.goalShared ? row.goal : null;
    if (visibleBefore !== visibleAfter) await this.d.broadcaster.broadcast(session.id).catch(() => undefined);
    return { goal: row.goal ?? "", shared: row.goalShared };
  }

  /** Kết quả phiên (bottom sheet cuối phiên): vòng hoàn thành của phiên + số liệu của RIÊNG người xem. `channel.read` đã kiểm ở middleware route. */
  async sessionResult(user: AuthUser, channelId: string, sessionId: string): Promise<PomodoroSessionResultDto> {
    const session = await this.d.repo.findById(sessionId);
    if (!session || session.channelId !== channelId) throw new NotFoundError("Không tìm thấy phiên");
    const now = this.d.now();
    const mine = await this.d.repo.findPresence(sessionId, user.id);
    const live = mine && mine.leftAt === null ? Math.max(0, Math.round((now.getTime() - mine.joinedAt.getTime()) / 1000)) : 0;
    return {
      session: { sessionId, channelId, config: session.config, ...summaryOf(session) },
      mine: mine ? { presentSeconds: mine.presentSeconds + live, cyclesAttended: mine.cyclesAttended, interruptions: mine.interruptions, goal: mine.goal } : null,
      serverNow: now.toISOString(),
    };
  }

  /** `GET /me/pomodoro/history` (P1): nhật ký cá nhân, mới → cũ, cursor `(joinedAt, id)`. */
  async history(user: AuthUser, q: HistoryQueryDto): Promise<{ items: PomodoroHistoryItemDto[]; nextCursor: string | null; hasMore: boolean }> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const rows = await this.d.repo.listHistory(user.id, cursor, q.limit);
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const names = await this.d.channels.names(page.map((r) => r.session.channelId));
    const items = page.map(({ presence: p, session: s }): PomodoroHistoryItemDto => ({
      sessionId: s.id,
      channelId: s.channelId,
      channelName: names.get(s.channelId) ?? null,
      workspaceId: s.workspaceId,
      status: s.phase,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      endReason: s.endReason,
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt ? p.leftAt.toISOString() : null,
      presentSeconds: p.presentSeconds,
      cyclesAttended: p.cyclesAttended,
      interruptions: p.interruptions,
      goal: p.goal,
      completedFocusCycles: s.completedFocusCycles,
      skippedFocusCycles: s.skippedFocusCycles,
      config: s.config,
    }));
    const last = page[page.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.presence.joinedAt, last.presence.id) : null };
  }
}
