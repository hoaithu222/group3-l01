/**
 * Integration — job chạy ở WORKER (không có `getIO()`) vẫn làm client nhận `quiz:*`: processor gọi `bus.dispatch` → publish Redis THẬT → bus của tiến trình API
 * (subscriber + executor `service.runCommand`) chạy CAS Lua rồi phát qua Socket.IO thật. Cần Redis: `CI=true` hoặc `TEST_REDIS=1 REDIS_URL=…` (không có → SKIP).
 * "Worker" và "API" ở đây là hai `QuizCommandBus` khác nhau trong cùng một tiến trình test (chỉ bus API có executor), dùng CHUNG Redis thật.
 */
jest.setTimeout(30_000);
// Adapter Socket.IO của bản test là bộ nhớ: `initSocketServer` với "redis" mở thêm 2 client pub/sub mà harness không đóng (Jest sẽ treo). Bus lệnh dùng
// client Redis riêng (`duplicate()` do `QuizCommandBus.stop()` đóng) nên vẫn kiểm được đường worker → pub/sub → API thật.
process.env.SOCKET_ADAPTER = "memory";
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
}));

const mockState: { h?: { service: unknown }; worker?: { dispatch: (c: never) => Promise<void> } } = {};
jest.mock("../../live-quiz.container", () => {
  const service = new Proxy(
    {},
    { get: (_t, prop) => (...args: unknown[]) => (mockState.h?.service as Record<string, (...a: unknown[]) => unknown>)[String(prop)](...args) }
  );
  const bus = { setExecutor: () => undefined, startSubscriber: () => undefined, stop: () => Promise.resolve(), dispatch: (c: never) => mockState.worker!.dispatch(c) };
  return { getLiveQuizContainer: () => ({ service, bus }) };
});

import type { Socket as ClientSocket } from "socket.io-client";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { clearRoomGuards } from "../../../../infrastructure/socket/socket.rooms";
import { connectClient, emitWithAck, startHarness, stopHarness, tokenFor, type Harness as SocketHarness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerLiveQuizModule } from "../..";
import { quizCommandProcessor } from "../../jobs/quiz-command.processor";
import { QuizCommandBus } from "../../realtime/live-quiz.command-bus";
import { SocketQuizEmitter } from "../../realtime/live-quiz.emitter";
import { SocketQuizHostPresence } from "../../realtime/live-quiz.presence";
import { HOST, advance, makeHarness, newSession, type Harness, type Session } from "../support/quiz-harness";

const enabled = process.env.CI === "true" || process.env.TEST_REDIS === "1";
const describeRedis = enabled ? describe : describe.skip;

interface Inbox {
  socket: ClientSocket;
  of(event: string): Array<Record<string, unknown>>;
}
const open: ClientSocket[] = [];
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Quá thời gian chờ điều kiện");
}

