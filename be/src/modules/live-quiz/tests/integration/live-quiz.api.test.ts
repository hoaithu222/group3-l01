/**
 * Integration — REST `/live-quiz*`, `/me/live-quiz/history`, `/admin/live-quiz/sessions*` qua Express + middleware THẬT (auth JWT, Zod, cờ
 * `live-quiz`, idempotencyKey, scopeLimiter, errorHandler); service + Redis store + repo in-memory (không cần Redis/Mongo).
 * Phủ: hình dạng response, mã lỗi/HTTP, quyền host/người chơi/người ngoài/admin, CAS `expectedVersion`, rate limit PIN, results/history.
 */
process.env.FEATURE_FLAGS = "study=true,live-quiz=true";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../../core/permission/tests/fixtures/fake-redis");
  return createFakeRedisModule();
});
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));
const mockCurrent: { h?: { service: unknown } } = {};
jest.mock("../../live-quiz.container", () => {
  const service = new Proxy(
    {},
    { get: (_t, prop) => (...args: unknown[]) => (mockCurrent.h?.service as Record<string, (...a: unknown[]) => unknown>)[String(prop)](...args) }
  );
  return { getLiveQuizContainer: () => ({ service, bus: {} }) };
});

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { installFakeRedis, type FakeRedisMock } from "../../../../core/permission/tests/fixtures/fake-redis";
import { JwtUtils } from "../../../../core/utils/jwt";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { redis } from "../../../../infrastructure/redis";
import adminLiveQuizRoutes from "../../live-quiz.admin.routes";
import liveQuizRoutes from "../../live-quiz.routes";
import { HOST, advance, makeHarness, newSession, type Harness } from "../support/quiz-harness";
import { mcItem, oid } from "../support/quiz-fakes";

const app = express();
app.use(express.json());
app.use("/api/v1", liveQuizRoutes);
app.use("/api/v1", adminLiveQuizRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const tokenFor = (userId: string, role = "user"): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
const auth = (userId: string, role = "user") => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });
const PLAYER = oid(100);

let h: Harness;
beforeEach(() => {
  installFakeRedis(redis as unknown as FakeRedisMock);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }); // `resetMocks: true` xoá implementation trước MỖI test
  h = makeHarness();
  mockCurrent.h = h;
});

