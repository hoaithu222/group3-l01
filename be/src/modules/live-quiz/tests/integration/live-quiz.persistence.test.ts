/**
 * Integration — repository Prisma + transaction + outbox THẬT trên Mongo memory replset (`TEST_DB=memory`; không set → SKIP để không đụng DB thật):
 * ghi null tường minh (bẫy "trường vắng ≠ null" của Prisma+Mongo), CAS đóng phiên/`resultsPersistedAt`, unique `(sessionId,userId)`, cursor lịch sử,
 * vòng đời phiên → `live-quiz.persist` trong CÙNG transaction, `persistResults` idempotent + LQ-07 (crash giữa persist → transaction hoàn tác thật).
 */
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { PrismaLiveQuizRepository } from "../../repositories/live-quiz.repository.prisma";
import { PrismaQuizOutbox, PrismaTxRunner } from "../../repositories/tx";
import { InMemoryLiveQuizStore } from "../../redis/live-quiz.store.inmemory";
import { LiveQuizService } from "../../services/live-quiz.service";
import type { OutboxEventInput } from "../../../../infrastructure/queue";
import type { TxHandle } from "../../repositories/tx";
import { FakeAudit, FakeClock, FakeContent, FakeScheduler, FakeUsers, FakeWorkspaces, RecordingQuizEmitter, mcItem, oid, userOf } from "../support/quiz-fakes";

const describeDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
const HOST = oid(1);
const created: string[] = [];

/** `OutboxEvent` không có unique index trong Mongo memory (không `db push`) — chỉ cần đếm/đọc lại. */
class FlakyOutbox extends PrismaQuizOutbox {
  failAddMany = 0;
  override async addMany(tx: TxHandle, events: OutboxEventInput[]): Promise<void> {
    if (this.failAddMany > 0) {
      this.failAddMany -= 1;
      throw new Error("Giả lập: worker chết giữa persist");
    }
    await super.addMany(tx, events);
  }
}

function build() {
  const clock = new FakeClock();
  clock.set(Date.now());
  const store = new InMemoryLiveQuizStore(clock.now);
  const repo = new PrismaLiveQuizRepository();
  const outbox = new FlakyOutbox();
  const content = new FakeContent();
  const emitter = new RecordingQuizEmitter();
  const service = new LiveQuizService({
    repo,
    store,
    content,
    users: new FakeUsers(),
    workspaces: new FakeWorkspaces(),
    emitter,
    tx: new PrismaTxRunner(),
    outbox,
    scheduler: new FakeScheduler(),
    audit: new FakeAudit(),
    now: clock.now,
  });
  return { clock, store, repo, outbox, content, service };
}

async function playedSession(b: ReturnType<typeof build>, playerCount = 2) {
  const setId = b.content.addSet(HOST, (id) => [mcItem(id, HOST, 0), mcItem(id, HOST, 1)]);
  const host = userOf(HOST);
  const { session, pin } = await b.service.create(host, { setId, count: 2, secondsPerQuestion: 20, shuffle: false, autoAdvance: false });
  created.push(session.id);
  const ids = Array.from({ length: playerCount }, (_, i) => oid(100 + i));
  for (const id of ids) await b.service.join(userOf(id), { pin });
  await b.service.advance(host, session.id, "start", 1);
  b.clock.advance(300);
  await b.service.answer(userOf(ids[0]), session.id, 0, 0); // đúng
  if (ids[1]) await b.service.answer(userOf(ids[1]), session.id, 0, 3); // sai
  await b.service.end(host, session.id, 2, false);
  return { id: session.id, ids };
}

