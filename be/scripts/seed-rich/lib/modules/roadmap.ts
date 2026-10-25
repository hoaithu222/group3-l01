/**
 * Seed phân hệ `roadmap` (p4-07): ghi danh 14 người (16 lượt) vào 2 môn ĐÃ CÓ (Fullstack 56 buổi, Tiếng Anh 25 ngày — không sửa môn/giai đoạn/buổi nào)
 * cùng tiến độ từng buổi nhất quán với lịch học.
 *
 * Lịch học dựng bằng ĐÚNG `scheduleMap` của dịch vụ từ `(anchorDate, anchorNumber, studyDays)`; trạng thái buổi mô phỏng theo nhịp từng người (đều/vượt lịch/trễ/
 * bỏ qua/tạm dừng/dời lịch/mới ghi danh). `RoadmapEnrollment.completedCount|requiredDone|lastLessonId|lastActivityAt` là số đếm phi chuẩn hoá khớp
 * `RoadmapLessonProgress` (COMPLETED; bắt buộc = không `optional`). Mỗi buổi COMPLETED lần đầu có đúng một `XpEvent ROADMAP_LESSON`
 * (`dedupeKey ROADMAP_LESSON:<lessonId>:<userId>`) và `UserGamification` cộng dồn — xem `career-xp.ts`. Không outbox/thông báo/push.
 * Đã có ghi danh (userId, môn) → bỏ qua cả kế hoạch, không đụng dữ liệu thật.
 */
import { newObjectId } from "../../../../src/core/utils/object-id";
import { addDaysToLocalDate } from "../../../../src/core/utils/local-date";
import { nextStudyDateKey, scheduleMap, toAnchorDate } from "../../../../src/modules/roadmap/services/roadmap-schedule";
import { DAY_MS, prisma, rngFrom } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import { loadUsers, snapActive, vnDateKey, type UserInfo } from "./career-common";
import { LEARNERS, NOTES_ENGLISH, NOTES_FULLSTACK, type LearnerPlan } from "./roadmap.content";
import { awardXp, type XpDraft } from "./career-xp";

const TZ = "Asia/Ho_Chi_Minh";
const MIN = 60_000;

interface LessonRef {
  id: string;
  number: number;
  optional: boolean;
  checklistIds: string[];
}

type RowStatus = "COMPLETED" | "IN_PROGRESS" | "SKIPPED";
interface Row {
  lesson: LessonRef;
  status: RowStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Thời điểm UTC của `hh:mm` giờ VN trong ngày địa phương `YYYY-MM-DD`. */
function atLocal(dateKey: string, hour: number, minute: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - 7 * 3_600_000);
}

class Simulator {
  readonly rows = new Map<number, Row>();
  anchorNumber = 1;
  anchorKey: string;
  rescheduledAt: Date | null = null;
  paused = false;
  private readonly today: string;
  private readonly rng: () => number;

  constructor(
    private readonly plan: LearnerPlan,
    private readonly lessons: readonly LessonRef[],
    private readonly now: Date,
    private readonly createdAt: Date
  ) {
    this.today = vnDateKey(now);
    this.anchorKey = vnDateKey(createdAt);
    this.rng = rngFrom(`roadmap:${plan.key}:${plan.subject}`);
  }

  private dates(anchorKey: string, anchorNumber: number): Map<number, string> {
    return scheduleMap(this.lessons.length, anchorKey, anchorNumber, this.plan.studyDays);
  }

  /** Giờ học buổi tối 19:00–22:30; null nếu chưa tới (sau `now`) — kẹp ≥ lúc ghi danh + 20 phút. */
  private evening(dateKey: string, lateDays = 0): Date | null {
    const day = addDaysToLocalDate(dateKey, lateDays);
    const t = atLocal(day, 19 + Math.floor(this.rng() * 3), Math.floor(this.rng() * 60));
    const at = new Date(Math.max(t.getTime(), this.createdAt.getTime() + 20 * MIN));
    return at.getTime() > this.now.getTime() - 3 * MIN ? null : at;
  }

