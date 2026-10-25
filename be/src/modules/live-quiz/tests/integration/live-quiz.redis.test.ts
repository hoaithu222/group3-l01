/**
 * Integration — Lua + bus lệnh trên REDIS THẬT (be.md §10: `lua.test.ts` "chạy Redis thật"; ioredis-mock không đủ Lua). Chạy khi có Redis:
 * CI (`CI=true`, service `redis:7`) hoặc cục bộ `TEST_REDIS=1 REDIS_URL=redis://127.0.0.1:6379`; không có → SKIP (không phải xanh giả: CI luôn chạy).
 * Phủ: LQ-01/02 ở tầng Lua, LQ-04 (hai instance thấy cùng bảng xếp hạng), LQ-05 (version race), ST-08 (đồng thời), công thức điểm Lua = TS,
 * tie-break, TTL, jobId hẹn giờ được BullMQ CHẤP NHẬN, worker → API qua pub/sub thật.
 */
import { randomInt } from "crypto";
import { env } from "../../../../core/config";
import { newObjectId } from "../../../../core/utils/object-id";
import { redis } from "../../../../infrastructure/redis";
import { closeQueues, getQueue, queueConnection } from "../../../../infrastructure/queue";
import type { QuizCommand } from "../../entities/live-quiz.commands";
import { COMMAND_CHANNEL, QuizCommandBus, jobIdOf } from "../../realtime/live-quiz.command-bus";
import { NodeRedisLiveQuizStore } from "../../redis/live-quiz.redis-store";
import { InMemoryLiveQuizStore } from "../../redis/live-quiz.store.inmemory";
import type { ILiveQuizStore, QuizInit } from "../../redis/live-quiz.store.types";
import { computePoints } from "../../services/live-quiz-scoring";
import { oid } from "../support/quiz-fakes";

const enabled = process.env.CI === "true" || process.env.TEST_REDIS === "1";
const describeRedis = enabled ? describe : describe.skip;
jest.setTimeout(30_000);

const store = new NodeRedisLiveQuizStore();
const ids: string[] = [];
const SID = newObjectId();
const cmds: QuizCommand[] = [
  { type: "close", sessionId: SID, index: 0 },
  { type: "advance", sessionId: SID, index: 0 },
  { type: "host-timeout", sessionId: SID, lastSeenMs: 1_700_000_000_123 },
];