describeDb("Prisma thật — repository + transaction + outbox", () => {
  // Chốt an toàn: test này GHI/XOÁ dữ liệu — chỉ được chạy trên Mongo memory replset của `global-setup` (loopback), tuyệt đối không phải DB thật trong `.env`.
  beforeAll(() => {
    const url = process.env.DATABASE_URL ?? "";
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
      throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
    }
  });

  afterAll(async () => {
    if (created.length === 0) return; // chưa tạo gì (vd chốt an toàn ở trên từ chối chạy) → không đụng DB
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: created } } });
    await prisma.liveQuizResult.deleteMany({ where: { sessionId: { in: created } } });
    await prisma.liveQuizSession.deleteMany({ where: { id: { in: created } } });
  });

  it("create ghi null TƯỜNG MINH: trường trống khớp `{ field: null }` (Prisma+Mongo: vắng mặt ≠ null) và findRaw thấy trường", async () => {
    const b = build();
    const sessionId = newObjectId();
    created.push(sessionId);
    await b.repo.create({ id: sessionId, setId: oid(9), setTitle: "T", workspaceId: null, hostId: HOST, pin: "123456", questionOrder: [oid(1)], secondsPerQuestion: 20, revealSeconds: 5, autoAdvance: false, scoring: { base: 1000, speedBonus: 500 } });
    const byNull = await prisma.liveQuizSession.findMany({ where: { id: sessionId, resultsPersistedAt: null, endedAt: null, startedAt: null, endReason: null } });
    expect(byNull).toHaveLength(1);
    const raw = (await prisma.liveQuizSession.findRaw({ filter: { _id: { $oid: sessionId } } })) as unknown as Array<Record<string, unknown>>;
    for (const field of ["resultsPersistedAt", "endedAt", "startedAt", "endReason", "questionStartedAt", "deadlineAt", "workspaceId"]) expect(raw[0]).toHaveProperty(field, null);
  });

  it("markPersistedIf: chỉ phiên FINISHED, chỉ MỘT lời gọi thắng (song song), kể cả doc CŨ thiếu hẳn trường (isSet:false)", async () => {
    const b = build();
    const sid = newObjectId();
    created.push(sid);
    await b.repo.create({ id: sid, setId: oid(9), setTitle: "T", workspaceId: null, hostId: HOST, pin: "123456", questionOrder: [oid(1)], secondsPerQuestion: 20, revealSeconds: 5, autoAdvance: false, scoring: { base: 1000, speedBonus: 500 } });
    expect(await b.repo.markPersistedIf(sid, new Date())).toBe(false); // chưa FINISHED
    expect(await b.repo.closeIfOpen(sid, { status: "FINISHED", endReason: "COMPLETED", endedAt: new Date(), version: 2, playersCount: 1 })).toBe(true);
    expect(await b.repo.closeIfOpen(sid, { status: "CANCELLED", endReason: "EXPIRED", endedAt: new Date(), version: 3, playersCount: 1 })).toBe(false); // CAS: đã đóng
    const wins = await Promise.all([b.repo.markPersistedIf(sid, new Date()), b.repo.markPersistedIf(sid, new Date()), b.repo.markPersistedIf(sid, new Date())]);
    expect(wins.filter(Boolean)).toHaveLength(1);

    const legacy = newObjectId();
    created.push(legacy);
    await prisma.$runCommandRaw({
      insert: "LiveQuizSession",
      documents: [{ _id: { $oid: legacy }, setId: { $oid: oid(9) }, setTitle: "Cũ", hostId: { $oid: HOST }, pin: "654321", status: "FINISHED", questionOrder: [], currentIndex: -1, secondsPerQuestion: 20, revealSeconds: 5, autoAdvance: false, scoring: { base: 1000, speedBonus: 500 }, playersCount: 0, version: 2, createdAt: { $date: new Date().toISOString() }, updatedAt: { $date: new Date().toISOString() } }],
    });
    expect(await prisma.liveQuizSession.count({ where: { id: legacy, resultsPersistedAt: null } })).toBe(0); // đúng bẫy: `null` KHÔNG khớp trường vắng
    expect(await b.repo.markPersistedIf(legacy, new Date())).toBe(true);
    expect(await b.repo.markPersistedIf(legacy, new Date())).toBe(false);
  });

  it("mirrorProgress chỉ áp bản MỚI hơn và khi phiên còn mở; unique (sessionId,userId) chặn kết quả trùng (P2002)", async () => {
    const b = build();
    const sid = newObjectId();
    created.push(sid);
    await b.repo.create({ id: sid, setId: oid(9), setTitle: "T", workspaceId: null, hostId: HOST, pin: "111111", questionOrder: [oid(1), oid(2)], secondsPerQuestion: 20, revealSeconds: 5, autoAdvance: false, scoring: { base: 1000, speedBonus: 500 } });
    const at = new Date();
    await b.repo.mirrorProgress(sid, { version: 3, status: "IN_PROGRESS", currentIndex: 1, questionStartedAt: at, deadlineAt: at });
    await b.repo.mirrorProgress(sid, { version: 2, status: "IN_PROGRESS", currentIndex: 0, questionStartedAt: at, deadlineAt: at }); // cũ hơn → bỏ
    expect(await b.repo.findById(sid)).toMatchObject({ version: 3, currentIndex: 1, status: "IN_PROGRESS" });
    await b.repo.closeIfOpen(sid, { status: "CANCELLED", endReason: "HOST_ENDED", endedAt: at, version: 4, playersCount: 0 });
    await b.repo.mirrorProgress(sid, { version: 9, status: "IN_PROGRESS", currentIndex: 1, questionStartedAt: at, deadlineAt: at }); // đã đóng → bỏ
    expect((await b.repo.findById(sid))?.status).toBe("CANCELLED");

    await prisma.$runCommandRaw({ createIndexes: "LiveQuizResult", indexes: [{ key: { sessionId: 1, userId: 1 }, name: "LiveQuizResult_sessionId_userId_key", unique: true }] });
    const row = { sessionId: sid, userId: oid(100), nickname: "A", score: 10, correct: 1, answered: 1, rank: 1, answers: [] };
    await b.repo.createResults([row]);
    await expect(b.repo.createResults([row])).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.liveQuizResult.count({ where: { sessionId: sid } })).toBe(1);
  });

  it("lịch sử của tôi: cursor (createdAt, id) không sót/không trùng kể cả khi cùng createdAt; admin phân trang + lọc", async () => {
    const b = build();
    const user = oid(555);
    const at = new Date();
    const sids = [newObjectId(), newObjectId(), newObjectId()];
    for (const sid of sids) {
      created.push(sid);
      await b.repo.create({ id: sid, setId: oid(9), setTitle: "T", workspaceId: null, hostId: HOST, pin: "222222", questionOrder: [oid(1)], secondsPerQuestion: 20, revealSeconds: 5, autoAdvance: false, scoring: { base: 1000, speedBonus: 500 } });
    }
    await prisma.liveQuizResult.createMany({ data: sids.map((sessionId) => ({ sessionId, userId: user, nickname: "N", score: 1, correct: 1, answered: 1, rank: 1, answers: [], createdAt: at })) });
    const seen: string[] = [];
    let after: { at: Date; id: string } | null = null;
    for (;;) {
      const page = await b.repo.listResultsByUser(user, after, 2);
      seen.push(...page.map((r) => r.id));
      if (page.length < 2) break;
      after = { at: page[1].createdAt, id: page[1].id };
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(seen).toEqual([...seen].sort().reverse());
    const list = await b.repo.adminList({ page: 1, limit: 2, status: "WAITING" });
    expect(list.items).toHaveLength(2);
    expect(list.total).toBeGreaterThanOrEqual(3);
  });

  it("vòng đời qua service: end ghi outbox `live-quiz.persist` CÙNG transaction; persist idempotent; quiz.scored đúng 1 lần/người", async () => {
    const b = build();
    const { id, ids } = await playedSession(b);
    expect(await prisma.liveQuizSession.findUnique({ where: { id } })).toMatchObject({ status: "FINISHED", endReason: "HOST_ENDED", playersCount: 2, resultsPersistedAt: null });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: id, jobName: "live-quiz.persist" } })).toBe(1);

    expect(await b.service.persistResults(id)).toBe(2);
    expect(await b.service.persistResults(id)).toBe(0);
    const rows = await prisma.liveQuizResult.findMany({ where: { sessionId: id }, orderBy: { rank: "asc" } });
    expect(rows.map((r) => [r.userId, r.rank, r.correct, r.answered])).toEqual([[ids[0], 1, 1, 1], [ids[1], 2, 0, 1]]);
    expect((await prisma.liveQuizSession.findUnique({ where: { id } }))?.resultsPersistedAt).toBeInstanceOf(Date);
    const xp = await prisma.outboxEvent.findMany({ where: { aggregateId: id, jobName: "xp.consume" } });
    expect(xp.map((e) => e.dedupeKey).sort()).toEqual(ids.map((u) => `quiz.scored:live:${id}:${u}`).sort());
    const res = await b.service.results(userOf(ids[0]), id);
    expect(res).toMatchObject({ persisted: true, setTitle: "Bộ thử", total: 2 });
  });

  it("LQ-07: persist lỗi giữa chừng (sau khi đánh dấu + ghi kết quả) → transaction Mongo hoàn tác THẬT; chạy lại ghi đủ", async () => {
    const b = build();
    const { id, ids } = await playedSession(b);
    b.outbox.failAddMany = 1;
    await expect(b.service.persistResults(id)).rejects.toThrow("worker chết");
    expect(await prisma.liveQuizResult.count({ where: { sessionId: id } })).toBe(0);
    expect((await prisma.liveQuizSession.findUnique({ where: { id } }))?.resultsPersistedAt).toBeNull();
    expect(await prisma.outboxEvent.count({ where: { aggregateId: id, jobName: "xp.consume" } })).toBe(0);
    expect(await b.service.persistResults(id)).toBe(2);
    expect(await prisma.liveQuizResult.count({ where: { sessionId: id } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: id, jobName: "xp.consume" } })).toBe(ids.length);
  });
});