  private complete(l: LessonRef, dateKey: string, lateDays = 0): boolean {
    const done = this.evening(dateKey, lateDays);
    if (!done) return false;
    const started = new Date(Math.max(done.getTime() - (30 + Math.floor(this.rng() * 90)) * MIN, this.createdAt.getTime() + 10 * MIN));
    this.rows.set(l.number, { lesson: l, status: "COMPLETED", startedAt: started, completedAt: done });
    return true;
  }

  private skip(l: LessonRef): void {
    this.rows.set(l.number, { lesson: l, status: "SKIPPED", startedAt: null, completedAt: null });
  }

  /** Buổi của hôm nay: đang học dở (đã mở từ chiều) nếu lúc đó đã qua. */
  private inProgressToday(l: LessonRef, dateKey: string): void {
    const started = atLocal(dateKey, 8 + Math.floor(this.rng() * 8), Math.floor(this.rng() * 60));
    if (started.getTime() < this.createdAt.getTime() + 10 * MIN || started.getTime() > this.now.getTime() - 5 * MIN) return;
    this.rows.set(l.number, { lesson: l, status: "IN_PROGRESS", startedAt: started, completedAt: null });
  }

  /** Đã mở buổi học vào ngày dự kiến nhưng chưa xong (đang học dở, vẫn quá hạn). */
  private openUnfinished(l: LessonRef, dateKey: string): void {
    const started = atLocal(dateKey, 19 + Math.floor(this.rng() * 3), Math.floor(this.rng() * 60));
    if (started.getTime() < this.createdAt.getTime() + 10 * MIN || started.getTime() > this.now.getTime() - 5 * MIN) return;
    this.rows.set(l.number, { lesson: l, status: "IN_PROGRESS", startedAt: started, completedAt: null });
  }

