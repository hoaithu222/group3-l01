import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import {
  isRunningPhase,
  type PomodoroMyActions,
  type PomodoroParticipantDto,
  type PomodoroSessionEntity,
  type PomodoroSnapshotDto,
  type PomodoroSummaryDto,
} from "../entities/pomodoro.interface";
import { rulesFor } from "./pomodoro-media-policy";
import { phaseDurationOf, remainingMsOf } from "./pomodoro-state-machine";
import type { PomodoroChannelInfo, PomodoroDeps, PomodoroParticipant } from "./pomodoro.ports";

const SHOWN_STATES: readonly string[] = ["CONNECTED", "RECONNECTING"];

type Deps = Pick<PomodoroDeps, "repo" | "calls" | "channels" | "access" | "now">;

export function summaryOf(s: PomodoroSessionEntity): PomodoroSummaryDto {
  return {
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    endReason: s.endReason,
    completedFocusCycles: s.completedFocusCycles,
    skippedFocusCycles: s.skippedFocusCycles,
  };
}

/**
 * Dựng `PomodoroSnapshotDto` (be.md §4) — nguồn sự thật đồng hồ của mọi client: mốc `phaseEndsAt` + `serverNow` (client tính lệch đồng hồ rồi CHỈ vẽ).
 * Bản phát socket (không `viewer`) là bản chung cả phòng: mục tiêu chỉ hiện khi người đó bật chia sẻ, không có `myGoal`/`myActions`. Bản REST
 * (có `viewer`) thêm mục tiêu của chính mình và `myActions` do server tính (client không tự suy từ vai trò).
 */
export class PomodoroSnapshotBuilder {
  constructor(private readonly d: Deps) {}

  /** Kênh chưa có phiên: WAITING ảo (`version = 0`) mang cấu hình mặc định của kênh. */
  async virtual(channel: PomodoroChannelInfo, viewer?: AuthUser): Promise<PomodoroSnapshotDto> {
    const base: PomodoroSnapshotDto = {
      v: 1,
      sessionId: null,
      channelId: channel.id,
      phase: "WAITING",
      previousPhase: null,
      pauseReason: null,
      phaseStartedAt: null,
      phaseEndsAt: null,
      remainingMs: null,
      phaseDurationMs: null,
      completedFocusCycles: 0,
      skippedFocusCycles: 0,
      config: channel.defaultConfig,
      hostUserId: null,
      participants: [],
      rules: rulesFor("WAITING", null),
      version: 0,
      serverNow: this.d.now().toISOString(),
    };
    return viewer ? { ...base, myGoal: null, myActions: await this.actions(null, channel, viewer, []) } : base;
  }

  async build(session: PomodoroSessionEntity, viewer?: AuthUser, channel?: PomodoroChannelInfo | null): Promise<PomodoroSnapshotDto> {
    const now = this.d.now();
    const [members, presences] = await Promise.all([
      session.callId ? this.d.calls.listParticipants(session.callId) : Promise.resolve([] as PomodoroParticipant[]),
      this.d.repo.listPresence(session.id),
    ]);
    const present = members.filter((p) => SHOWN_STATES.includes(p.state)).sort((a, b) => (a.firstJoinedAt?.getTime() ?? 0) - (b.firstJoinedAt?.getTime() ?? 0));
    const names = await this.d.channels.userNames(present.map((p) => p.userId));
    const goalOf = new Map(presences.map((p) => [p.userId, p]));

    const participants: PomodoroParticipantDto[] = present.map((p) => {
      const row = goalOf.get(p.userId);
      const shared = row?.goal && (row.goalShared || p.userId === viewer?.id) ? { goal: row.goal } : {};
      return { userId: p.userId, name: names.get(p.userId) ?? "", isHost: p.userId === session.hostUserId, ...shared };
    });

    const dto: PomodoroSnapshotDto = {
      v: 1,
      sessionId: session.id,
      channelId: session.channelId,
      phase: session.phase,
      previousPhase: session.previousPhase,
      pauseReason: session.pauseReason,
      phaseStartedAt: session.phaseStartedAt ? session.phaseStartedAt.toISOString() : null,
      phaseEndsAt: session.phaseEndsAt ? session.phaseEndsAt.toISOString() : null,
      remainingMs: remainingMsOf(session, now),
      phaseDurationMs: phaseDurationOf(session),
      completedFocusCycles: session.completedFocusCycles,
      skippedFocusCycles: session.skippedFocusCycles,
      config: session.config,
      hostUserId: session.hostUserId,
      participants,
      rules: rulesFor(session.phase, session.previousPhase),
      ...(session.phase === "ENDED" ? { summary: summaryOf(session) } : {}),
      version: session.version,
      serverNow: now.toISOString(),
    };
    if (!viewer) return dto;
    const mine = goalOf.get(viewer.id);
    const info = channel ?? (await this.d.channels.get(session.channelId));
    return {
      ...dto,
      myGoal: mine?.goal ? { text: mine.goal, shared: mine.goalShared } : null,
      myActions: info ? await this.actions(session, info, viewer, members) : undefined,
    };
  }

  /** `myActions` (README §6 ma trận quyền): host điều khiển; `manage` kênh chỉ được kết thúc khẩn cấp (hoặc cấu hình mặc định khi chưa có phiên). */
  private async actions(
    session: PomodoroSessionEntity | null,
    channel: PomodoroChannelInfo,
    viewer: AuthUser,
    members: PomodoroParticipant[]
  ): Promise<PomodoroMyActions> {
    const canManage = await this.d.access.canManage(viewer, channel.id);
    const open = channel.status === "ACTIVE" && channel.workspaceActive;
    const isHost = !!session && session.hostUserId === viewer.id;
    const me = members.find((p) => p.userId === viewer.id);
    const occupied = members.filter((p) => SHOWN_STATES.includes(p.state) || p.state === "JOINING").length;
    const inRoom = !!me && (SHOWN_STATES.includes(me.state) || me.state === "JOINING");
    const removed = me?.state === "REMOVED";
    const full = !inRoom && occupied >= LIMITS.pomodoro.maxParticipants;
    const blocked = !open ? "ARCHIVED" : removed ? "REMOVED" : full ? "FULL" : undefined;
    const phase = session?.phase ?? "WAITING";
    return {
      canJoin: !blocked,
      ...(blocked ? { joinBlockedReason: blocked } : {}),
      canStart: open && (!session || (phase === "WAITING" && isHost)),
      canConfigure: open && ((!session && canManage) || (phase === "WAITING" && isHost)),
      canPause: isHost && isRunningPhase(phase),
      canResume: isHost && phase === "PAUSED",
      canSkip: isHost && isRunningPhase(phase),
      canEnd: !!session && phase !== "ENDED" && (isHost || canManage),
    };
  }
}
