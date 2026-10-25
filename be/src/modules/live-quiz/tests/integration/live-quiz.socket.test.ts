/**
 * Integration — `quiz:*` qua Socket.IO THẬT (`socket.io-client`), service + Redis store + repo in-memory (không cần Redis/Mongo):
 * LQ-03 (`quiz:question` không lộ đáp án), ST-08 (30 người trả lời cùng lúc), LQ-01/02 (ack `QUIZ_004`/`QUIZ_005`), room guard `quiz`,
 * kick rút socket khỏi room, `quiz:progress` chỉ tới host, `quiz:lobby` không chứa PIN, ST-09 (host mất mạng → HOST_TIMEOUT) và race host vào lại.
 */
jest.setTimeout(30_000);

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../../core/permission/tests/fixtures/fake-redis");
  const mod = createFakeRedisModule();
  mod.redis.connect = jest.fn().mockRejectedValue(new Error("no redis in test"));
  return mod;
});
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
}));

// Container giả: mọi lời gọi service đi tới harness HIỆN TẠI (dựng lại mỗi test) — handler socket/guard room gọi `getLiveQuizContainer()` lúc chạy.
const mockCurrent: { h?: { service: unknown } } = {};
jest.mock("../../live-quiz.container", () => {
  const service = new Proxy(
    {},
    { get: (_t, prop) => (...args: unknown[]) => (mockCurrent.h?.service as Record<string, (...a: unknown[]) => unknown>)[String(prop)](...args) }
  );
  return { getLiveQuizContainer: () => ({ service, bus: { setExecutor: () => undefined, startSubscriber: () => undefined, dispatch: () => Promise.resolve(), stop: () => Promise.resolve() } }) };
});

import type { Socket as ClientSocket } from "socket.io-client";
import { installFakeRedis, type FakeRedisMock } from "../../../../core/permission/tests/fixtures/fake-redis";
import { clearRoomGuards } from "../../../../infrastructure/socket/socket.rooms";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import {
  connectClient,
  emitWithAck,
  startHarness,
  stopHarness,
  tokenFor,
  type Harness as SocketHarness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerLiveQuizModule } from "../..";
import { SocketQuizEmitter } from "../../realtime/live-quiz.emitter";
import { SocketQuizHostPresence } from "../../realtime/live-quiz.presence";
import { HOST, advance, makeHarness, newSession, players, type Harness, type Session } from "../support/quiz-harness";
import { oid } from "../support/quiz-fakes";

type Ack = { ok: boolean; code?: string };
interface Inbox {
  socket: ClientSocket;
  events: Array<{ event: string; payload: Record<string, unknown> }>;
  of(event: string): Array<Record<string, unknown>>;
}

let sock: SocketHarness;
let h: Harness;
const open: ClientSocket[] = [];

async function until(cond: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("Quá thời gian chờ điều kiện");
}

async function connect(userId: string): Promise<Inbox> {
  const socket = await connectClient(sock.port, { token: tokenFor(userId, `${userId}@e.com`) });
  open.push(socket);
  const events: Inbox["events"] = [];
  socket.onAny((event: string, payload: Record<string, unknown>) => events.push({ event, payload }));
  return { socket, events, of: (event) => events.filter((e) => e.event === event).map((e) => e.payload) };
}

const joinRoom = (c: Inbox, s: Session): Promise<Ack> => emitWithAck<Ack>(c.socket, "room:join", { kind: "quiz", id: s.id });
const answer = (c: Inbox, s: Session, index: number, choice: number): Promise<Ack> => emitWithAck<Ack>(c.socket, "quiz:answer", { sessionId: s.id, index, choice });

beforeAll(async () => {
  sock = await startHarness();
});
afterAll(async () => {
  await stopHarness(sock);
});
beforeEach(() => {
  installFakeRedis(redis as unknown as FakeRedisMock);
  (redis.connect as jest.Mock).mockRejectedValue(new Error("no redis in test"));
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  clearRoomGuards();
  h = makeHarness({ emitter: new SocketQuizEmitter(), presence: new SocketQuizHostPresence() });
  mockCurrent.h = h;
  registerLiveQuizModule({ subscribe: false });
});
afterEach(() => {
  for (const s of open.splice(0)) s.disconnect();
  clearRoomGuards();
});

