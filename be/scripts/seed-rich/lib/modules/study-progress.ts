/**
 * Seed ôn tập ngắt quãng (SR) + thi thử (p4-02) cho 13 người trên các bộ học đã seed (tag `seed-rich:<slug>`).
 *
 * SR: mỗi cặp (người, bộ) có `SrEnrollment` + `SrProgress` cho MỌI mục (như `ensureProgress`) và nhật ký `SrReviewLog` 7–14 ngày được mô phỏng bằng ĐÚNG
 * hàm SM-2 của backend (`review`/`lapse`/`initialNewState`/`initialWrongState` trong `modules/study/services/sm2`): easiness, interval, repetition, lapses, `nextReviewAt`
 * (00:00 ngày địa phương + interval) đều do thuật toán thật sinh ra — nên có thẻ đến hạn hôm nay một cách tự nhiên. Thi thử: câu hỏi chọn bằng `pickQuestions`,
 * chấm bằng `scoreAttempt`; câu sai kéo thẻ về hàng ôn (`lapse` nếu đã có tiến độ, `MOCK_WRONG` nếu chưa). XP/chuỗi/huy hiệu ghi qua `career-xp`.
 *
 * Idempotent theo cặp (người, bộ): đã có ghi danh (hoặc đã có lượt thi với cặp chỉ-thi-thử) → bỏ qua cả cặp, nên các ghi danh có sẵn của thu không bị đụng.
 */
import { LIMITS } from "../../../../src/core/constants/limits";
import { localDate, startOfLocalDayPlus } from "../../../../src/core/utils/local-date";
import { RATING_GRADE, initialNewState, initialWrongState, lapse, review, type SrRatingValue, type SrState } from "../../../../src/modules/study/services/sm2";
import { DAY_MS, prisma, rngFrom } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import { loadUsers, notifyDirect, vnDateKey, type DirectNotification, type UserInfo } from "./career-common";
import { STUDY_PLANS, type SetPlan } from "./study-progress.content";
import { buildAttempt, type BuiltAttempt, type ItemRow } from "./study-progress.mock";
import { awardXp, type XpDraft } from "./career-xp";

const TZ = "Asia/Ho_Chi_Minh";
const MIN = 60_000;
const HOUR = 3_600_000;

interface Card {
  item: ItemRow;
  state: SrState;
  source: "ENROLL" | "MOCK_WRONG";
  createdAt: Date;
  touchedAt: Date;
  version: number;
}

interface LogRow {
  userId: string;
  itemId: string;
  setId: string;
  clientReviewId: string;
  rating: SrRatingValue;
  grade: number;
  prevInterval: number;
  newInterval: number;
  localDate: string;
  reviewedAt: Date;
}

/** Thời điểm UTC của `hh:mm` giờ VN trong ngày địa phương `YYYY-MM-DD`. */
function atLocal(dateKey: string, hour: number, minute: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - 7 * HOUR);
}

function pickRating(recall: number, rng: () => number): SrRatingValue {
  const x = rng();
  const fail = 1 - recall;
  if (x < fail * 0.55) return "AGAIN";
  if (x < fail) return "HARD";
  return rng() < 0.25 ? "EASY" : "GOOD";
}

interface PairResult {
  logs: LogRow[];
  cards: Card[];
  attempts: BuiltAttempt[];
  enrolledAt: Date;
  lastTouch: Date;
}