  run(): void {
    const dates = this.dates(this.anchorKey, 1);
    const due = this.lessons.filter((l) => (dates.get(l.number) ?? "9999") < this.today);
    const todays = this.lessons.filter((l) => dates.get(l.number) === this.today);
    const r = this.rng;
    switch (this.plan.style) {
      case "steady":
      case "ahead":
        for (const l of due) {
          const d = dates.get(l.number) as string;
          if (l.optional) {
            if (r() < 0.55) this.complete(l, d, Math.floor(r() * 2));
            else if (r() < 0.4) this.skip(l);
          } else {
            const x = r();
            if (x < 0.9) this.complete(l, d);
            else if (x < 0.95) this.complete(l, d, 1 + Math.floor(r() * 2));
            else if (x < 0.98) this.openUnfinished(l, d);
            // còn lại: bỏ lỡ buổi này (nợ 1 buổi quá hạn)
          }
        }
        for (const l of todays) if (!l.optional && r() < 0.6) this.inProgressToday(l, this.today);
        if (this.plan.style === "ahead") {
          const pending = this.lessons.filter((l) => !this.rows.has(l.number) && !l.optional && (dates.get(l.number) ?? "") >= this.today);
          const ahead = pending.slice(0, 3 + Math.floor(r() * 3));
          ahead.forEach((l, i) => {
            const at = new Date(Math.min(snapActive(new Date(this.now.getTime() - (ahead.length - i) * (5 + Math.floor(r() * 10)) * 3_600_000)).getTime(), this.now.getTime() - 5 * MIN));
            if (at.getTime() < this.createdAt.getTime() + 30 * MIN) return;
            this.rows.set(l.number, { lesson: l, status: "COMPLETED", startedAt: new Date(at.getTime() - 55 * MIN), completedAt: at });
          });
        }
        break;
      case "behind": {
        const onTime = Math.ceil(due.length * 0.35);
        due.forEach((l, i) => {
          const d = dates.get(l.number) as string;
          if (i < onTime) this.complete(l, d);
          else if (r() < 0.3) this.complete(l, d, 2 + Math.floor(r() * 4));
          else if (r() < 0.3) this.openUnfinished(l, d);
        });
        break;
      }
      case "skipper":
        for (const l of due) {
          const d = dates.get(l.number) as string;
          const x = r();
          if (l.optional) {
            if (x < 0.6) this.skip(l);
            else if (x < 0.85) this.complete(l, d);
          } else if (x < 0.62) this.complete(l, d);
          else if (x < 0.82) this.skip(l);
          // còn lại: bỏ lỡ (không đụng tới)
        }
        for (const l of todays) if (!l.optional && r() < 0.5) this.inProgressToday(l, this.today);
        break;
      case "paused": {
        const pauseKey = addDaysToLocalDate(this.today, -(this.plan.pausedDaysAgo ?? 5));
        for (const l of due) if ((dates.get(l.number) as string) <= pauseKey && r() < 0.95) this.complete(l, dates.get(l.number) as string);
        this.paused = true;
        break;
      }
      case "rescheduled": {
        const at = new Date(this.now.getTime() - (this.plan.rescheduleDaysAgo ?? 4) * DAY_MS);
        const cutKey = vnDateKey(at);
        for (const l of due) {
          const d = dates.get(l.number) as string;
          if (d < cutKey && r() < 0.55) this.complete(l, d);
        }
        const firstPending = this.lessons.find((l) => !l.optional && !this.rows.has(l.number));
        if (firstPending) {
          this.anchorNumber = firstPending.number;
          this.anchorKey = nextStudyDateKey(cutKey, this.plan.studyDays);
          this.rescheduledAt = at;
          const dates2 = this.dates(this.anchorKey, this.anchorNumber);
          for (const l of this.lessons) {
            if (l.number < this.anchorNumber || this.rows.has(l.number) || l.optional) continue;
            const d = dates2.get(l.number) as string;
            if (d < this.today && r() < 0.92) this.complete(l, d);
            else if (d === this.today && r() < 0.6) this.inProgressToday(l, d);
          }
        }
        break;
      }
      case "fresh": {
        // Mới ghi danh: buổi đầu xong đúng hẹn nếu đã qua ngày dự kiến, hoặc đang học dở nếu là hôm nay.
        const first = this.lessons[0];
        const d = first ? (dates.get(first.number) ?? "9999") : "9999";
        if (first && d < this.today) this.complete(first, d);
        else if (first && d === this.today) this.inProgressToday(first, d);
        break;
      }
    }
  }
}