describe("room guard `quiz`", () => {
  it("host và người đã vào phòng join được; người ngoài, phiên lạ, id sai định dạng → PERM_404", async () => {
    const s = await newSession(h, { playerCount: 1 });
    expect(await joinRoom(await connect(HOST), s)).toEqual({ ok: true });
    expect(await joinRoom(await connect(s.playerIds[0]), s)).toEqual({ ok: true });
    expect(await joinRoom(await connect(oid(999)), s)).toEqual({ ok: false, code: "PERM_404" });
    const stranger = await connect(HOST);
    expect(await emitWithAck<Ack>(stranger.socket, "room:join", { kind: "quiz", id: oid(4242) })).toEqual({ ok: false, code: "PERM_404" });
    expect(await emitWithAck<Ack>(stranger.socket, "room:join", { kind: "quiz", id: "khong-phai-objectid" })).toEqual({ ok: false, code: "PERM_404" });
  });
});

describe("luồng sự kiện S→C thật", () => {
  it("lobby không PIN → question không đáp án (có serverNow/questionStartedAt) → reveal/leaderboard/me → progress chỉ host → ended", async () => {
    const s = await newSession(h, { playerCount: 0, correct: [1] });
    const host = await connect(HOST);
    await joinRoom(host, s);
    const ids = players(2);
    for (const id of ids) await h.service.join({ id, email: id + "@e.com" }, { pin: s.pin });
    await until(() => host.of("quiz:lobby").some((l) => l.playersCount === 2));
    for (const lobby of host.of("quiz:lobby")) {
      expect(lobby).not.toHaveProperty("pin");
      expect(JSON.stringify(lobby)).not.toContain(s.pin);
      expect(lobby).toMatchObject({ v: 1, sessionId: s.id });
    }
    const [p0, p1] = [await connect(ids[0]), await connect(ids[1])];
    for (const c of [p0, p1]) expect(await joinRoom(c, s)).toEqual({ ok: true });

    await advance(h, s, "start");
    await until(() => [host, p0, p1].every((c) => c.of("quiz:question").length === 1));
    const [q] = p0.of("quiz:question");
    expect(q).toMatchObject({ v: 1, sessionId: s.id, index: 0, total: 3, serverNow: h.clock.t, deadlineAt: h.clock.t + 20_000, questionStartedAt: h.clock.t });
    expect(typeof q.serverNow).toBe("number");
    for (const banned of ["correct", "explanation", "Giải thích", "itemId"]) expect(JSON.stringify(q)).not.toContain(banned);

    h.clock.advance(400);
    expect(await answer(p0, s, 0, 1)).toEqual({ ok: true });
    expect(await answer(p1, s, 0, 2)).toEqual({ ok: true });
    await until(() => [host, p0, p1].every((c) => c.of("quiz:reveal").length === 1)); // đủ 2/2 người trả lời → công bố sớm
    expect(host.of("quiz:reveal")[0]).toMatchObject({ index: 0, correct: 1, stats: { "1": 1, "2": 1 }, explanation: "Giải thích câu 0" });

    // top chung (cả phòng) + hạng riêng me (chỉ người đó); host chỉ nhận top
    await until(() => p0.of("quiz:leaderboard").length >= 2 && p1.of("quiz:leaderboard").length >= 2);
    const roomBoard = host.of("quiz:leaderboard")[0] as { top: Array<{ userId: string; rank: number; score: number }> };
    expect(roomBoard.top[0]).toMatchObject({ userId: ids[0], rank: 1, score: 1000 + Math.floor(500 * (1 - 400 / 20_000)) });
    expect(host.of("quiz:leaderboard").every((e) => !("me" in e))).toBe(true);
    const mine = p1.of("quiz:leaderboard").find((e) => "me" in e) as { me: Record<string, unknown> };
    expect(mine.me).toEqual({ userId: ids[1], rank: 2, score: 0, cumulativeMs: 0 });

    // quiz:progress: CHỈ host nhận (người chơi không được thấy ai đã trả lời)
    await until(() => host.of("quiz:progress").some((e) => e.answeredCount === 2));
    expect(host.of("quiz:progress").at(-1)).toMatchObject({ v: 1, sessionId: s.id, index: 0, answeredCount: 2, playersCount: 2 });
    expect(p0.of("quiz:progress")).toHaveLength(0);
    expect(p1.of("quiz:progress")).toHaveLength(0);

    await h.service.end(s.host, s.id, (await s.snap()).version, false);
    await until(() => [host, p0, p1].every((c) => c.of("quiz:ended").length === 1));
    expect(p1.of("quiz:ended")[0]).toMatchObject({ sessionId: s.id, status: "FINISHED", reason: "HOST_ENDED", endReason: "HOST_ENDED", resultsReady: false, playersCount: 2 });
  });
});