function simulatePair(c: ModuleCtx, userKey: string, userId: string, plan: SetPlan, items: readonly ItemRow[], lower: Date, setId: string): PairResult {
  const rng = rngFrom(`study:${userKey}:${plan.slug}`);
  const now = c.now;
  const todayKey = vnDateKey(now);
  const cards = new Map<string, Card>();
  const logs: LogRow[] = [];
  const attempts: BuiltAttempt[] = [];

  // Mốc ghi danh: buổi tối của ngày `startDaysAgo`, không trước `lower` (tài khoản/bộ/nhóm).
  const dayOf = vnDateKey(new Date(now.getTime() - plan.startDaysAgo * DAY_MS));
  let enrolledAt = atLocal(dayOf, 18 + Math.floor(rng() * 3), Math.floor(rng() * 60));
  if (enrolledAt < lower) enrolledAt = new Date(lower.getTime() + 5 * MIN);
  if (enrolledAt > now) enrolledAt = new Date(now.getTime() - 30 * MIN);

  if (plan.enroll) {
    for (const item of items) cards.set(item.id, { item, state: initialNewState(enrolledAt), source: "ENROLL", createdAt: enrolledAt, touchedAt: enrolledAt, version: 1 });
  }

  type Ev = { at: Date; kind: "sr"; day: string } | { at: Date; kind: "mock"; built: BuiltAttempt };
  const events: Ev[] = [];

  if (plan.enroll) {
    let key = vnDateKey(enrolledAt);
    while (key <= todayKey) {
      const isEnrollDay = key === vnDateKey(enrolledAt);
      const active = isEnrollDay || rng() < plan.activeRate;
      if (active) {
        if (key === todayKey) {
          if (plan.today === "partial") {
            const at = new Date(now.getTime() - (15 + Math.floor(rng() * 90)) * MIN);
            if (at > atLocal(key, 7, 0) && at > enrolledAt) events.push({ at, kind: "sr", day: key });
          }
        } else {
          const base = isEnrollDay ? new Date(enrolledAt.getTime() + (3 + Math.floor(rng() * 20)) * MIN) : atLocal(key, 18 + Math.floor(rng() * 4), Math.floor(rng() * 60));
          events.push({ at: base, kind: "sr", day: key });
        }
      }
      const [y, m, d] = key.split("-").map(Number);
      key = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
  }

  const gradable = items.filter((i) => i.type !== "FLASHCARD");
  (plan.mocks ?? []).forEach((mp, k) => {
    if (gradable.length === 0) return;
    const submitted = atLocal(vnDateKey(new Date(now.getTime() - mp.daysAgo * DAY_MS)), 20 + Math.floor(rng() * 2), Math.floor(rng() * 60));
    let when = submitted;
    const minStart = new Date((plan.enroll ? enrolledAt : lower).getTime() + 30 * MIN + mp.durationMin * 60_000);
    if (when < minStart) when = minStart;
    if (when > new Date(now.getTime() - 5 * MIN)) when = new Date(now.getTime() - 5 * MIN);
    const built = buildAttempt({ ...mp, count: Math.min(mp.count, gradable.length) }, gradable, when, rngFrom(`mock:${userKey}:${plan.slug}:${k}`));
    if (built) events.push({ at: built.submittedAt, kind: "mock", built });
  });
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const reviewCount = new Map<string, number>();
  let lastTouch = enrolledAt;
  for (const ev of events) {
    lastTouch = ev.at > lastTouch ? ev.at : lastTouch;
    if (ev.kind === "mock") {
      const b = ev.built;
      attempts.push(b);
      for (const itemId of b.wrongItemIds) {
        const card = cards.get(itemId);
        const item = items.find((i) => i.id === itemId);
        if (card) {
          card.state = lapse(card.state, b.submittedAt, TZ);
          card.touchedAt = b.submittedAt;
          card.version += 1;
        } else if (item) {
          cards.set(itemId, { item, state: initialWrongState(b.submittedAt, TZ), source: "MOCK_WRONG", createdAt: b.submittedAt, touchedAt: b.submittedAt, version: 1 });
        }
      }
      continue;
    }
    const endOfDay = startOfLocalDayPlus(ev.at, TZ, 1);
    const due = [...cards.values()]
      .filter((cd) => (cd.state.status === "LEARNING" || cd.state.status === "REVIEW") && cd.state.nextReviewAt < endOfDay)
      .sort((a, b) => a.state.nextReviewAt.getTime() - b.state.nextReviewAt.getTime())
      .slice(0, 40);
    const fresh = [...cards.values()].filter((cd) => cd.state.status === "NEW" && cd.source === "ENROLL").sort((a, b) => a.item.order - b.item.order).slice(0, plan.newPerDay);
    let queue = [...due, ...fresh];
    if (ev.day === todayKey) queue = queue.slice(0, Math.max(1, Math.round(queue.length * 0.55)));
    let t = ev.at.getTime();
    for (const card of queue) {
      t += (12 + Math.floor(rng() * 45)) * 1000;
      const at = new Date(Math.min(t, now.getTime() - MIN));
      const rating = pickRating(plan.recall, rng);
      const prev = card.state;
      card.state = review(prev, rating, at, TZ);
      card.touchedAt = at;
      card.version += 1;
      const n = (reviewCount.get(card.item.id) ?? 0) + 1;
      reviewCount.set(card.item.id, n);
      logs.push({ userId, itemId: card.item.id, setId, clientReviewId: `seed-rich:sr:${userKey}:${card.item.id}:${n}`, rating, grade: RATING_GRADE[rating], prevInterval: prev.interval, newInterval: card.state.interval, localDate: localDate(at, TZ), reviewedAt: at });
      if (at > lastTouch) lastTouch = at;
    }
  }
  return { logs, cards: [...cards.values()], attempts, enrolledAt, lastTouch };
}

export const seedStudyProgress: ModuleSeed = async (c) => {
  const users = await loadUsers(c, STUDY_PLANS.map((p) => p.key));
  const drafts: XpDraft[] = [];
  const notes: DirectNotification[] = [];
  const stat = { enrollments: 0, progress: 0, logs: 0, attempts: 0, answers: 0, pairsSkipped: 0, missing: 0 };

  for (const p of STUDY_PLANS) {
    const user: UserInfo | undefined = users.get(p.key);
    if (!user) continue;
    for (const plan of p.sets) {
      const ws = c.workspaces.get(plan.ws);
      const spec = ws?.spec.studySets.find((s) => s.slug === plan.slug);
      if (!ws || !spec) { stat.missing += 1; continue; }
      const set = await prisma.studySet.findFirst({ where: { ownerId: c.dir.id(spec.owner), tags: { has: `seed-rich:${spec.slug}` }, deletedAt: null, status: "ACTIVE" } });
      if (!set) { stat.missing += 1; continue; }
      // Người dùng phải đọc được bộ: bộ PUBLIC, hoặc bộ nhóm mà họ là thành viên ACTIVE.
      const member = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } }, select: { status: true, joinedAt: true } });
      if (set.visibility !== "PUBLIC" && member?.status !== "ACTIVE") { stat.missing += 1; continue; }

      const done = plan.enroll
        ? await prisma.srEnrollment.findUnique({ where: { userId_setId: { userId: user.id, setId: set.id } }, select: { id: true } })
        : (await prisma.mockAttempt.count({ where: { userId: user.id, setId: set.id } })) >= (plan.mocks?.length ?? 0) && (plan.mocks?.length ?? 0) > 0
          ? { id: "mock" }
          : null;
      if (done) { stat.pairsSkipped += 1; continue; }

      const items = (await prisma.studyItem.findMany({ where: { setId: set.id }, orderBy: { order: "asc" } })).map<ItemRow>((i) => ({
        id: i.id, setId: i.setId, ownerId: i.ownerId, type: i.type, prompt: i.prompt, answerText: i.answerText ?? null,
        options: i.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId ?? null })),
        correctOptionIds: i.correctOptionIds, acceptedAnswers: i.acceptedAnswers, matchMode: i.matchMode, explanation: i.explanation ?? null, tags: i.tags, order: i.order, createdAt: i.createdAt,
      }));
      if (items.length === 0) continue;
      const lower = new Date(Math.max(user.createdAt.getTime() + HOUR, set.createdAt.getTime() + 30 * MIN, member ? member.joinedAt.getTime() + 30 * MIN : 0));
      const sim = simulatePair(c, p.key, user.id, plan, items, lower, set.id);

      await prisma.$transaction(
        async (tx) => {
          if (plan.enroll) {
            await tx.srEnrollment.create({ data: { userId: user.id, setId: set.id, active: true, newPerDay: Math.min(plan.newPerDay, LIMITS.sr.newPerDayMax), syncedVersion: set.version, createdAt: sim.enrolledAt, updatedAt: sim.lastTouch } });
          }
          if (sim.cards.length > 0) {
            await tx.srProgress.createMany({
              data: sim.cards.map((cd) => ({
                userId: user.id, itemId: cd.item.id, setId: set.id, status: cd.state.status, source: cd.source, easiness: cd.state.easiness, interval: cd.state.interval, repetition: cd.state.repetition, lapses: cd.state.lapses,
                nextReviewAt: cd.state.nextReviewAt, itemOrder: cd.item.order,
                // Quy ước Mongo null-vs-absent: các field này được lọc bằng null.
                lastRating: cd.state.lastRating, lastReviewedAt: cd.state.lastReviewedAt, suspendedReason: null,
                version: cd.version, createdAt: cd.createdAt, updatedAt: cd.touchedAt,
              })),
            });
          }
          if (sim.logs.length > 0) await tx.srReviewLog.createMany({ data: sim.logs });
          for (const a of sim.attempts) {
            await tx.mockAttempt.create({
              data: {
                id: a.id, userId: user.id, setId: set.id, setTitle: set.title, setVersion: set.version, config: a.config,
                questions: a.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })) })),
                status: a.status, activeKey: a.activeKey, startedAt: a.startedAt, expiresAt: a.expiresAt, submittedAt: a.submittedAt, submitMode: a.submitMode,
                answeredCount: a.answeredCount, correctCount: a.correctCount, scorePct: a.scorePct, passed: a.passed, byTag: a.byTag,
                backgroundCount: a.backgroundCount, backgroundMs: a.backgroundMs, lastBackgroundAt: null, eventCount: a.eventCount, version: 2, createdAt: a.startedAt, updatedAt: a.submittedAt,
              },
            });
            if (a.answers.length > 0) {
              await tx.mockAnswer.createMany({
                data: a.answers.map((x) => ({ attemptId: a.id, userId: user.id, itemId: x.itemId, optionIds: x.optionIds, text: x.text, timeMs: x.timeMs, correct: x.correct, partial: x.partial, answeredAt: x.answeredAt, updatedAt: a.submittedAt })),
              });
            }
          }
        },
        { timeout: 60_000, maxWait: 10_000 }
      );
      stat.enrollments += plan.enroll ? 1 : 0;
      stat.progress += sim.cards.length;
      stat.logs += sim.logs.length;
      stat.attempts += sim.attempts.length;
      stat.answers += sim.attempts.reduce((n, a) => n + a.answers.length, 0);

      // XP: SR_REVIEW (mỗi thẻ mỗi ngày một lần) + SR_REVIEW_DAY (mỗi ngày một lần); thi thử: QUIZ_SCORED (+ QUIZ_PASSED khi đạt).
      const firstOfItemDay = new Set<string>();
      const dayFirst = new Map<string, Date>();
      for (const l of sim.logs) {
        const k = `${l.itemId}:${l.localDate}`;
        if (!firstOfItemDay.has(k)) {
          firstOfItemDay.add(k);
          drafts.push({ userId: user.id, sourceType: "SR_REVIEW", sourceId: k, at: l.reviewedAt, counters: { srReviews: 1 } });
        }
        const prev = dayFirst.get(l.localDate);
        if (!prev || l.reviewedAt < prev) dayFirst.set(l.localDate, l.reviewedAt);
      }
      for (const [day, at] of dayFirst) drafts.push({ userId: user.id, sourceType: "SR_REVIEW_DAY", sourceId: day, at, counters: { srReviewDays: 1 } });
      for (const a of sim.attempts) {
        drafts.push({ userId: user.id, sourceType: "QUIZ_SCORED", sourceId: a.id, at: a.submittedAt, factor: a.scorePct / 100, counters: { quizzesTaken: 1, ...(a.scorePct >= 90 ? { quizHighScores: 1 } : {}) } });
        if (a.passed) drafts.push({ userId: user.id, sourceType: "QUIZ_PASSED", sourceId: a.id, at: a.submittedAt, counters: { quizzesPassed: 1 } });
        if (a.submitMode === "AUTO") {
          const key = `mock-auto:${a.id}`;
          notes.push({ type: "study.mock-auto-submitted", recipientId: user.id, sourceType: "MockAttempt", sourceId: key, refs: { attemptId: a.id, setId: set.id }, dedupeKey: key, createdAt: a.submittedAt, unread: c.now.getTime() - a.submittedAt.getTime() < 3 * DAY_MS });
        }
      }
    }
  }
  const xp = await awardXp(drafts, c.now);
  const sent = await notifyDirect(notes, c.now);
  return `study-progress: +${stat.enrollments} ghi danh SR, +${stat.progress} tiến độ thẻ, +${stat.logs} nhật ký ôn, +${stat.attempts} lượt thi thử (+${stat.answers} đáp án), +${xp.events} sự kiện XP cho ${xp.users} người (+${xp.badges} huy hiệu), +${sent} thông báo; ${stat.pairsSkipped} cặp đã có (bỏ qua)${stat.missing ? `, ${stat.missing} cặp không dùng được (thiếu bộ/quyền)` : ""}`;
};
