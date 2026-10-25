/**
 * Seed phân hệ POMODORO: lịch sử các phiên tập trung ĐÃ KẾT THÚC trong tuần qua (kênh POMODORO của các nhóm) và nhật ký hiện diện từng người —
 * nguồn của "giờ tập trung" ở Trang chủ và màn "Lịch sử học của tôi" (`GET /me/pomodoro/history`).
 *
 * Đồng hồ được dựng lại đúng máy trạng thái thật (`pomodoro-state-machine.ts`): tập trung → nghỉ ngắn → … → nghỉ dài sau mỗi `cyclesBeforeLongBreak` vòng;
 * `completedFocusCycles` chỉ tính vòng kết thúc tự nhiên, `skippedFocusCycles` là vòng bị bỏ qua; phiên ENDED có `activeKey = ended:<id>`, `phaseEndsAt/remainingMs/
 * pauseReason/previousPhase = null`; `version` = 1 (tạo) + 1 (bắt đầu) + số lần chuyển phase + (phòng rỗng?) + 1 (kết thúc). Hiện diện theo `PomodoroRepository`:
 * `presentSeconds` = tổng các đoạn có mặt, `interruptions` = số lần quay lại, `cyclesAttended` = số vòng kết thúc tự nhiên mà người đó có mặt từ đầu tới cuối.
 *
 * KHÔNG tạo phiên đang chạy: đồng hồ sống ở Mongo nhưng người tham gia/phòng sống ở LiveKit `Call` — phiên FOCUS không có phòng sẽ bị cron `pomodoro.reconcile`
 * kết thúc `EMPTY_ROOM` sau vài phút và trong lúc đó chiếm `activeKey` của kênh (không ai bấm "bắt đầu" được). Không tạo Call, không outbox, không tín hiệu burnout.
 */
import { MIN_MS, prisma } from "../core";
import type { ModuleSeed } from "../module-ctx";
import type { WorkspaceCtx } from "../workspace";
import { atVn, between, stableId, mixedRng } from "./mpq-util";
import { POMODORO_PLANS, type PomoPlan } from "./pomodoro.content";

type Config = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoAdvance: boolean;
  hostCanSpeakInFocus: boolean;
}

type Kind = "FOCUS" | "SHORT_BREAK" | "LONG_BREAK";
interface Phase {
  kind: Kind;
  start: number;
  end: number;
  natural: boolean;
}

interface Timeline {
  phases: Phase[];
  /** Mốc người cuối cùng rời / chủ phòng kết thúc. */
  last: number;
  done: number;
  skipped: number;
}

/** Dựng chuỗi phase từ `s0` đến khi hoàn thành `cycles` vòng tự nhiên, rồi thêm `tailMin` phút. */
function timeline(s0: number, c: Config, cycles: number, skip: boolean, tailMin: number): Timeline {
  const phases: Phase[] = [];
  let t = s0;
  let done = 0;
  let skipped = 0;
  let focusNo = 0;
  const breakKind = (afterNatural: boolean): Kind => (afterNatural && done > 0 && done % c.cyclesBeforeLongBreak === 0 ? "LONG_BREAK" : "SHORT_BREAK");
  const breakMs = (k: Kind): number => (k === "LONG_BREAK" ? c.longBreakMinutes : c.shortBreakMinutes) * MIN_MS;
  while (done < cycles) {
    focusNo += 1;
    const skipThis = skip && focusNo === 2;
    const ms = (skipThis ? Math.max(1, Math.round(c.focusMinutes * 0.4)) : c.focusMinutes) * MIN_MS;
    phases.push({ kind: "FOCUS", start: t, end: t + ms, natural: !skipThis });
    t += ms;
    if (skipThis) skipped += 1;
    else done += 1;
    if (done >= cycles && !skipThis) break;
    const k = breakKind(!skipThis);
    phases.push({ kind: k, start: t, end: t + breakMs(k), natural: true });
    t += breakMs(k);
  }
  const last = t + tailMin * MIN_MS;
  // Sau vòng cuối: nghỉ (rồi, nếu `tail` dài, vòng tập trung kế tiếp) cho tới lúc kết thúc.
  while (t < last) {
    const prev = phases[phases.length - 1] as Phase;
    const k: Kind = prev.kind === "FOCUS" ? breakKind(prev.natural) : "FOCUS";
    const ms = k === "FOCUS" ? c.focusMinutes * MIN_MS : breakMs(k);
    phases.push({ kind: k, start: t, end: t + ms, natural: true });
    t += ms;
  }
  return { phases, last, done, skipped };
}

interface Segment {
  from: number;
  to: number;
}

