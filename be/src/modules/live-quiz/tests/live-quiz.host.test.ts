import { LIMITS } from "../../../core/constants/limits";
import { advance, HOST, makeHarness, newSession } from "./support/quiz-harness";
import { oid } from "./support/quiz-fakes";

/**
 * Host mất kết nối (be.md §5, ST-09): giữ phiên `hostGraceSeconds` rồi kết thúc HOST_TIMEOUT (đang chơi → FINISHED để vẫn lưu kết quả;
 * còn chờ → CANCELLED); host về kịp → giữ phiên; race "host vào lại đúng lúc kiểm fetchSockets" được chốt bằng kiểm hiện diện lúc QUYẾT ĐỊNH.
 */
const GRACE_MS = LIMITS.liveQuiz.hostGraceSeconds * 1000;

describe("hostDisconnected / hostReturned", () => {
  it("socket cuối của host rời room → ghi mốc rời + hẹn lệnh host-timeout sau hostGraceSeconds", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const meta = await h.store.getMeta(s.id);
    expect(meta?.hostLastSeenMs).toBe(h.clock.t);
    expect(h.scheduler.last("host-timeout")).toMatchObject({ cmd: { type: "host-timeout", sessionId: s.id, lastSeenMs: h.clock.t }, delayMs: GRACE_MS });
  });

  it("host còn thiết bị KHÁC trong room, hoặc người rời không phải host, hoặc phiên đã đóng → không làm gì", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(true));
    await h.service.hostDisconnected(s.playerIds[0], s.id, () => Promise.resolve(false));
    await h.service.hostDisconnected(HOST, oid(4242), () => Promise.resolve(false));
    expect(h.scheduler.scheduled).toHaveLength(0);
    await h.service.end(s.host, s.id, 1, true);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    expect(h.scheduler.scheduled).toHaveLength(0);
  });

  it("host vào lại (thiết bị bất kỳ) → xoá mốc + huỷ đúng lệnh đang chờ; không có mốc thì không huỷ gì", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await h.service.hostReturned(HOST, s.id);
    expect(h.scheduler.cancelled).toHaveLength(0);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const { lastSeenMs } = h.scheduler.last("host-timeout")!.cmd;
    await h.service.hostReturned(s.playerIds[0], s.id); // người khác vào lại: bỏ qua
    expect(h.scheduler.cancelled).toHaveLength(0);
    await h.service.hostReturned(HOST, s.id);
    expect(h.scheduler.cancelled).toEqual([{ type: "host-timeout", sessionId: s.id, lastSeenMs }]);
    expect((await h.store.getMeta(s.id))?.hostLastSeenMs).toBe(0);
  });
});

describe("hostTimeout", () => {
  it("ST-09: host mất mạng quá hạn khi đang chơi → FINISHED (HOST_TIMEOUT), ghi outbox persist, phát quiz:ended", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await advance(h, s, "start");
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const { lastSeenMs } = h.scheduler.last("host-timeout")!.cmd;
    h.clock.advance(GRACE_MS);
    await h.service.runCommand({ type: "host-timeout", sessionId: s.id, lastSeenMs });
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "FINISHED", endReason: "HOST_TIMEOUT" });
    expect(h.outbox.events.filter((e) => e.jobName === "live-quiz.persist")).toHaveLength(1);
    expect(h.emitter.of("ended")[0].payload).toMatchObject({ status: "FINISHED", reason: "HOST_TIMEOUT" });
  });

  it("còn ở sảnh chờ → CANCELLED (không ghi kết quả); gọi lại lệnh (retry/trùng timer) là vô hại", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const { lastSeenMs } = h.scheduler.last("host-timeout")!.cmd;
    expect(await h.service.hostTimeout(s.id, lastSeenMs)).toBe(true);
    expect(await h.repo.findById(s.id)).toMatchObject({ status: "CANCELLED", endReason: "HOST_TIMEOUT" });
    expect(h.outbox.events).toHaveLength(0);
    expect(await h.service.hostTimeout(s.id, lastSeenMs)).toBe(false);
    expect(h.emitter.of("ended")).toHaveLength(1);
  });

  it("host về kịp → lệnh cũ bỏ qua, phiên nguyên vẹn; mốc rời MỚI hơn thay mốc cũ (lệnh cũ không còn hiệu lực)", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await advance(h, s, "start");
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const first = h.scheduler.last("host-timeout")!.cmd.lastSeenMs;
    await h.service.hostReturned(HOST, s.id);
    expect(await h.service.hostTimeout(s.id, first)).toBe(false);
    h.clock.advance(5_000);
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const second = h.scheduler.last("host-timeout")!.cmd.lastSeenMs;
    expect(second).toBeGreaterThan(first);
    expect(await h.service.hostTimeout(s.id, first)).toBe(false);
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
  });

  it("RACE: host vào lại đúng lúc hostDisconnected đang kiểm fetchSockets (hostReturned thấy chưa có mốc) → lệnh hết hạn thấy host đang ở trong room và GIỮ phiên", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await advance(h, s, "start");
    // hostDisconnected đang chờ fetchSockets; trong lúc đó host vào lại (guard chạy hostReturned khi CHƯA có mốc để xoá)…
    const disconnect = h.service.hostDisconnected(HOST, s.id, async () => {
      await h.service.hostReturned(HOST, s.id);
      return false; // …còn kết quả fetchSockets đã lấy trước khi socket mới vào room
    });
    await disconnect;
    expect((await h.store.getMeta(s.id))?.hostLastSeenMs).toBeGreaterThan(0); // mốc rời vẫn bị ghi: đúng là race
    const { lastSeenMs } = h.scheduler.last("host-timeout")!.cmd;
    h.presence.connected.add(HOST); // socket mới của host đã ở trong room
    h.clock.advance(GRACE_MS);
    expect(await h.service.hostTimeout(s.id, lastSeenMs)).toBe(false);
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
    expect((await h.store.getMeta(s.id))?.hostLastSeenMs).toBe(0); // mốc rác được xoá
  });

  it("không kiểm được hiện diện (lỗi Socket/Redis) → giữ phiên, không kết thúc nhầm; host thật sự vắng → kết thúc", async () => {
    const h = makeHarness();
    const s = await newSession(h);
    await advance(h, s, "start");
    await h.service.hostDisconnected(HOST, s.id, () => Promise.resolve(false));
    const { lastSeenMs } = h.scheduler.last("host-timeout")!.cmd;
    h.presence.failWith = new Error("fetchSockets hỏng");
    expect(await h.service.hostTimeout(s.id, lastSeenMs)).toBe(false);
    expect((await h.repo.findById(s.id))?.status).toBe("IN_PROGRESS");
    h.presence.failWith = null;
    expect(await h.service.hostTimeout(s.id, lastSeenMs)).toBe(true);
    expect((await h.repo.findById(s.id))?.status).toBe("FINISHED");
  });
});
