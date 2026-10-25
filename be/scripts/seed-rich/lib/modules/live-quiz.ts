/**
 * Seed phân hệ LIVE QUIZ: các phiên thi đấu đã kết thúc từ bộ học có sẵn của nhóm (tag `seed-rich:<slug>`) và kết quả bền từng người —
 * phần Mongo mà job `live-quiz.persist` (`LiveQuizPersistService.persistResults`) ghi; điểm/đáp án nóng ở Redis KHÔNG được ghi.
 *
 * Quy ước lấy từ mã thật: chỉ câu TRẮC NGHIỆM MỘT ĐÁP ÁN ĐÚNG (`eligibleQuestions`) mới vào phiên (TRUE_FALSE/FILL_BLANK bị loại ở P0); điểm đúng =
 * `base + floor(speedBonus × (1 − ms/span))` (1000/500), sai/bỏ trống = 0; hạng = thứ tự ZSET (điểm giảm dần, cùng điểm thì tổng ms các câu ĐÚNG nhỏ hơn
 * đứng trước, hoà nữa thì userId giảm dần); mọi người trong phòng đều có một dòng kết quả (kể cả 0 điểm). Phiên: `FINISHED`, `version = số câu + 2`
 * (CAS Redis: 1 + số lần mở câu + 1 lần đóng), `currentIndex` = câu cuối đã mở, `playersCount` = số người chơi, `resultsPersistedAt` đã đặt; host KHÔNG
 * có dòng kết quả. Không phát XP (`quiz.scored`), không outbox, không Redis.
 */
import { LIMITS } from "../../../../src/core/constants/limits";
import { MIN_MS, prisma } from "../core";
import type { ModuleSeed } from "../module-ctx";
import { atVn, between, stableId, mixedRng } from "./mpq-util";
import { QUIZ_PLANS, type QuizPlan } from "./live-quiz.content";

const SCORING = { base: LIMITS.liveQuiz.scoring.base, speedBonus: LIMITS.liveQuiz.scoring.speedBonus };
const REVEAL_SECONDS = LIMITS.liveQuiz.revealSeconds;

interface Question {
  itemId: string;
  options: number;
  correct: number;
}

interface AnswerRec {
  index: number;
  itemId: string;
  choice: number | null;
  correct: boolean;
  ms: number | null;
  points: number;
}

interface PlayerResult {
  userId: string;
  nickname: string;
  score: number;
  correct: number;
  answered: number;
  cumulativeMs: number;
  rank: number;
  answers: AnswerRec[];
}

const pointsOf = (ok: boolean, ms: number, seconds: number): number => (ok ? SCORING.base + Math.floor(SCORING.speedBonus * (1 - Math.min(Math.max(ms, 0), seconds * 1000) / (seconds * 1000))) : 0);

/** Câu đủ điều kiện làm câu live (bản sao `eligibleQuestions`): trắc nghiệm, đủ số lựa chọn, đúng một đáp án đúng. */
function eligible(items: Array<{ id: string; type: string; prompt: string; options: Array<{ id: string }>; correctOptionIds: string[] }>): Question[] {
  const out: Question[] = [];
  for (const it of items) {
    if (it.type !== "MULTIPLE_CHOICE" || it.prompt.trim() === "") continue;
    if (it.options.length < LIMITS.study.optionsMin || it.options.length > LIMITS.study.optionsMax || it.correctOptionIds.length !== 1) continue;
    const correct = it.options.findIndex((o) => o.id === it.correctOptionIds[0]);
    if (correct >= 0) out.push({ itemId: it.id, options: it.options.length, correct });
  }
  return out;
}

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Đáp án của một người ở một câu, tất định theo (phiên, người, câu). */
function answerFor(planKey: string, who: string, skill: number, speed: number, q: Question, index: number, seconds: number): AnswerRec {
  const rng = mixedRng(`quiz:${planKey}:${who}:${index}`);
  if (rng() < Math.max(0, 0.06 - skill * 0.05)) return { index, itemId: q.itemId, choice: null, correct: false, ms: null, points: 0 };
  const ok = rng() < skill;
  const wrong = Array.from({ length: q.options }, (_, i) => i).filter((i) => i !== q.correct);
  const choice = ok ? q.correct : (wrong[Math.floor(rng() * wrong.length)] as number);
  const span = seconds * 1000;
  const ms = Math.round(Math.min(Math.max(span * (0.1 + (1 - speed) * 0.55 + rng() * 0.2), 900), span * 0.94));
  return { index, itemId: q.itemId, choice, correct: ok, ms, points: pointsOf(ok, ms, seconds) };
}

