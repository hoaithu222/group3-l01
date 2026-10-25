import { env } from "../../../core/config";
import { redis } from "../../../infrastructure/redis";
import type { LiveQuizStatusValue, QuizMeta, QuizPlayer, QuizScoreRow, StoredQuestion } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import { INITIAL_COMPOSITE, decodeComposite } from "../services/live-quiz-scoring";
import { ADVANCE_LUA, ANSWER_LUA, CLOSE_LUA, FINISH_LUA, JOIN_LUA } from "./live-quiz.lua";
import { quizKeys } from "./live-quiz.keys";
import { initialMetaHash, num, parseMeta } from "./live-quiz.meta";
import type { AdvanceParams, AdvanceResult, AnswerParams, AnswerResult, FinishResult, ILiveQuizStore, JoinResult, QuizInit } from "./live-quiz.store.types";

export type * from "./live-quiz.store.types";
export { parseMeta } from "./live-quiz.meta";

export class NodeRedisLiveQuizStore implements ILiveQuizStore {
  private client() {
    const c = redis.getClient();
    // `isOpen` chỉ có nghĩa "đã gọi connect()", không phản ánh đang thật sự
    // dùng được (xem chú thích chi tiết ở `redis.client.ts`) — phải kiểm
    // `isReady`, nếu không lệnh gửi trên client này sẽ treo thay vì báo lỗi ngay.
    if (!c?.isReady) throw quizErrors.unavailable();
    return c;
  }

  private k(key: string): string {
    return `${env.REDIS_KEY_PREFIX}${key}`;
  }

  private async run(script: string, keys: string[], args: Array<string | number>): Promise<string[]> {
    const reply = await this.client().eval(script, { keys: keys.map((key) => this.k(key)), arguments: args.map(String) });
    return (Array.isArray(reply) ? reply : [reply]).map((v) => String(v));
  }

