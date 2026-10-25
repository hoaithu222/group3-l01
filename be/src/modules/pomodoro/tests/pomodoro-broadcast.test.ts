import { newObjectId } from "../../../core/utils/object-id";
import { SocketPomodoroBroadcaster } from "../realtime/pomodoro.broadcaster";
import { InMemoryPomodoroRedisPort, PomodoroCommandStore } from "../services/pomodoro-command.store";
import { makeHarness } from "./support/pomodoro-harness";

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("PomodoroCommandStore — idempotency lệnh (PM-08)", () => {
  it("NEW → PENDING → DONE(kết quả) và hết hạn sau TTL (mặc định 1 giờ)", async () => {
    let now = 1_000_000;
    const port = new InMemoryPomodoroRedisPort(() => now);
    const store = new PomodoroCommandStore(port);
    const key = store.keyOf("ch", "u", uuid(1));
    expect(await store.begin(key)).toEqual({ state: "NEW" });
    expect(await store.begin(key)).toEqual({ state: "PENDING" });
    await store.complete(key, { sessionId: "s1", version: 4 });
    expect(await store.begin(key)).toEqual({ state: "DONE", result: { sessionId: "s1", version: 4 } });
    now += 3600 * 1000 + 1;
    expect(await store.begin(key)).toEqual({ state: "NEW" });
  });

  it("PENDING chỉ giữ 30 giây: tiến trình chết giữa lệnh không làm kẹt commandId cả giờ", async () => {
    let now = 5_000_000;
    const store = new PomodoroCommandStore(new InMemoryPomodoroRedisPort(() => now));
    const key = store.keyOf("ch", "u", uuid(3));
    expect(await store.begin(key)).toEqual({ state: "NEW" });
    now += 29_000;
    expect(await store.begin(key)).toEqual({ state: "PENDING" });
    now += 2_000;
    expect(await store.begin(key)).toEqual({ state: "NEW" }); // quá 30 s: lệnh cũ coi như đã chết, được chạy lại
  });

  it("abort nhả khoá; khoá gắn kênh + người gửi (không chia sẻ giữa người dùng)", async () => {
    const store = new PomodoroCommandStore(new InMemoryPomodoroRedisPort());
    const a = store.keyOf("ch", "a", uuid(1));
    expect(await store.begin(a)).toEqual({ state: "NEW" });
    await store.abort(a);
    expect(await store.begin(a)).toEqual({ state: "NEW" });
    expect(store.keyOf("ch", "a", uuid(1))).not.toBe(store.keyOf("ch", "b", uuid(1)));
    expect(store.keyOf("ch", "a", uuid(1))).not.toBe(store.keyOf("ch2", "a", uuid(1)));
  });

  it("Redis lỗi → hạ cấp (lệnh vẫn chạy, không idempotency) chứ KHÔNG chặn host", async () => {
    const port = new InMemoryPomodoroRedisPort();
    const store = new PomodoroCommandStore(port);
    port.down = true;
    expect(await store.begin("k")).toEqual({ state: "NEW" });
    await expect(store.complete("k", { sessionId: null, version: 1 })).resolves.toBeUndefined();
    await expect(store.abort("k")).resolves.toBeUndefined();
  });
});

describe("SocketPomodoroBroadcaster — phát pomodoro:updated", () => {
  it("phát tới ch:{channelId}, payload là snapshot chung (không myGoal/myActions), luôn dựng lại từ DB", async () => {
    const h = makeHarness();
    const channel = h.channels.add();
    const host = h.user("host");
    const started = await h.c.service.start(host, channel.id, { commandId: uuid(1), expectedVersion: 0 });
    h.emitted.length = 0;
    await h.c.broadcaster.broadcast(started.sessionId as string);
    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0]).toMatchObject({ room: `ch:${channel.id}`, event: "pomodoro:updated", payload: { sessionId: started.sessionId, phase: "FOCUS", version: 1, v: 1 } });
    expect(h.emitted[0].payload).not.toHaveProperty("myActions");
    expect(h.emitted[0].payload).not.toHaveProperty("myGoal");
    // Phiên không tồn tại → không phát, không ném lỗi.
    await h.c.broadcaster.broadcast(newObjectId());
    expect(h.emitted).toHaveLength(1);
  });

  it("phát lỗi (Redis/cầu nối chập chờn, socket chưa khởi tạo) KHÔNG làm hỏng lệnh — best-effort, DB là nguồn sự thật", async () => {
    const h = makeHarness();
    const channel = h.channels.add();
    const started = await h.c.service.start(h.user("host"), channel.id, { commandId: uuid(1), expectedVersion: 0 });
    const failing = new SocketPomodoroBroadcaster(h.repo, h.c.snapshots, {
      emit: () => {
        throw new Error("chưa khởi tạo");
      },
    });
    await expect(failing.broadcast(started.sessionId as string)).resolves.toBeUndefined();
  });

  it("không phụ thuộc tiến trình: cùng MỘT đường `emit` cho API lẫn worker (không còn cầu Redis riêng, không cần claim)", async () => {
    const h = makeHarness();
    const channel = h.channels.add();
    const started = await h.c.service.start(h.user("host"), channel.id, { commandId: uuid(1), expectedVersion: 0 });
    const calls: string[] = [];
    const port = new SocketPomodoroBroadcaster(h.repo, h.c.snapshots, { emit: (room) => calls.push(room) });
    await port.broadcast(started.sessionId as string);
    await port.broadcast(started.sessionId as string);
    expect(calls).toEqual([`ch:${channel.id}`, `ch:${channel.id}`]);
  });
});