describe("POST /live-quiz", () => {
  const body = (setId: string, extra: Record<string, unknown> = {}) => ({ setId, count: 2, secondsPerQuestion: 20, ...extra });

  it("401 khi chưa đăng nhập; 400 khi body sai (Zod) — kèm mã VAL_001", async () => {
    const setId = h.content.addSet(HOST, (id) => [mcItem(id, HOST, 0), mcItem(id, HOST, 1)]);
    expect((await request(app).post("/api/v1/live-quiz").send(body(setId))).status).toBe(401);
    const bad = await request(app).post("/api/v1/live-quiz").set(auth(HOST)).send({ setId: "x", count: 0, secondsPerQuestion: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VAL_001");
  });

  it("201 { session, pin }; cùng Idempotency-Key gửi lại → cùng phản hồi, KHÔNG tạo phiên thứ hai", async () => {
    const setId = h.content.addSet(HOST, (id) => [mcItem(id, HOST, 0), mcItem(id, HOST, 1)]);
    const first = await request(app).post("/api/v1/live-quiz").set(auth(HOST)).set("Idempotency-Key", "quiz-create-key-1").send(body(setId));
    expect(first.status).toBe(201);
    expect(first.body.data.pin).toMatch(/^\d{6}$/);
    expect(first.body.data.session).toMatchObject({ status: "WAITING", hostId: HOST, version: 1 });
    const again = await request(app).post("/api/v1/live-quiz").set(auth(HOST)).set("Idempotency-Key", "quiz-create-key-1").send(body(setId));
    expect(again.status).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body.data.session.id).toBe(first.body.data.session.id);
    expect((await h.repo.adminList({ page: 1, limit: 10 })).total).toBe(1);
  });

  it("QUIZ_006 (400) khi bộ không đủ câu; 404 khi bộ của người khác", async () => {
    const thin = h.content.addSet(HOST, (id) => [mcItem(id, HOST, 0)]);
    const short = await request(app).post("/api/v1/live-quiz").set(auth(HOST)).send(body(thin, { count: 5 }));
    expect([short.status, short.body.error.code]).toEqual([400, "QUIZ_006"]);
    const foreign = h.content.addSet(oid(77), (id) => [mcItem(id, oid(77), 0)]);
    expect((await request(app).post("/api/v1/live-quiz").set(auth(HOST)).send(body(foreign, { count: 1 }))).status).toBe(404);
  });
});

describe("POST /live-quiz/join", () => {
  it("200 { sessionId, snapshot } — người chơi KHÔNG thấy pin; PIN sai → 404 QUIZ_001; PIN sai định dạng → 400", async () => {
    const s = await newSession(h, { playerCount: 0 });
    const ok = await request(app).post("/api/v1/live-quiz/join").set(auth(PLAYER)).send({ pin: s.pin, nickname: "Bạn" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.sessionId).toBe(s.id);
    expect(ok.body.data.snapshot).toMatchObject({ id: s.id, status: "WAITING", setTitle: "Bộ thử", playersCount: 1 });
    expect(ok.body.data.snapshot).not.toHaveProperty("pin");
    const wrong = await request(app).post("/api/v1/live-quiz/join").set(auth(PLAYER)).send({ pin: "000000" });
    expect([wrong.status, wrong.body.error.code]).toEqual([404, "QUIZ_001"]);
    expect((await request(app).post("/api/v1/live-quiz/join").set(auth(PLAYER)).send({ pin: "12345" })).status).toBe(400);
  });

  it("chống dò PIN: quá joinPerMinute lần/phút/người → 429", async () => {
    const s = await newSession(h, { playerCount: 0 });
    jest.spyOn(Date, "now").mockReturnValue(Math.floor(Date.now() / 60_000) * 60_000 + 1_000); // cố định trong một cửa sổ phút
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) codes.push((await request(app).post("/api/v1/live-quiz/join").set(auth(PLAYER)).send({ pin: i % 2 ? s.pin : "999999" })).status);
    expect(codes.slice(0, 10).every((c) => c === 200 || c === 404)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it("phiên gắn workspace: người ngoài nhóm → 403 PERM_001; thành viên vào được", async () => {
    const ws = oid(500);
    h.workspaces.grant(ws, HOST, "OWNER");
    h.workspaces.grant(ws, PLAYER, "MEMBER");
    const s = await newSession(h, { playerCount: 0, workspaceId: ws });
    const out = await request(app).post("/api/v1/live-quiz/join").set(auth(oid(101))).send({ pin: s.pin });
    expect([out.status, out.body.error.code]).toEqual([403, "PERM_001"]);
    expect((await request(app).post("/api/v1/live-quiz/join").set(auth(PLAYER)).send({ pin: s.pin })).status).toBe(200);
  });

  it("phiên đầy → 409 QUIZ_003; người bị mời ra → 403 QUIZ_010", async () => {
    const s = await newSession(h, { playerCount: 100 });
    const full = await request(app).post("/api/v1/live-quiz/join").set(auth(oid(9000))).send({ pin: s.pin });
    expect([full.status, full.body.error.code]).toEqual([409, "QUIZ_003"]);
    await h.service.kick(s.host, s.id, s.playerIds[0]);
    const kicked = await request(app).post("/api/v1/live-quiz/join").set(auth(s.playerIds[0])).send({ pin: s.pin });
    expect([kicked.status, kicked.body.error.code]).toEqual([403, "QUIZ_010"]);
  });
});

describe("GET /live-quiz/:id và lệnh của host", () => {
  it("snapshot: host thấy pin, người chơi không; người ngoài 404; id sai định dạng 400", async () => {
    const s = await newSession(h, { playerCount: 1 });
    const host = await request(app).get(`/api/v1/live-quiz/${s.id}`).set(auth(HOST));
    expect(host.body.data).toMatchObject({ id: s.id, pin: s.pin, setTitle: "Bộ thử", total: 3, players: [expect.any(Object)] });
    const player = await request(app).get(`/api/v1/live-quiz/${s.id}`).set(auth(s.playerIds[0]));
    expect(player.status).toBe(200);
    expect(player.body.data).not.toHaveProperty("pin");
    expect((await request(app).get(`/api/v1/live-quiz/${s.id}`).set(auth(oid(999)))).status).toBe(404);
    expect((await request(app).get("/api/v1/live-quiz/abc").set(auth(HOST))).status).toBe(400);
  });

  it("start → next(chốt câu sớm) → next(sang câu kế) → end; sai version 409 RES_003; thiếu body 400; người chơi 403", async () => {
    const s = await newSession(h, { playerCount: 1 });
    const post = (path: string, who: string, b: object) => request(app).post(`/api/v1/live-quiz/${s.id}/${path}`).set(auth(who)).send(b);
    expect((await post("start", HOST, {})).status).toBe(400);
    expect((await post("start", s.playerIds[0], { expectedVersion: 1 })).status).toBe(403);
    const stale = await post("start", HOST, { expectedVersion: 9 });
    expect([stale.status, stale.body.error.code, stale.body.error.details]).toEqual([409, "RES_003", { currentVersion: 1 }]);
    const started = await post("start", HOST, { expectedVersion: 1 });
    expect(started.body.data).toMatchObject({ status: "IN_PROGRESS", phase: "QUESTION", currentIndex: 0, version: 2 });
    const closed = await post("next", HOST, { expectedVersion: 2 });
    expect(closed.body.data).toMatchObject({ phase: "REVEAL", version: 2, reveal: { index: 0, correct: 0 } });
    const next = await post("next", HOST, { expectedVersion: 2 });
    expect(next.body.data).toMatchObject({ phase: "QUESTION", currentIndex: 1, version: 3 });
    const ended = await post("end", HOST, { expectedVersion: 3 });
    expect(ended.body.data).toEqual({ status: "FINISHED" });
    const late = await post("end", HOST, { expectedVersion: 3 });
    expect(late.status).toBe(200); // idempotent: đã đóng → trả trạng thái hiện có
    expect(late.body.data).toEqual({ status: "FINISHED" });
  });

  it("kick 204; huỷ phòng (cancel) → CANCELLED", async () => {
    const s = await newSession(h, { playerCount: 2 });
    const kick = await request(app).post(`/api/v1/live-quiz/${s.id}/kick`).set(auth(HOST)).send({ userId: s.playerIds[0] });
    expect(kick.status).toBe(204);
    expect((await request(app).post(`/api/v1/live-quiz/${s.id}/kick`).set(auth(HOST)).send({ userId: HOST })).body.error.code).toBe("QUIZ_007");
    const cancel = await request(app).post(`/api/v1/live-quiz/${s.id}/cancel`).set(auth(HOST)).send({ expectedVersion: 1 });
    expect(cancel.body.data).toEqual({ status: "CANCELLED" });
  });
});

describe("results + history", () => {
  async function playedSession() {
    const s = await newSession(h, { playerCount: 1, questions: 1 });
    await advance(h, s, "start");
    await h.service.answer(s.player(0), s.id, 0, 0);
    await h.service.end(s.host, s.id, (await s.snap()).version, false);
    return s;
  }

  it("GET /:id/results: persisted=false trước khi ghi, đủ bảng + setId/setTitle sau; người ngoài 404", async () => {
    const s = await playedSession();
    const before = await request(app).get(`/api/v1/live-quiz/${s.id}/results`).set(auth(HOST));
    expect(before.body.data).toMatchObject({ sessionId: s.id, setTitle: "Bộ thử", status: "FINISHED", persisted: false, results: [] });
    const earlyPlayer = await request(app).get(`/api/v1/live-quiz/${s.id}/results`).set(auth(s.playerIds[0])); // người chơi chưa có hàng kết quả: 200 persisted=false, không phải 404
    expect([earlyPlayer.status, earlyPlayer.body.data.persisted, earlyPlayer.body.data.results]).toEqual([200, false, []]);
    await h.service.persistResults(s.id);
    const after = await request(app).get(`/api/v1/live-quiz/${s.id}/results`).set(auth(s.playerIds[0]));
    expect(after.status).toBe(200);
    expect(after.body.data).toMatchObject({ persisted: true, setTitle: "Bộ thử", total: 1, setId: expect.stringMatching(/^[0-9a-f]{24}$/) });
    expect(after.body.data.results[0]).toMatchObject({ userId: s.playerIds[0], rank: 1, score: 1500, correct: 1, answered: 1 });
    expect((await request(app).get(`/api/v1/live-quiz/${s.id}/results`).set(auth(oid(999)))).status).toBe(404);
  });

  it("GET /me/live-quiz/history: phân trang cursor, mang setId/setTitle; limit vượt trần → 400", async () => {
    const s = await playedSession();
    await h.service.persistResults(s.id);
    const res = await request(app).get("/api/v1/me/live-quiz/history").query({ limit: 5 }).set(auth(s.playerIds[0]));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ sessionId: s.id, setTitle: "Bộ thử", total: 1, rank: 1, score: 1500 })]);
    expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null, limit: 5 });
    expect((await request(app).get("/api/v1/me/live-quiz/history").query({ limit: 9999 }).set(auth(HOST))).status).toBe(400);
  });
});