  async claimPin(pin: string, sessionId: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client().set(this.k(quizKeys.pin(pin)), sessionId, { NX: true, EX: ttlSeconds })) === "OK";
  }

  resolvePin(pin: string): Promise<string | null> {
    return this.client().get(this.k(quizKeys.pin(pin)));
  }

  async releasePin(pin: string): Promise<void> {
    await this.client().del(this.k(quizKeys.pin(pin)));
  }

  async init(input: QuizInit): Promise<void> {
    const { id, ttlSeconds } = input;
    const meta = initialMetaHash(input);
    const questions: Record<string, string> = {};
    const corrects: Record<string, string> = {};
    input.questions.forEach((q, i) => {
      questions[String(i)] = JSON.stringify(q);
      corrects[String(i)] = input.corrects[i];
    });
    const keys = [quizKeys.meta(id), quizKeys.questions(id), quizKeys.correct(id)].map((key) => this.k(key));
    const multi = this.client().multi();
    multi.hSet(keys[0], meta).hSet(keys[1], questions).hSet(keys[2], corrects);
    for (const key of keys) multi.expire(key, ttlSeconds);
    await multi.exec();
  }

  async getMeta(id: string): Promise<QuizMeta | null> {
    return parseMeta(await this.client().hGetAll(this.k(quizKeys.meta(id))));
  }

  async join(id: string, player: QuizPlayer, max: number): Promise<JoinResult> {
    const { userId, ...rest } = player;
    const [kind, count] = await this.run(
      JOIN_LUA,
      [quizKeys.meta(id), quizKeys.players(id), quizKeys.scores(id), quizKeys.kicked(id)],
      [userId, JSON.stringify(rest), max, INITIAL_COMPOSITE]
    );
    if (kind === "JOINED" || kind === "EXISTS") return { kind, playersCount: num(count) };
    return { kind: kind as "FULL" | "KICKED" | "ENDED" | "GONE" };
  }

  async players(id: string): Promise<QuizPlayer[]> {
    const raw = await this.client().hGetAll(this.k(quizKeys.players(id)));
    return Object.entries(raw)
      .map(([userId, json]) => {
        const p = JSON.parse(json) as Omit<QuizPlayer, "userId">;
        return { userId, nickname: p.nickname, avatarAssetId: p.avatarAssetId ?? null, joinedAtMs: p.joinedAtMs };
      })
      .sort((a, b) => a.joinedAtMs - b.joinedAtMs);
  }

  async hasPlayer(id: string, userId: string): Promise<boolean> {
    return this.client().hExists(this.k(quizKeys.players(id)), userId);
  }

  async kick(id: string, userId: string): Promise<boolean> {
    const multi = this.client().multi();
    multi.hDel(this.k(quizKeys.players(id)), userId).zRem(this.k(quizKeys.scores(id)), userId).sAdd(this.k(quizKeys.kicked(id)), userId);
    const [removed] = (await multi.exec()) as unknown as [number, number, number];
    const ttl = await this.client().ttl(this.k(quizKeys.meta(id)));
    if (ttl > 0) await this.client().expire(this.k(quizKeys.kicked(id)), ttl);
    return Number(removed) > 0;
  }

  async advance(id: string, p: AdvanceParams): Promise<AdvanceResult> {
    const [kind, a, b, c, d] = await this.run(ADVANCE_LUA, [quizKeys.meta(id)], [p.mode, p.expectedVersion, p.seconds, p.total]);
    if (kind === "OK") return { kind, index: num(a), startedAtMs: num(b), deadlineAtMs: num(c), version: num(d) };
    if (kind === "VERSION") return { kind, version: num(a) };
    if (kind === "STATE") return { kind, status: a ?? "" };
    return { kind: kind as "END" | "GONE" };
  }

  async close(id: string, index: number): Promise<boolean> {
    const [r] = await this.run(CLOSE_LUA, [quizKeys.meta(id)], [index]);
    return r === "1";
  }

  async answer(id: string, p: AnswerParams): Promise<AnswerResult> {
    const [kind, points, answered, players] = await this.run(
      ANSWER_LUA,
      [quizKeys.meta(id), quizKeys.players(id), quizKeys.answers(id, p.index), quizKeys.stats(id, p.index), quizKeys.scores(id), quizKeys.correct(id)],
      [p.userId, p.index, p.choice, p.base, p.bonus, p.seconds]
    );
    if (kind === "OK") return { kind, points: num(points), answered: num(answered), players: num(players) };
    return { kind: kind as "GONE" | "STATE" | "NOT_PLAYER" | "CLOSED" | "BAD_CHOICE" | "DUP" };
  }

  async finish(id: string, expectedVersion: number | null, target: "FINISHED" | "CANCELLED", allowedFrom: readonly LiveQuizStatusValue[] | "*"): Promise<FinishResult> {
    const [kind, a, b] = await this.run(FINISH_LUA, [quizKeys.meta(id)], [expectedVersion ?? -1, target, allowedFrom === "*" ? "*" : allowedFrom.join("|")]);
    if (kind === "OK") return { kind, prevStatus: a as LiveQuizStatusValue, version: num(b) };
    if (kind === "ALREADY") return { kind, status: a as LiveQuizStatusValue, version: num(b) };
    if (kind === "VERSION") return { kind, version: num(a) };
    if (kind === "STATE") return { kind, status: a ?? "" };
    return { kind: "GONE" };
  }

  async question(id: string, index: number): Promise<StoredQuestion | null> {
    const raw = await this.client().hGet(this.k(quizKeys.questions(id)), String(index));
    return raw ? (JSON.parse(raw) as StoredQuestion) : null;
  }

  async correctOf(id: string, index: number): Promise<{ correctIndex: number; optionCount: number } | null> {
    const raw = await this.client().hGet(this.k(quizKeys.correct(id)), String(index));
    if (!raw) return null;
    const [c, n] = raw.split(":");
    return { correctIndex: Number(c), optionCount: Number(n) };
  }

  async stats(id: string, index: number): Promise<Record<string, number>> {
    const raw = await this.client().hGetAll(this.k(quizKeys.stats(id, index)));
    return Object.fromEntries(Object.entries(raw).map(([choice, count]) => [choice, num(count)]));
  }

  async answers(id: string, index: number): Promise<Map<string, { choice: number; ms: number }>> {
    const raw = await this.client().hGetAll(this.k(quizKeys.answers(id, index)));
    const out = new Map<string, { choice: number; ms: number }>();
    for (const [userId, value] of Object.entries(raw)) {
      const [choice, ms] = value.split(":");
      out.set(userId, { choice: num(choice), ms: num(ms) });
    }
    return out;
  }

  async hasAnswered(id: string, index: number, userId: string): Promise<boolean> {
    return this.client().hExists(this.k(quizKeys.answers(id, index)), userId);
  }

  async counts(id: string, index: number): Promise<{ answered: number; players: number }> {
    const multi = this.client().multi();
    multi.hLen(this.k(quizKeys.answers(id, index))).hLen(this.k(quizKeys.players(id)));
    const [answered, players] = (await multi.exec()) as unknown as [number, number];
    return { answered: Number(answered), players: Number(players) };
  }

  async scores(id: string): Promise<QuizScoreRow[]> {
    const rows = await this.client().zRangeWithScores(this.k(quizKeys.scores(id)), 0, -1, { REV: true });
    return rows.map((r, i) => ({ userId: r.value, rank: i + 1, ...decodeComposite(r.score) }));
  }

  async setHostLastSeen(id: string, ms: number): Promise<void> {
    await this.client().hSet(this.k(quizKeys.meta(id)), "hostLastSeenMs", String(ms));
  }

  async expireAll(id: string, total: number, ttlSeconds: number): Promise<void> {
    const keys = [quizKeys.meta(id), quizKeys.players(id), quizKeys.scores(id), quizKeys.correct(id), quizKeys.questions(id), quizKeys.kicked(id)];
    for (let i = 0; i < total; i += 1) keys.push(quizKeys.answers(id, i), quizKeys.stats(id, i));
    const multi = this.client().multi();
    for (const key of keys) multi.expire(this.k(key), ttlSeconds);
    await multi.exec();
  }
}