describeRedis("worker → pub/sub → API → socket", () => {
  let sock: SocketHarness;
  let h: Harness;
  let apiBus: QuizCommandBus;
  const workerBus = new QuizCommandBus(); // KHÔNG executor: như tiến trình worker thuần

  async function connect(userId: string): Promise<Inbox> {
    const socket = await connectClient(sock.port, { token: tokenFor(userId, `${userId}@e.com`) });
    open.push(socket);
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    socket.onAny((event: string, payload: Record<string, unknown>) => events.push({ event, payload }));
    return { socket, of: (event) => events.filter((e) => e.event === event).map((e) => e.payload) };
  }
  const join = (c: Inbox, s: Session) => emitWithAck(c.socket, "room:join", { kind: "quiz", id: s.id });

  beforeAll(async () => {
    await redis.connect();
    sock = await startHarness();
    mockState.worker = workerBus;
    apiBus = new QuizCommandBus();
    apiBus.startSubscriber();
    await until(() => apiBus.isSubscribed(), 20_000); // chờ Redis xác nhận SUBSCRIBE (không ngủ cố định — máy tải nặng vẫn ổn)
  });
  afterAll(async () => {
    await apiBus.stop();
    await stopHarness(sock);
    await new Promise((r) => setTimeout(r, 300)); // lệnh Redis còn dở của server socket phải xong TRƯỚC khi ngắt client (nếu không: DisconnectsClientError chưa được bắt)
    await redis.disconnect();
  });
  beforeEach(() => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    clearRoomGuards();
    h = makeHarness({ emitter: new SocketQuizEmitter(), presence: new SocketQuizHostPresence() });
    mockState.h = h;
    apiBus.setExecutor((cmd) => h.service.runCommand(cmd));
    registerLiveQuizModule({ subscribe: false });
  });
  afterEach(async () => {
    for (const s of open.splice(0)) s.disconnect();
    clearRoomGuards();
    await new Promise((r) => setTimeout(r, 250)); // để server xử lý xong các lệnh Redis của lúc ngắt kết nối (registry/presence) trước khi test kế tiếp/afterAll
  });

  it("job `quiz.question-deadline` ở worker → client nhận quiz:reveal + quiz:leaderboard (phát từ tiến trình API)", async () => {
    const s = await newSession(h, { playerCount: 2, correct: [1] });
    const [host, p0, p1] = [await connect(HOST), await connect(s.playerIds[0]), await connect(s.playerIds[1])];
    for (const c of [host, p0, p1]) await join(c, s);
    await advance(h, s, "start");
    await emitWithAck(p0.socket, "quiz:answer", { sessionId: s.id, index: 0, choice: 1 }); // mới 1/2 → câu còn mở
    expect(p1.of("quiz:reveal")).toHaveLength(0);

    const due = h.scheduler.last("close")!.cmd; // lệnh mà BullMQ sẽ giao khi tới hạn
    await quizCommandProcessor("close")({ id: "job-1", data: due } as never);
    await until(() => [host, p0, p1].every((c) => c.of("quiz:reveal").length === 1));
    expect(host.of("quiz:reveal")[0]).toMatchObject({ index: 0, correct: 1, stats: { "1": 1 } });
    await until(() => host.of("quiz:leaderboard").length >= 1);

    await quizCommandProcessor("close")({ id: "job-1-retry", data: due } as never); // BullMQ giao lại: CAS → không phát lần hai
    await new Promise((r) => setTimeout(r, 300));
    expect(p1.of("quiz:reveal")).toHaveLength(1);
  });

  it("job `quiz.host-timeout` ở worker → phiên kết thúc và người chơi nhận quiz:ended (HOST_TIMEOUT)", async () => {
    const s = await newSession(h, { playerCount: 1 });
    const [host, p0] = [await connect(HOST), await connect(s.playerIds[0])];
    for (const c of [host, p0]) await join(c, s);
    await advance(h, s, "start");
    host.socket.disconnect();
    await until(() => h.scheduler.last("host-timeout") !== undefined);
    h.clock.advance(30_000);
    await quizCommandProcessor("host-timeout")({ id: "job-2", data: h.scheduler.last("host-timeout")!.cmd } as never);
    await until(() => p0.of("quiz:ended").length === 1);
    expect(p0.of("quiz:ended")[0]).toMatchObject({ status: "FINISHED", reason: "HOST_TIMEOUT" });
    expect((await h.repo.findById(s.id))?.status).toBe("FINISHED");
  });

  it("job `quiz.auto-advance` ở worker → phiên sang câu kế và client nhận quiz:question mới", async () => {
    const s = await newSession(h, { playerCount: 1, autoAdvance: true });
    const [host, p0] = [await connect(HOST), await connect(s.playerIds[0])];
    for (const c of [host, p0]) await join(c, s);
    await advance(h, s, "start");
    await emitWithAck(p0.socket, "quiz:answer", { sessionId: s.id, index: 0, choice: 0 }); // 1/1 → đóng sớm, hẹn advance
    await until(() => p0.of("quiz:reveal").length === 1);
    await quizCommandProcessor("advance")({ id: "job-3", data: h.scheduler.last("advance")!.cmd } as never);
    await until(() => p0.of("quiz:question").length === 2);
    expect(p0.of("quiz:question")[1]).toMatchObject({ index: 1, sessionId: s.id });
  });
});