interface ResolvedQuiz {
  id: string;
  plan: QuizPlan;
  workspaceId: string;
  setId: string;
  setTitle: string;
  hostId: string;
  pin: string;
  questionOrder: string[];
  asked: number;
  createdAt: Date;
  startedAt: Date;
  lastQuestionStartedAt: Date;
  lastDeadlineAt: Date;
  endedAt: Date;
  endReason: "COMPLETED" | "HOST_ENDED";
  persistedAt: Date;
  results: PlayerResult[];
}

export const seedLiveQuiz: ModuleSeed = async (c) => {
  const wsList = [...c.workspaces.values()];
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: { in: wsList.map((w) => w.id) }, status: "ACTIVE" },
    select: { workspaceId: true, userId: true, joinedAt: true },
  });
  const joined = new Map(memberships.map((m) => [`${m.workspaceId}:${m.userId}`, m.joinedAt]));
  const nameOf = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(memberships.map((m) => m.userId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  let sessions = 0;
  let results = 0;
  const skipped: string[] = [];
  const summary: string[] = [];
  const thuId = c.dir.id("thu");
  for (const plan of QUIZ_PLANS) {
    const ws = c.workspaces.get(plan.ws);
    const set = ws ? await prisma.studySet.findFirst({ where: { tags: { has: `seed-rich:${plan.slug}` }, deletedAt: null, status: "ACTIVE" } }) : null;
    if (!ws || !set) {
      skipped.push(`${plan.key} (thiếu nhóm/bộ học)`);
      continue;
    }
    const since = (key: string): Date | undefined => (ws.roles.get(key) === "OWNER" ? ws.createdAt : joined.get(`${ws.id}:${c.dir.id(key)}`));
    const items = await prisma.studyItem.findMany({ where: { setId: set.id }, orderBy: { order: "asc" }, select: { id: true, type: true, prompt: true, options: true, correctOptionIds: true } });
    const pool = eligible(items);
    const rng = mixedRng(`quiz-plan:${plan.key}`);
    let createdAt = atVn(c.now, -plan.day, plan.at[0], plan.at[1]);
    while (createdAt.getTime() > c.now.getTime() - 30 * MIN_MS) createdAt = new Date(createdAt.getTime() - 86_400_000);
    const lower = Math.max(ws.createdAt.getTime(), set.createdAt.getTime()) + 5 * MIN_MS;
    const hostSince = since(plan.host)?.getTime();
    const players = plan.players.filter((p) => ws.roles.has(p.who) && (since(p.who)?.getTime() ?? Infinity) + 10 * MIN_MS <= createdAt.getTime());
    if (pool.length < 3 || createdAt.getTime() < lower || !ws.roles.has(plan.host) || hostSince === undefined || hostSince + 10 * MIN_MS > createdAt.getTime() || players.length < 3) {
      skipped.push(`${plan.key} (${pool.length < 3 ? "bộ học chưa đủ câu trắc nghiệm" : "trước khi nhóm/bộ học/người chơi tồn tại"})`);
      continue;
    }

    const questions = shuffle(pool, mixedRng(`quiz-order:${plan.key}`)).slice(0, Math.min(plan.count, pool.length));
    const total = questions.length;
    const asked = plan.stopAfter ? Math.min(plan.stopAfter, total) : total;
    const seconds = plan.seconds;

    // Điểm số từng người theo công thức thật; xếp hạng theo thứ tự ZSET.
    const rows: PlayerResult[] = players.map((p) => {
      const answers = questions.map((qn, i) => (i < asked ? answerFor(plan.key, p.who, p.skill, p.speed, qn, i, seconds) : { index: i, itemId: qn.itemId, choice: null, correct: false, ms: null, points: 0 }));
      return {
        userId: c.dir.id(p.who),
        nickname: (p.nick ?? nameOf.get(c.dir.id(p.who)) ?? p.who).slice(0, LIMITS.liveQuiz.nicknameMax),
        score: answers.reduce((n, a) => n + a.points, 0),
        correct: answers.filter((a) => a.correct).length,
        answered: answers.filter((a) => a.choice !== null).length,
        cumulativeMs: answers.reduce((n, a) => n + (a.correct ? (a.ms ?? 0) : 0), 0),
        rank: 0,
        answers,
      };
    });
    rows.sort((a, b) => b.score - a.score || a.cumulativeMs - b.cumulativeMs || (a.userId < b.userId ? 1 : -1));
    rows.forEach((r, i) => (r.rank = i + 1));

    // Đồng hồ phiên: phòng chờ → từng câu (đóng sớm khi mọi người đã trả lời) → công bố → host bấm tiếp.
    const startedAt = new Date(createdAt.getTime() + Math.round(between(rng, 2, 6) * MIN_MS));
    let qStart = startedAt.getTime();
    let lastStart = qStart;
    let revealAt = qStart;
    for (let i = 0; i < asked; i += 1) {
      lastStart = qStart;
      const allAnswered = rows.every((r) => r.answers[i]?.ms !== null);
      const closeMs = allAnswered ? Math.max(...rows.map((r) => r.answers[i]?.ms ?? 0)) + 300 : seconds * 1000 + LIMITS.liveQuiz.answerGraceMs;
      revealAt = qStart + closeMs;
      qStart = revealAt + REVEAL_SECONDS * 1000 + (plan.autoAdvance ? 0 : Math.round(between(rng, 2000, 9000)));
    }
    const endedAt = new Date(revealAt + (plan.autoAdvance ? REVEAL_SECONDS * 1000 : Math.round(between(rng, 3000, 14_000))));
    const persistedAt = new Date(endedAt.getTime() + Math.round(between(rng, 800, 4000)));
    const pinRng = mixedRng(`quiz-pin:${plan.key}`);
    const quiz: ResolvedQuiz = {
      id: stableId(`live-quiz:${plan.key}`), plan, workspaceId: ws.id, setId: set.id, setTitle: set.title, hostId: c.dir.id(plan.host),
      pin: String(Math.floor(pinRng() * 1_000_000)).padStart(6, "0"), questionOrder: questions.map((x) => x.itemId), asked, createdAt,
      startedAt, lastQuestionStartedAt: new Date(lastStart), lastDeadlineAt: new Date(lastStart + seconds * 1000), endedAt,
      endReason: asked < total ? "HOST_ENDED" : "COMPLETED", persistedAt, results: rows,
    };

    if (!(await prisma.liveQuizSession.findUnique({ where: { id: quiz.id }, select: { id: true } }))) {
      await prisma.liveQuizSession.create({
        data: {
          id: quiz.id, setId: quiz.setId, setTitle: quiz.setTitle, workspaceId: quiz.workspaceId, hostId: quiz.hostId, pin: quiz.pin, status: "FINISHED",
          questionOrder: quiz.questionOrder, currentIndex: asked - 1, questionStartedAt: quiz.lastQuestionStartedAt, deadlineAt: quiz.lastDeadlineAt,
          secondsPerQuestion: seconds, revealSeconds: REVEAL_SECONDS, autoAdvance: plan.autoAdvance ?? false, scoring: SCORING, playersCount: rows.length,
          version: asked + 2, startedAt: quiz.startedAt, endedAt: quiz.endedAt, endReason: quiz.endReason, resultsPersistedAt: quiz.persistedAt,
          createdAt: quiz.createdAt, updatedAt: quiz.persistedAt,
        },
      });
      sessions += 1;
    }
    const have = new Set((await prisma.liveQuizResult.findMany({ where: { sessionId: quiz.id }, select: { userId: true } })).map((r) => r.userId));
    const missing = rows.filter((r) => !have.has(r.userId));
    if (missing.length > 0) {
      await prisma.liveQuizResult.createMany({
        data: missing.map((r) => ({
          sessionId: quiz.id, userId: r.userId, nickname: r.nickname, score: r.score, correct: r.correct, answered: r.answered, rank: r.rank,
          answers: r.answers.map((a) => ({ index: a.index, itemId: a.itemId, choice: a.choice, correct: a.correct, ms: a.ms, points: a.points })),
          createdAt: quiz.persistedAt,
        })),
      });
      results += missing.length;
    }
    const mine = rows.find((r) => r.userId === thuId);
    summary.push(`${plan.key}: ${rows.length} người${mine ? `, thu hạng ${mine.rank} (${mine.score}đ)` : plan.host === "thu" ? ", thu làm host" : ""}`);
  }
  const skip = skipped.length > 0 ? `; bỏ qua ${skipped.length} phiên: ${skipped.join(", ")}` : "";
  return `Live Quiz: +${sessions} phiên đã kết thúc, +${results} kết quả (${summary.join("; ")})${skip}`;
};