describe("quiz:answer qua socket", () => {
  it("ST-08: 30 người bấm cùng lúc → mỗi người ĐÚNG 1 đáp án (ack ok), lần 2 → QUIZ_004; một lần công bố duy nhất, thống kê đủ 30", async () => {
    const s = await newSession(h, { playerCount: 31, correct: [0] }); // người thứ 31 im lặng → câu vẫn mở sau 30 đáp án
    const clients: Inbox[] = [];
    for (const id of s.playerIds.slice(0, 30)) {
      const c = await connect(id);
      await joinRoom(c, s);
      clients.push(c);
    }
    await advance(h, s, "start");
    await until(() => clients.every((c) => c.of("quiz:question").length === 1));
    h.clock.advance(250);

    const first = await Promise.all(clients.map((c, i) => answer(c, s, 0, i % 4)));
    expect(first.every((a) => a.ok)).toBe(true);
    const second = await Promise.all(clients.map((c) => answer(c, s, 0, 0)));
    expect(second).toEqual(clients.map(() => ({ ok: false, code: "QUIZ_004" })));
    expect((await h.store.counts(s.id, 0)).answered).toBe(30);

    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 });
    await until(() => clients.every((c) => c.of("quiz:reveal").length === 1));
    const reveal = clients[0].of("quiz:reveal")[0] as { stats: Record<string, number>; correct: number };
    expect(Object.values(reveal.stats).reduce((a, b) => a + b, 0)).toBe(30);
    expect(reveal.correct).toBe(0);
    const scores = (await h.store.scores(s.id)).map((r) => r.score);
    expect(scores.filter((x) => x > 0)).toHaveLength(8); // i % 4 === 0 → 8 người chọn đúng
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 }); // lệnh hết giờ đến sau: no-op
    await new Promise((r) => setTimeout(r, 100));
    for (const c of clients) expect(c.of("quiz:reveal")).toHaveLength(1);
  });

  it("LQ-01/02 + kiểm đầu vào: quá hạn → QUIZ_005; payload sai → RT_400; chưa join room → RT_409; sau khi bị mời ra → RT_409", async () => {
    const s = await newSession(h, { playerCount: 3 });
    const [a, b, c] = [await connect(s.playerIds[0]), await connect(s.playerIds[1]), await connect(s.playerIds[2])];
    const host = await connect(HOST);
    for (const x of [host, a, b]) await joinRoom(x, s);
    await advance(h, s, "start");
    await until(() => a.of("quiz:question").length === 1);

    expect(await answer(c, s, 0, 0)).toEqual({ ok: false, code: "RT_409" }); // c chưa vào room
    expect(await emitWithAck<Ack>(a.socket, "quiz:answer", { sessionId: s.id, index: "0", choice: 0 })).toEqual({ ok: false, code: "RT_400" });
    expect(await emitWithAck<Ack>(a.socket, "quiz:answer", { sessionId: "x", index: 0, choice: 0 })).toEqual({ ok: false, code: "RT_400" });
    h.clock.advance(20_001);
    expect(await answer(a, s, 0, 0)).toEqual({ ok: false, code: "QUIZ_005" });

    await h.service.kick(s.host, s.id, s.playerIds[1]);
    await until(async () => !(await h.service.isParticipant(s.playerIds[1], s.id)));
    expect(await answer(b, s, 0, 0)).toEqual({ ok: false, code: "RT_409" });
    await h.service.runCommand({ type: "close", sessionId: s.id, index: 0 });
    await until(() => a.of("quiz:reveal").length === 1);
    expect(b.of("quiz:reveal")).toHaveLength(0); // đã bị rút khỏi room: không nhận công bố nữa
  });
});