interface ResolvedPresence {
  userId: string;
  joinedAt: Date;
  leftAt: Date;
  presentSeconds: number;
  cyclesAttended: number;
  interruptions: number;
  goal: string | null;
  goalShared: boolean;
}

interface ResolvedSession {
  id: string;
  key: string;
  channelId: string;
  workspaceId: string;
  hostId: string;
  config: Config;
  createdAt: Date;
  startedAt: Date;
  endedAt: Date;
  endReason: "HOST_ENDED" | "EMPTY_ROOM";
  phaseStartedAt: Date;
  completed: number;
  skipped: number;
  version: number;
  presences: ResolvedPresence[];
}

function resolvePlan(plan: PomoPlan, ws: WorkspaceCtx, channelId: string, channelCreatedAt: Date, c: { now: Date; idOf: (k: string) => string; memberSince: (k: string) => Date | undefined }): ResolvedSession | null {
  const [focus, short, long, every] = plan.cfg ?? [25, 5, 15, 4];
  const cfg: Config = { focusMinutes: focus, shortBreakMinutes: short, longBreakMinutes: long, cyclesBeforeLongBreak: every, autoAdvance: true, hostCanSpeakInFocus: false };
  const tail = plan.tail ?? 2;
  const empty = plan.end === "EMPTY";
  // Độ dài phiên không phụ thuộc giờ bắt đầu → dựng thử để biết giờ kết thúc, rồi lùi ngày nếu còn ở tương lai (chạy sớm trong ngày).
  const probe = timeline(0, cfg, plan.cycles, plan.skip ?? false, tail);
  const span = probe.last + (empty ? 340_000 : 0);
  let day = plan.day;
  let s0 = atVn(c.now, -day, plan.at[0], plan.at[1]).getTime();
  while (s0 + span > c.now.getTime() - 10 * MIN_MS) {
    day += 1;
    s0 = atVn(c.now, -day, plan.at[0], plan.at[1]).getTime();
  }
  const lower = Math.max(ws.createdAt.getTime(), channelCreatedAt.getTime()) + 3 * MIN_MS;
  const rng = mixedRng(`pomodoro:${plan.key}`);
  const createdAt = s0 - Math.floor(between(rng, 25, 110) * 1000);
  if (createdAt < lower) return null;
  const tl = timeline(s0, cfg, plan.cycles, plan.skip ?? false, tail);

  const hostSince = c.memberSince(plan.host)?.getTime();
  if (!ws.roles.has(plan.host) || hostSince === undefined || hostSince + 10 * MIN_MS > createdAt) return null;
  const L = tl.last;
  const endedAt = L + (empty ? 300_000 + Math.floor(between(rng, 5, 40) * 1000) : 0);
  const naturals = tl.phases.filter((p) => p.kind === "FOCUS" && p.natural && p.end <= L);
  const presences: ResolvedPresence[] = [];
  for (const person of plan.people) {
    const since = c.memberSince(person.who)?.getTime();
    if (!ws.roles.has(person.who) || since === undefined || since + 10 * MIN_MS > s0 + person.join * MIN_MS) continue;
    const prng = mixedRng(`pomodoro-person:${plan.key}:${person.who}`);
    const joinAt = s0 + person.join * MIN_MS + Math.floor(prng() * 40_000);
    const leave = person.stay === null ? (empty ? L : endedAt) : Math.min(joinAt + person.stay * MIN_MS, empty ? L : endedAt);
    if (leave - joinAt < 3 * MIN_MS) continue;
    let segs: Segment[] = [{ from: joinAt, to: leave }];
    let interruptions = 0;
    if (person.gap !== undefined) {
      const cut = joinAt + Math.floor((leave - joinAt) * 0.4);
      const back = cut + person.gap * MIN_MS + Math.floor(prng() * 20_000);
      if (leave - back >= 3 * MIN_MS) {
        segs = [{ from: joinAt, to: cut }, { from: back, to: leave }];
        interruptions = 1;
      }
    }
    const attended = naturals.filter((ph) => segs.some((s) => s.from <= ph.start && s.to >= ph.end)).length;
    const hasGoal = !!person.goal;
    presences.push({
      userId: c.idOf(person.who),
      joinedAt: new Date((segs[segs.length - 1] as Segment).from),
      leftAt: new Date(leave),
      presentSeconds: segs.reduce((n, s) => n + Math.floor((s.to - s.from) / 1000), 0),
      cyclesAttended: attended,
      interruptions,
      goal: hasGoal ? (person.goal as string) : null,
      goalShared: hasGoal && !person.private,
    });
  }
  const hostId = c.idOf(plan.host);
  if (!presences.some((x) => x.userId === hostId)) return null;
  const crossed = tl.phases.filter((p) => p.end <= L).length;
  const active = [...tl.phases].reverse().find((p) => p.start < L) as Phase;
  return {
    id: stableId(`pomodoro:${plan.key}`),
    key: plan.key,
    channelId,
    workspaceId: ws.id,
    hostId,
    config: cfg,
    createdAt: new Date(createdAt),
    startedAt: new Date(s0),
    endedAt: new Date(endedAt),
    endReason: empty ? "EMPTY_ROOM" : "HOST_ENDED",
    phaseStartedAt: new Date(active.start),
    completed: naturals.length,
    skipped: tl.phases.filter((p) => p.kind === "FOCUS" && !p.natural && p.end <= L).length,
    version: 2 + crossed + (empty ? 1 : 0) + 1,
    presences,
  };
}