describe("/admin/live-quiz/sessions*", () => {
  it("người dùng thường 403; admin xem danh sách phân trang (không pin) + chi tiết; huỷ cần lý do ≥ 10 ký tự", async () => {
    const s = await newSession(h, { playerCount: 1 });
    expect((await request(app).get("/api/v1/admin/live-quiz/sessions").set(auth(HOST))).status).toBe(403);
    const list = await request(app).get("/api/v1/admin/live-quiz/sessions").query({ status: "WAITING" }).set(auth(oid(7), "admin"));
    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false });
    expect(JSON.stringify(list.body.data)).not.toContain(s.pin);
    expect((await request(app).get(`/api/v1/admin/live-quiz/sessions/${s.id}`).set(auth(oid(7), "admin"))).body.data).toMatchObject({ id: s.id, playersCount: 0, results: [] });
    const short = await request(app).post(`/api/v1/admin/live-quiz/sessions/${s.id}/end`).set(auth(oid(7), "admin")).send({ reason: "ngắn" });
    expect(short.status).toBe(400);
    const ended = await request(app).post(`/api/v1/admin/live-quiz/sessions/${s.id}/end`).set(auth(oid(7), "admin")).send({ reason: "Phòng thi vi phạm quy định" });
    expect(ended.body.data).toEqual({ status: "CANCELLED" });
    expect(h.audit.records[0]).toMatchObject({ action: "live-quiz.admin-end", targetId: s.id, reason: "Phòng thi vi phạm quy định" });
  });
});