describe("host mất kết nối (ST-09) và race vào lại", () => {
  async function startedRoom(): Promise<{ s: Session; host: Inbox; p: Inbox }> {
    const s = await newSession(h, { playerCount: 1 });
    const host = await connect(HOST);
    const p = await connect(s.playerIds[0]);
    await joinRoom(host, s);
    await joinRoom(p, s);
    await advance(h, s, "start");
    return { s, host, p };
  }

  it("host ngắt kết nối → hẹn host-timeout; quá hạn mà host vắng → FINISHED (HOST_TIMEOUT), người chơi nhận quiz:ended", async () => {
    const { s, host, p } = await startedRoom();
    host.socket.disconnect();
    await until(() => h.scheduler.last("host-timeout") !== undefined);
    const { cmd } = h.scheduler.last("host-timeout")!;
    expect(cmd).toMatchObject({ sessionId: s.id, lastSeenMs: h.clock.t });
    h.clock.advance(30_000);
    await h.service.runCommand(cmd);
    expect((await h.repo.findById(s.id))?.status).toBe("FINISHED");
    await until(() => p.of("quiz:ended").length === 1);
    expect(p.of("quiz:ended")[0]).toMatchObject({ status: "FINISHED", reason: "HOST_TIMEOUT" });
  });

  it("host nối lại trước hạn (thiết bị mới join room) → mốc bị xoá, lệnh bị huỷ; lệnh cũ chạy lại cũng giữ phiên", async () => {
    const { s, host } = await startedRoom();
    host.socket.disconnect();
    await until(() => h.scheduler.last("host-timeout") !== undefined);
    const { cmd } = h.scheduler.last("host-timeout")!;
    const back = await connect(HOST);
    expect(await joinRoom(back, s)).toEqual({ ok: true });
    await until(async () => (await h.store.getMeta(s.id))?.hostLastSeenMs === 0);
    expect(h.scheduler.cancelled).toContainEqual(cmd);
    h.clock.advance(30_000);
    expect(await h.service.hostTimeout(s.id, cmd.lastSeenMs)).toBe(false);
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
  });

  it("RACE: lệnh hết hạn thấy host ĐANG ở trong room (socket thật) dù mốc rời còn sót → giữ phiên và xoá mốc", async () => {
    const { s, host } = await startedRoom();
    host.socket.disconnect();
    await until(() => h.scheduler.last("host-timeout") !== undefined);
    const { cmd } = h.scheduler.last("host-timeout")!;
    const back = await connect(HOST);
    await joinRoom(back, s);
    await h.store.setHostLastSeen(s.id, cmd.lastSeenMs); // ghi lại mốc như thể hostDisconnected ghi SAU khi host đã về
    h.clock.advance(30_000);
    expect(await h.service.hostTimeout(s.id, cmd.lastSeenMs)).toBe(false);
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
    expect((await h.store.getMeta(s.id))?.hostLastSeenMs).toBe(0);
  });

  it("host có 2 thiết bị: một thiết bị ngắt kết nối KHÔNG tính là rời", async () => {
    const { s, host } = await startedRoom();
    const second = await connect(HOST);
    await joinRoom(second, s);
    host.socket.disconnect();
    await new Promise((r) => setTimeout(r, 150));
    expect(h.scheduler.last("host-timeout")).toBeUndefined();
    expect((await h.store.getMeta(s.id))?.hostLastSeenMs).toBe(0);
  });
});