export const seedPomodoro: ModuleSeed = async (c) => {
  const wsList = [...c.workspaces.values()];
  const channels = await prisma.channel.findMany({
    where: { workspaceId: { in: wsList.map((w) => w.id) }, type: "POMODORO", status: "ACTIVE" },
    select: { id: true, workspaceId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: { in: wsList.map((w) => w.id) }, status: "ACTIVE" },
    select: { workspaceId: true, userId: true, joinedAt: true },
  });
  const joined = new Map(memberships.map((m) => [`${m.workspaceId}:${m.userId}`, m.joinedAt]));

  let sessions = 0;
  let presences = 0;
  let thuSeconds = 0;
  const skipped: string[] = [];
  const thuId = c.dir.id("thu");
  for (const plan of POMODORO_PLANS) {
    const ws = c.workspaces.get(plan.ws);
    const channel = ws ? channels.find((ch) => ch.workspaceId === ws.id) : undefined;
    if (!ws || !channel) {
      skipped.push(`${plan.key} (không có kênh Pomodoro)`);
      continue;
    }
    const s = resolvePlan(plan, ws, channel.id, channel.createdAt, {
      now: c.now,
      idOf: (k) => c.dir.id(k),
      // Chủ nhóm có mặt từ lúc tạo nhóm (dòng membership OWNER của nhóm có sẵn có thể mới hơn nhóm).
      memberSince: (k) => (ws.roles.get(k) === "OWNER" ? ws.createdAt : joined.get(`${ws.id}:${c.dir.id(k)}`)),
    });
    if (!s) {
      skipped.push(`${plan.key} (trước khi nhóm/kênh/chủ phòng tồn tại)`);
      continue;
    }
    if (!(await prisma.pomodoroSession.findUnique({ where: { id: s.id }, select: { id: true } }))) {
      await prisma.pomodoroSession.create({
        data: {
          id: s.id,
          channelId: s.channelId,
          workspaceId: s.workspaceId,
          callId: null,
          hostUserId: s.hostId,
          config: s.config,
          phase: "ENDED",
          previousPhase: null,
          phaseStartedAt: s.phaseStartedAt,
          phaseEndsAt: null,
          remainingMs: null,
          completedFocusCycles: s.completed,
          skippedFocusCycles: s.skipped,
          pauseReason: null,
          activeKey: `ended:${s.id}`,
          version: s.version,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          endReason: s.endReason,
          createdAt: s.createdAt,
          updatedAt: s.endedAt,
        },
      });
      sessions += 1;
    }
    const have = new Set((await prisma.pomodoroPresence.findMany({ where: { sessionId: s.id }, select: { userId: true } })).map((r) => r.userId));
    const missing = s.presences.filter((x) => !have.has(x.userId));
    if (missing.length > 0) {
      await prisma.pomodoroPresence.createMany({
        data: missing.map((x) => ({
          sessionId: s.id,
          userId: x.userId,
          joinedAt: x.joinedAt,
          leftAt: x.leftAt,
          presentSeconds: x.presentSeconds,
          cyclesAttended: x.cyclesAttended,
          interruptions: x.interruptions,
          goal: x.goal,
          goalShared: x.goalShared,
          updatedAt: x.leftAt,
        })),
      });
      presences += missing.length;
    }
    thuSeconds += s.presences.filter((x) => x.userId === thuId).reduce((n, x) => n + x.presentSeconds, 0);
  }
  const hours = (thuSeconds / 3600).toFixed(1);
  const skip = skipped.length > 0 ? `; bỏ qua ${skipped.length} phiên: ${skipped.join(", ")}` : "";
  return `Pomodoro: +${sessions} phiên đã kết thúc, +${presences} lượt hiện diện (thu có ${hours} giờ tập trung trong kế hoạch)${skip}`;
};