async function seedPlan(c: ModuleCtx, plan: LearnerPlan, user: UserInfo, subject: { id: string }, lessons: LessonRef[], drafts: XpDraft[]): Promise<"created" | "skipped"> {
  if (await prisma.roadmapEnrollment.findUnique({ where: { userId_subjectId: { userId: user.id, subjectId: subject.id } }, select: { id: true } })) return "skipped";
  const startAt = new Date(Math.max(c.now.getTime() - plan.startDaysAgo * DAY_MS, user.createdAt.getTime() + 3_600_000));
  const sim = new Simulator(plan, lessons, c.now, startAt);
  sim.run();
  const rng = rngFrom(`roadmap-rows:${plan.key}:${plan.subject}`);
  const notes = plan.subject === "english" ? NOTES_ENGLISH : NOTES_FULLSTACK;

  const rows = [...sim.rows.values()].sort((a, b) => a.lesson.number - b.lesson.number);
  const progress = rows.map((row) => {
    const l = row.lesson;
    const done = row.status === "COMPLETED";
    const checked =
      done ? (l.checklistIds.length > 1 && rng() < 0.15 ? l.checklistIds.slice(0, -1) : l.checklistIds) : row.status === "IN_PROGRESS" ? l.checklistIds.slice(0, Math.floor(rng() * (l.checklistIds.length + 1))) : [];
    const selfRating = done ? (rng() < 0.55 ? 3 : rng() < 0.78 ? 2 : 1) : null;
    const at = row.completedAt ?? row.startedAt ?? startAt;
    return {
      userId: user.id,
      subjectId: subject.id,
      lessonId: l.id,
      status: row.status,
      checkedItemIds: checked,
      selfRating,
      note: done && rng() < 0.25 ? notes[Math.floor(rng() * notes.length)] : null,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      version: done ? 2 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2),
      createdAt: row.startedAt ?? at,
      updatedAt: at,
    };
  });
  const completed = rows.filter((r) => r.status === "COMPLETED");
  const last = rows.reduce<Row | null>((m, r) => {
    const t = (r.completedAt ?? r.startedAt)?.getTime() ?? 0;
    return !m || t > ((m.completedAt ?? m.startedAt)?.getTime() ?? 0) ? r : m;
  }, null);
  const lastAt = last ? (last.completedAt ?? last.startedAt) : null;

  await prisma.$transaction(
    async (tx) => {
      await tx.roadmapEnrollment.create({
        data: {
          id: newObjectId(),
          userId: user.id,
          subjectId: subject.id,
          status: sim.paused ? "PAUSED" : "ACTIVE",
          anchorDate: toAnchorDate(sim.anchorKey, TZ),
          anchorNumber: sim.anchorNumber,
          studyDays: plan.studyDays,
          timezone: TZ,
          completedCount: completed.length,
          requiredDone: completed.filter((r) => !r.lesson.optional).length,
          lastLessonId: last ? last.lesson.id : null,
          lastActivityAt: lastAt,
          rescheduledAt: sim.rescheduledAt,
          // Chưa hoàn thành cả môn — `completedAt` ghi null tường minh.
          completedAt: null,
          version: 1 + completed.length + (sim.rescheduledAt ? 1 : 0) + (sim.paused ? 1 : 0),
          createdAt: startAt,
          updatedAt: new Date(Math.max(lastAt?.getTime() ?? 0, sim.rescheduledAt?.getTime() ?? 0, startAt.getTime())),
        },
      });
      if (progress.length > 0) await tx.roadmapLessonProgress.createMany({ data: progress });
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
  for (const r of completed) drafts.push({ userId: user.id, sourceType: "ROADMAP_LESSON", sourceId: r.lesson.id, at: r.completedAt as Date });
  return "created";
}

export const seedRoadmap: ModuleSeed = async (c) => {
  const users = await loadUsers(c, LEARNERS.map((l) => l.key));
  const subjects = new Map<string, { id: string; lessons: LessonRef[] }>();
  const missing: string[] = [];
  for (const slug of ["fullstack", "english"] as const) {
    const s = await prisma.roadmapSubject.findUnique({ where: { slug } });
    if (!s || s.status !== "PUBLISHED" || s.deletedAt) {
      missing.push(slug);
      continue;
    }
    const lessons = await prisma.roadmapLesson.findMany({ where: { subjectId: s.id, deletedAt: null, published: true }, orderBy: { number: "asc" } });
    subjects.set(slug, { id: s.id, lessons: lessons.map((l) => ({ id: l.id, number: l.number, optional: l.optional, checklistIds: l.checklist.map((i) => i.id) })) });
  }

  const drafts: XpDraft[] = [];
  let created = 0;
  let skipped = 0;
  for (const plan of LEARNERS) {
    const user = users.get(plan.key);
    const subject = subjects.get(plan.subject);
    if (!user || !subject || subject.lessons.length === 0) continue;
    if ((await seedPlan(c, plan, user, subject, subject.lessons, drafts)) === "created") created += 1;
    else skipped += 1;
  }
  const xp = await awardXp(drafts, c.now);
  const progressRows = await prisma.roadmapLessonProgress.count({ where: { userId: { in: [...users.values()].map((u) => u.id) } } });
  return `roadmap: +${created} ghi danh (${skipped} đã có sẵn, bỏ qua), ${progressRows} dòng tiến độ buổi tổng cộng, +${xp.events} sự kiện XP ROADMAP_LESSON cho ${xp.users} người (+${xp.badges} huy hiệu)${missing.length ? `; thiếu môn đã xuất bản: ${missing.join(", ")}` : ""}`;
};