const question = (i: number) => ({ itemId: oid(0x900 + i), prompt: `Câu ${i}`, options: [0, 1, 2, 3].map((k) => ({ text: `L${k}`, mediaAssetId: null })), explanation: `GT ${i}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function newSession(o: { total?: number; seconds?: number; corrects?: string[]; ttl?: number } = {}) {
  const id = newObjectId();
  ids.push(id);
  const total = o.total ?? 3;
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const init: QuizInit = {
    id,
    pin,
    meta: { hostId: oid(1), workspaceId: null, setId: oid(0x77), setTitle: "Bộ Redis", total, seconds: o.seconds ?? 5, revealSeconds: 5, autoAdvance: false, base: 1000, bonus: 500 },
    questions: Array.from({ length: total }, (_, i) => question(i)),
    corrects: o.corrects ?? Array.from({ length: total }, () => "1:4"),
    ttlSeconds: o.ttl ?? 120,
  };
  await store.init(init);
  return { id, pin, seconds: o.seconds ?? 5, total };
}
const player = (n: number, at = 0) => ({ userId: oid(100 + n), nickname: `P${n}`, avatarAssetId: null, joinedAtMs: at + n });
const answerP = (id: string, n: number, index: number, choice: number, seconds = 5) =>
  store.answer(id, { userId: oid(100 + n), index, choice, base: 1000, bonus: 500, seconds });

beforeAll(async () => {
  if (enabled) await redis.connect();
});
afterAll(async () => {
  if (!enabled) return;
  const client = redis.getClient();
  if (client?.isReady) {
    for (const id of ids) for await (const key of client.scanIterator({ MATCH: `${env.REDIS_KEY_PREFIX}quiz:{${id}}:*`, COUNT: 100 })) await client.del(key);
  }
  for (const c of cmds) await getQueue("reports").remove(jobIdOf(c)).catch(() => undefined);
  await closeQueues();
  await queueConnection.quit().catch(() => undefined);
  await redis.disconnect();
});

describeRedis("Redis thật — store + Lua", () => {
  it("init/getMeta khứ hồi (kể cả setTitle) + mọi khoá có TTL; PIN SET NX chỉ một người giữ được", async () => {
    const s = await newSession();
    expect(await store.getMeta(s.id)).toMatchObject({ status: "WAITING", phase: "LOBBY", currentIndex: -1, version: 1, setTitle: "Bộ Redis", total: 3, seconds: 5, base: 1000, bonus: 500, autoAdvance: false, workspaceId: null });
    const client = redis.getClient()!;
    for (const key of ["meta", "questions", "correct"]) expect(await client.ttl(`${env.REDIS_KEY_PREFIX}quiz:{${s.id}}:${key}`)).toBeGreaterThan(0);
    expect(await store.claimPin(s.pin, s.id, 60)).toBe(true);
    expect(await store.claimPin(s.pin, oid(5), 60)).toBe(false);
    expect(await store.resolvePin(s.pin)).toBe(s.id);
    await store.releasePin(s.pin);
    expect(await store.resolvePin(s.pin)).toBeNull();
  });

  it("join: JOINED → EXISTS (idempotent, có số người) → FULL → KICKED → ENDED → GONE", async () => {
    const s = await newSession();
    expect(await store.join(s.id, player(1), 2)).toEqual({ kind: "JOINED", playersCount: 1 });
    expect(await store.join(s.id, player(1), 2)).toEqual({ kind: "EXISTS", playersCount: 1 });
    expect(await store.join(s.id, player(2), 2)).toEqual({ kind: "JOINED", playersCount: 2 });
    expect(await store.join(s.id, player(3), 2)).toEqual({ kind: "FULL" });
    expect(await store.kick(s.id, oid(102))).toBe(true);
    expect(await store.join(s.id, player(2), 2)).toEqual({ kind: "KICKED" });
    expect(await store.hasPlayer(s.id, oid(102))).toBe(false);
    await store.finish(s.id, null, "CANCELLED", "*");
    expect(await store.join(s.id, player(3), 5)).toEqual({ kind: "ENDED" });
    expect(await store.join(newObjectId(), player(3), 5)).toEqual({ kind: "GONE" });
  });

  it("LQ-05: hai host `start` cùng version → đúng MỘT thắng; sai trạng thái/version/hết câu được báo đúng", async () => {
    const s = await newSession({ total: 2 });
    const [a, b] = await Promise.all([store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 5, total: 2 }), store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 5, total: 2 })]);
    expect([a.kind, b.kind].sort()).toEqual(["OK", "VERSION"]);
    expect(await store.advance(s.id, { mode: "next", expectedVersion: 2, seconds: 5, total: 2 })).toEqual({ kind: "STATE", status: "IN_PROGRESS" }); // chưa công bố
    expect(await store.close(s.id, 1)).toBe(false); // lệch câu
    expect(await store.close(s.id, 0)).toBe(true);
    expect(await store.close(s.id, 0)).toBe(false); // chỉ đóng MỘT lần
    const next = await store.advance(s.id, { mode: "next", expectedVersion: 2, seconds: 5, total: 2 });
    expect(next).toMatchObject({ kind: "OK", index: 1, version: 3 });
    await store.close(s.id, 1);
    expect(await store.advance(s.id, { mode: "next", expectedVersion: 3, seconds: 5, total: 2 })).toEqual({ kind: "END" });
    expect(await store.advance(newObjectId(), { mode: "start", expectedVersion: 1, seconds: 5, total: 2 })).toEqual({ kind: "GONE" });
  });

  it("LQ-01: một đáp án/người/câu (song song 10 lần → 1 OK + 9 DUP), lựa chọn sai → BAD_CHOICE, người lạ → NOT_PLAYER, câu chưa mở → CLOSED", async () => {
    const s = await newSession({ seconds: 30 }); // hạn dài: phần đúng/sai không phụ thuộc tốc độ máy
    await store.join(s.id, player(1), 10);
    expect(await answerP(s.id, 1, 0, 1, 30)).toEqual({ kind: "STATE" }); // chưa start
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 30, total: 3 });
    expect((await answerP(s.id, 9, 0, 1, 30)).kind).toBe("NOT_PLAYER");
    expect((await answerP(s.id, 1, 0, 4, 30)).kind).toBe("BAD_CHOICE");
    expect((await answerP(s.id, 1, 1, 1, 30)).kind).toBe("CLOSED"); // câu 1 chưa mở
    const burst = await Promise.all(Array.from({ length: 10 }, () => answerP(s.id, 1, 0, 1, 30)));
    expect(burst.filter((r) => r.kind === "OK")).toHaveLength(1);
    expect(burst.filter((r) => r.kind === "DUP")).toHaveLength(9);
    expect(await store.stats(s.id, 0)).toEqual({ "1": 1 });
    expect(await store.close(s.id, 0)).toBe(true);
    expect((await answerP(s.id, 1, 0, 2, 30)).kind).toBe("CLOSED"); // câu đã đóng (REVEAL)
  });

  it("LQ-02: đáp án đến SAU deadline (đo bằng TIME của Redis) → CLOSED, không tính điểm/thống kê", async () => {
    const s = await newSession({ seconds: 1 });
    await store.join(s.id, player(1), 10);
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 1, total: 3 });
    await sleep(1150); // luôn quá hạn 1 s dù máy chậm đến đâu (chỉ có thể MUỘN hơn)
    expect((await answerP(s.id, 1, 0, 1, 1)).kind).toBe("CLOSED");
    expect(await store.stats(s.id, 0)).toEqual({});
    expect((await store.scores(s.id))[0]).toMatchObject({ userId: oid(101), score: 0 });
  });

  it("công thức điểm Lua = TS (computePoints) với ms do Redis TIME đo; sai → 0 điểm không đổi bảng; tie-break theo tổng ms", async () => {
    const s = await newSession({ seconds: 30 });
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 30, total: 3 });
    for (const n of [1, 2, 3]) await store.join(s.id, player(n), 10);
    await sleep(40);
    const r1 = await answerP(s.id, 1, 0, 1, 30);
    await sleep(25);
    const r2 = await answerP(s.id, 2, 0, 1, 30);
    const r3 = await answerP(s.id, 3, 0, 0, 30); // sai
    const answers = await store.answers(s.id, 0);
    for (const [r, n] of [[r1, 1], [r2, 2]] as const) {
      expect(r.kind).toBe("OK");
      if (r.kind === "OK") expect(r.points).toBe(computePoints(true, answers.get(oid(100 + n))!.ms, 30, { base: 1000, speedBonus: 500 }));
    }
    expect(r3).toMatchObject({ kind: "OK", points: 0 });
    const rows = await store.scores(s.id);
    expect(rows.map((r) => r.userId)).toEqual([oid(101), oid(102), oid(103)]); // người đúng sớm hơn xếp trên, người sai cuối
    expect(rows[0]).toMatchObject({ userId: oid(101), rank: 1, cumulativeMs: answers.get(oid(101))!.ms });
    expect(rows[2]).toMatchObject({ userId: oid(103), rank: 3, score: 0, cumulativeMs: 0 });
    expect(rows[0].score).toBeGreaterThanOrEqual(rows[1].score);
    expect(await store.counts(s.id, 0)).toEqual({ answered: 3, players: 3 });
  });

  it("ST-08: 30 người trả lời song song → mỗi người đúng 1 lần, `answered` chạy 1..30 không trùng, thống kê đủ 30", async () => {
    const s = await newSession({ seconds: 20 });
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 20, total: 3 });
    for (let n = 0; n < 30; n += 1) await store.join(s.id, player(n), 100);
    const res = await Promise.all(Array.from({ length: 30 }, (_, n) => answerP(s.id, n, 0, n % 4, 20)));
    expect(res.every((r) => r.kind === "OK")).toBe(true);
    const seen = res.map((r) => (r.kind === "OK" ? r.answered : 0)).sort((a, b) => a - b);
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const stats = await store.stats(s.id, 0);
    expect(Object.values(stats).reduce((a, b) => a + b, 0)).toBe(30);
    expect((await store.scores(s.id)).filter((r) => r.score > 0)).toHaveLength(8); // choice 1 đúng: n % 4 === 1 → 8 người
  });

  it("PARITY: InMemoryLiveQuizStore (dùng cho test đơn vị) cho CÙNG kết quả từng thao tác như Lua thật, kể cả thứ tự khi hoà điểm", async () => {
    const real = await newSession({ total: 2, seconds: 20 });
    const mem = new InMemoryLiveQuizStore();
    const memId = newObjectId();
    await mem.init({
      id: memId,
      pin: "123456",
      meta: { hostId: oid(1), workspaceId: null, setId: oid(0x77), setTitle: "Bộ Redis", total: 2, seconds: 20, revealSeconds: 5, autoAdvance: false, base: 1000, bonus: 500 },
      questions: [question(0), question(1)],
      corrects: ["1:4", "1:4"],
      ttlSeconds: 120,
    });
    const [fromRedis, fromMemory] = [await scenarioLog(store, real.id), await scenarioLog(mem, memId)];
    expect(fromMemory).toEqual(fromRedis);
    expect(fromRedis.length).toBeGreaterThan(30);
  });

  it("LQ-04: hai instance API (hai store cùng Redis) thấy CÙNG bảng xếp hạng/người chơi/trạng thái", async () => {
    const other = new NodeRedisLiveQuizStore();
    const s = await newSession();
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 5, total: 3 });
    await store.join(s.id, player(1), 10);
    await other.join(s.id, player(2), 10);
    await answerP(s.id, 1, 0, 1);
    await other.answer(s.id, { userId: oid(102), index: 0, choice: 1, base: 1000, bonus: 500, seconds: 5 });
    expect(await other.scores(s.id)).toEqual(await store.scores(s.id));
    expect((await other.players(s.id)).map((p) => p.userId)).toEqual((await store.players(s.id)).map((p) => p.userId));
    expect(await other.getMeta(s.id)).toEqual(await store.getMeta(s.id));
  });

  it("finish idempotent (OK → ALREADY), CAS version/trạng thái; expireAll đặt TTL cho cả khoá answers/stats từng câu", async () => {
    const s = await newSession({ total: 2 });
    await store.join(s.id, player(1), 10);
    await store.advance(s.id, { mode: "start", expectedVersion: 1, seconds: 5, total: 2 });
    await answerP(s.id, 1, 0, 1);
    expect(await store.finish(s.id, 9, "FINISHED", ["WAITING", "IN_PROGRESS"])).toEqual({ kind: "VERSION", version: 2 });
    expect(await store.finish(s.id, 2, "FINISHED", ["WAITING"])).toEqual({ kind: "STATE", status: "IN_PROGRESS" });
    expect(await store.finish(s.id, 2, "FINISHED", ["WAITING", "IN_PROGRESS"])).toEqual({ kind: "OK", prevStatus: "IN_PROGRESS", version: 3 });
    expect(await store.finish(s.id, null, "CANCELLED", "*")).toEqual({ kind: "ALREADY", status: "FINISHED", version: 3 });
    await store.expireAll(s.id, 2, 3600);
    const client = redis.getClient()!;
    for (const key of ["meta", "players", "scores", "correct", "questions", "answers:0", "stats:0"]) {
      expect(await client.ttl(`${env.REDIS_KEY_PREFIX}quiz:{${s.id}}:${key}`)).toBeGreaterThan(120);
    }
  });
});

/** Kịch bản không phụ thuộc đồng hồ: ghi lại KIND/đếm của từng thao tác — dùng để so bản in-memory với Lua thật. */
async function scenarioLog(st: ILiveQuizStore, id: string): Promise<unknown[]> {
  const log: unknown[] = [];
  const note = (label: string, v: unknown) => log.push([label, v]);
  const p = (n: number) => ({ userId: oid(100 + n), nickname: `P${n}`, avatarAssetId: null, joinedAtMs: n });
  const ans = (n: number, index: number, choice: number) => st.answer(id, { userId: oid(100 + n), index, choice, base: 1000, bonus: 500, seconds: 20 });
  const kindOf = <T extends { kind: string }>(r: T) => r.kind;
  for (const n of [1, 2, 3]) note(`join${n}`, await st.join(id, p(n), 3));
  note("join full", await st.join(id, p(4), 3));
  note("join again", await st.join(id, p(1), 3));
  note("answer before start", kindOf(await ans(1, 0, 1)));
  const start = await st.advance(id, { mode: "start", expectedVersion: 1, seconds: 20, total: 2 });
  note("start", start.kind === "OK" ? [start.kind, start.index, start.version] : start);
  note("start again", await st.advance(id, { mode: "start", expectedVersion: 1, seconds: 20, total: 2 }));
  note("next while open", await st.advance(id, { mode: "next", expectedVersion: 2, seconds: 20, total: 2 }));
  note("stranger", kindOf(await ans(9, 0, 1)));
  note("bad choice", kindOf(await ans(1, 0, 9)));
  note("other index", kindOf(await ans(1, 1, 1)));
  const ok = await ans(1, 0, 1);
  note("p1 correct", ok.kind === "OK" ? [ok.kind, ok.answered, ok.players] : ok);
  note("p1 dup", kindOf(await ans(1, 0, 0)));
  const wrong = await ans(2, 0, 0);
  note("p2 wrong", wrong.kind === "OK" ? [wrong.kind, wrong.points, wrong.answered] : wrong);
  note("counts", await st.counts(id, 0));
  note("hasAnswered", [await st.hasAnswered(id, 0, oid(101)), await st.hasAnswered(id, 0, oid(103)), await st.hasAnswered(id, 1, oid(101))]);
  note("stats", await st.stats(id, 0));
  note("close other", await st.close(id, 1));
  note("close", await st.close(id, 0));
  note("close twice", await st.close(id, 0));
  note("late p3", kindOf(await ans(3, 0, 1)));
  // điểm/ms phụ thuộc đồng hồ (Redis TIME vs Date.now, lệch 0–1 ms) → chỉ so thứ tự + "có điểm hay không", KHÔNG so giá trị
  note("ranking", (await st.scores(id)).map((r) => [r.userId, r.rank, r.score > 0 ? "scored" : 0]));
  note("kick", await st.kick(id, oid(102)));
  note("kick again", await st.kick(id, oid(102)));
  note("join kicked", await st.join(id, p(2), 3));
  const next = await st.advance(id, { mode: "next", expectedVersion: 2, seconds: 20, total: 2 });
  note("next", next.kind === "OK" ? [next.kind, next.index, next.version] : next);
  note("finish version", await st.finish(id, 99, "FINISHED", ["WAITING", "IN_PROGRESS"]));
  note("finish", await st.finish(id, null, "CANCELLED", "*"));
  note("finish twice", await st.finish(id, null, "FINISHED", "*"));
  note("join ended", await st.join(id, p(5), 3));
  const meta = await st.getMeta(id);
  note("meta", meta && [meta.status, meta.phase, meta.currentIndex, meta.version]);
  note("correctOf", await st.correctOf(id, 0));
  note("question", (await st.question(id, 0))?.prompt);
  note("missing", [await st.getMeta(newObjectId()), (await st.advance(newObjectId(), { mode: "start", expectedVersion: 1, seconds: 20, total: 2 })).kind]);
  return log;
}

describeRedis("Redis thật — bus lệnh hẹn giờ (BullMQ + pub/sub)", () => {
  it("BullMQ CHẤP NHẬN jobId (không ':'), job nằm ở trạng thái delayed đúng độ trễ; cancel gỡ đúng job", async () => {
    const bus = new QuizCommandBus(); // không executor: chỉ job bền, như worker
    for (const c of cmds) await bus.schedule(c, 60_000);
    for (const c of cmds) {
      const job = await getQueue("reports").getJob(jobIdOf(c));
      expect(job).toBeTruthy();
      expect(await job!.getState()).toBe("delayed");
      expect(job!.data).toEqual(c);
    }
    await bus.cancel(cmds[2]);
    expect(await getQueue("reports").getJob(jobIdOf(cmds[2]))).toBeFalsy();
    expect(await getQueue("reports").getJob(jobIdOf(cmds[0]))).toBeTruthy();
  });

  it("worker thuần (không executor) `dispatch` → publish → tiến trình API (executor + subscriber) nhận và chạy lệnh (worker không có getIO())", async () => {
    const api = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    api.setExecutor(executor);
    api.startSubscriber();
    for (let i = 0; i < 400 && !api.isSubscribed(); i += 1) await sleep(50); // chờ Redis xác nhận SUBSCRIBE (tối đa 20 s), không ngủ cố định
    expect(api.isSubscribed()).toBe(true);
    await new QuizCommandBus().dispatch(cmds[0]);
    const deadline = Date.now() + 10_000;
    while (executor.mock.calls.length === 0 && Date.now() < deadline) await sleep(20);
    expect(executor).toHaveBeenCalledWith(cmds[0]);
    // gói tin rác trên kênh không làm sập subscriber
    await redis.getClient()!.publish(COMMAND_CHANNEL, "khong phai json");
    await new QuizCommandBus().dispatch(cmds[1]);
    while (executor.mock.calls.length < 2 && Date.now() < deadline) await sleep(20);
    expect(executor).toHaveBeenLastCalledWith(cmds[1]);
    await api.stop();
  });
});
