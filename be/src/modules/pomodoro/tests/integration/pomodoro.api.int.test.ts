import "./pomodoro-test-mocks"; // PHẢI đứng ĐẦU: env LiveKit + mock cờ/Redis trước khi nạp module khác
import request from "supertest";
import { runtimeConfig } from "../../../../core/config/runtime-config";
import { prisma } from "../../../../infrastructure/database";
import {
  buildApp,
  cleanupWorlds,
  commandId,
  connect,
  deviceId,
  drainPomodoroOutbox,
  ensureIndexes,
  installHarness,
  installPermissionPorts,
  makeApi,
  resetPermissionSpy,
  seedChannel,
  seedWorld,
  type Api,
  type RoomHarness,
  type World,
} from "./pomodoro-test-kit";

const MIN = 60_000;
const worlds: World[] = [];
let api: Api;
let h: RoomHarness;
let w: World;

beforeAll(async () => {
  await ensureIndexes();
  api = makeApi(buildApp());
  installPermissionPorts();
});

beforeEach(async () => {
  h = installHarness();
  w = await seedWorld();
  worlds.push(w);
});

afterAll(async () => {
  resetPermissionSpy();
  await cleanupWorlds(worlds);
});

const cmd = (expectedVersion: number) => ({ commandId: commandId(), expectedVersion });
const snapshotOf = (res: { body: { data: Record<string, unknown> } }) => res.body.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("GET /channels/:id/pomodoro — preview", () => {
  it("kênh chưa có phiên: WAITING ảo (version 0) + myActions do server tính; thiếu token → 401", async () => {
    const ch = await seedChannel(w);
    const res = await api("get", `/channels/${ch}/pomodoro`, w.u.B);
    expect(res.status).toBe(200);
    expect(snapshotOf(res)).toMatchObject({
      sessionId: null,
      phase: "WAITING",
      version: 0,
      hostUserId: null,
      config: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoAdvance: true },
      myActions: { canJoin: true, canStart: true, canConfigure: false, canPause: false, canEnd: false },
    });
    expect(typeof snapshotOf(res).serverNow).toBe("string");
    const anon = await request(buildApp()).get(`/api/v1/channels/${ch}/pomodoro`);
    expect(anon.status).toBe(401);
  });

  it("OWNER/ADMIN (manage) thấy canConfigure khi chưa có phiên; kênh có mặc định trong settings.pomodoro thì snapshot mang mặc định đó", async () => {
    const ch = await seedChannel(w, { settings: { pomodoro: { focusMinutes: 45, shortBreakMinutes: 10, longBreakMinutes: 20, cyclesBeforeLongBreak: 3, autoAdvance: false } } });
    const res = await api("get", `/channels/${ch}/pomodoro`, w.u.A);
    expect(snapshotOf(res)).toMatchObject({ config: { focusMinutes: 45, cyclesBeforeLongBreak: 3, autoAdvance: false }, myActions: { canConfigure: true } });
  });

  it("kênh không phải POMODORO → 400 CALL_POMO_001; kênh không tồn tại → 404", async () => {
    const voice = await seedChannel(w, { type: "VOICE" });
    const bad = await api("get", `/channels/${voice}/pomodoro`, w.u.B);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("CALL_POMO_001");
    expect((await api("get", `/channels/${"a".repeat(24)}/pomodoro`, w.u.B)).status).toBe(404);
  });

  it("kênh riêng tư: người không có grant → 404 trung tính (kể cả OWNER nhóm); người có grant đọc được", async () => {
    const ch = await seedChannel(w, { visibility: "PRIVATE", grantTo: [w.u.B, w.u.C] });
    expect((await api("get", `/channels/${ch}/pomodoro`, w.u.B)).status).toBe(200);
    expect((await api("get", `/channels/${ch}/pomodoro`, w.u.D)).status).toBe(404);
    expect((await api("get", `/channels/${ch}/pomodoro`, w.u.A)).status).toBe(404);
    expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.D, cmd(0))).status).toBe(404);
  });

  it("cờ `pomodoro` tắt (runtime) → 404 CFG_005 cho mọi route", async () => {
    const ch = await seedChannel(w);
    jest.spyOn(runtimeConfig, "isFeatureEnabled").mockResolvedValue(false);
    const res = await api("get", `/channels/${ch}/pomodoro`, w.u.B);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CFG_005");
    expect((await api("get", "/me/pomodoro/history", w.u.B)).status).toBe(404);
  });
});

describe("lệnh của chủ phòng qua API", () => {
  it("start tạo phiên FOCUS: ghi DB (activeKey = channelId, version 1) + hàng outbox deadline BỀN (delayMs 25 phút, dedupeKey theo version)", async () => {
    const ch = await seedChannel(w);
    const res = await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0));
    expect(res.status).toBe(200);
    const snap = snapshotOf(res);
    expect(snap).toMatchObject({ phase: "FOCUS", version: 1, hostUserId: w.u.A, completedFocusCycles: 0, rules: { micAllowed: false }, myActions: { canPause: true, canSkip: true, canEnd: true, canStart: false } });
    expect(new Date(snap.phaseEndsAt).getTime() - new Date(snap.serverNow).getTime()).toBeGreaterThan(24 * MIN);

    const row = await prisma.pomodoroSession.findUnique({ where: { id: snap.sessionId } });
    expect(row).toMatchObject({ channelId: ch, phase: "FOCUS", activeKey: ch, version: 1, callId: null, previousPhase: null, endedAt: null });
    const events = await prisma.outboxEvent.findMany({ where: { aggregateType: "PomodoroSession", aggregateId: snap.sessionId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ jobName: "pomodoro.deadline", queue: "calls", dedupeKey: `pomodoro.deadline:pomo:${snap.sessionId}:v1`, status: "PENDING" });
    expect(events[0].delayMs).toBeGreaterThan(24 * MIN);
    expect(events[0].delayMs).toBeLessThanOrEqual(25 * MIN);
    expect(h.emitted.map((e) => e.event)).toEqual(["pomodoro:updated"]);
    expect(h.emitted[0].room).toBe(`ch:${ch}`);
  });

  it("validate body: thiếu/sai commandId, expectedVersion âm → 400", async () => {
    const ch = await seedChannel(w);
    expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, { expectedVersion: 0 })).status).toBe(400);
    expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, { commandId: "khong-phai-uuid", expectedVersion: 0 })).status).toBe(400);
    expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(-1))).status).toBe(400);
  });

  it("đã có phiên → 409 CALL_POMO_002; người không phải chủ → 403 CALL_POMO_004; sai phase → 409 CALL_POMO_005; đầy đủ vòng đời pause → resume → skip → end", async () => {
    const ch = await seedChannel(w);
    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0)));
    const dup = await api("post", `/channels/${ch}/pomodoro/start`, w.u.B, cmd(1));
    expect([dup.status, dup.body.error.code]).toEqual([409, "CALL_POMO_002"]);
    const notHost = await api("post", `/channels/${ch}/pomodoro/pause`, w.u.B, cmd(1));
    expect([notHost.status, notHost.body.error.code]).toEqual([403, "CALL_POMO_004"]);
    const badPhase = await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(1));
    expect([badPhase.status, badPhase.body.error.code]).toEqual([409, "CALL_POMO_005"]);

    const paused = snapshotOf(await api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, cmd(started.version)));
    expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "HOST", version: 2, phaseEndsAt: null });
    expect(paused.remainingMs).toBeGreaterThan(24 * MIN);
    const resumed = snapshotOf(await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(paused.version)));
    expect(resumed).toMatchObject({ phase: "FOCUS", version: 3 });
    const skipped = snapshotOf(await api("post", `/channels/${ch}/pomodoro/skip`, w.u.A, cmd(resumed.version)));
    expect(skipped).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 0, skippedFocusCycles: 1, rules: { micAllowed: true } });
    const ended = snapshotOf(await api("post", `/channels/${ch}/pomodoro/end`, w.u.A, cmd(skipped.version)));
    expect(ended).toMatchObject({ phase: "ENDED", summary: { endReason: "HOST_ENDED", skippedFocusCycles: 1 } });
    expect(await prisma.pomodoroSession.findUnique({ where: { id: started.sessionId } })).toMatchObject({ phase: "ENDED", activeKey: `ended:${started.sessionId}`, endReason: "HOST_ENDED" });
    // Kênh trống chỗ cho phiên mới.
    expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.B, cmd(0))).status).toBe(200);
  });

  it("PM-08: cùng commandId gửi lại trả cùng kết quả, version KHÔNG tăng lần hai, không thêm hàng outbox", async () => {
    const ch = await seedChannel(w);
    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0)));
    const body = cmd(started.version);
    const first = snapshotOf(await api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, body));
    const eventsBefore = await prisma.outboxEvent.count({ where: { aggregateType: "PomodoroSession", aggregateId: started.sessionId } });
    const second = await api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, body);
    expect(second.status).toBe(200);
    expect(snapshotOf(second)).toMatchObject({ phase: "PAUSED", version: first.version, sessionId: first.sessionId });
    expect((await prisma.pomodoroSession.findUnique({ where: { id: started.sessionId } }))?.version).toBe(first.version);
    expect(await prisma.outboxEvent.count({ where: { aggregateType: "PomodoroSession", aggregateId: started.sessionId } })).toBe(eventsBefore);
  });

  it("PM-03: hai lệnh host cùng expectedVersion (khác commandId) đồng thời → một 200, một 409 RES_003; DB chỉ tăng version một lần", async () => {
    const ch = await seedChannel(w);
    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0)));
    const [a, b] = await Promise.all([
      api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, cmd(started.version)),
      api("post", `/channels/${ch}/pomodoro/skip`, w.u.A, cmd(started.version)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe("RES_003");
    expect((await prisma.pomodoroSession.findUnique({ where: { id: started.sessionId } }))?.version).toBe(2);
  });

  it("người có manage kênh kết thúc KHẨN CẤP phiên của người khác; thành viên thường 403", async () => {
    const ch = await seedChannel(w);
    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.B, cmd(0)));
    const denied = await api("post", `/channels/${ch}/pomodoro/end`, w.u.C, cmd(started.version));
    expect([denied.status, denied.body.error.code]).toEqual([403, "CALL_POMO_004"]);
    const ended = await api("post", `/channels/${ch}/pomodoro/end`, w.u.A, cmd(started.version)); // A = OWNER nhóm ⇒ manage kênh công khai
    expect(ended.status).toBe(200);
    expect(snapshotOf(ended).summary.endReason).toBe("MANAGER_ENDED");
  });

  it("kênh đã lưu trữ: xem được, nhưng start → 409 CALL_018 và canJoin = false", async () => {
    const ch = await seedChannel(w, { status: "ARCHIVED" });
    const view = await api("get", `/channels/${ch}/pomodoro`, w.u.B);
    expect(snapshotOf(view).myActions).toMatchObject({ canJoin: false, joinBlockedReason: "ARCHIVED", canStart: false });
    const start = await api("post", `/channels/${ch}/pomodoro/start`, w.u.B, cmd(0));
    expect([start.status, start.body.error.code]).toEqual([409, "CALL_018"]);
  });
});

describe("PATCH /channels/:id/pomodoro/config", () => {
  const cfg = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, cyclesBeforeLongBreak: 3, autoAdvance: false };

  it("chưa có phiên: thành viên thường 403, OWNER (manage) lưu mặc định vào Channel.settings.pomodoro; phiên sau dùng đúng cấu hình", async () => {
    const ch = await seedChannel(w);
    const denied = await api("patch", `/channels/${ch}/pomodoro/config`, w.u.B, cfg);
    expect([denied.status, denied.body.error.code]).toEqual([403, "CALL_POMO_004"]);
    const saved = await api("patch", `/channels/${ch}/pomodoro/config`, w.u.A, cfg);
    expect(saved.status).toBe(200);
    expect(snapshotOf(saved)).toMatchObject({ sessionId: null, config: { focusMinutes: 50, autoAdvance: false } });
    const channel = await prisma.channel.findUnique({ where: { id: ch } });
    expect((channel?.settings as { pomodoro?: Record<string, unknown> }).pomodoro).toMatchObject({ focusMinutes: 50, cyclesBeforeLongBreak: 3, autoAdvance: false });

    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.B, cmd(0)));
    expect(started).toMatchObject({ config: { focusMinutes: 50, longBreakMinutes: 30 }, phaseDurationMs: 50 * MIN });
  });

  it("khoảng giá trị theo LIMITS.pomodoro: ngoài khoảng → 400", async () => {
    const ch = await seedChannel(w);
    for (const bad of [{ ...cfg, focusMinutes: 4 }, { ...cfg, focusMinutes: 91 }, { ...cfg, shortBreakMinutes: 0 }, { ...cfg, longBreakMinutes: 61 }, { ...cfg, cyclesBeforeLongBreak: 9 }, { ...cfg, autoAdvance: "yes" }]) {
      expect((await api("patch", `/channels/${ch}/pomodoro/config`, w.u.A, bad)).status).toBe(400);
    }
  });

  it("phiên đã chạy → 409 CALL_POMO_003", async () => {
    const ch = await seedChannel(w);
    await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0));
    const res = await api("patch", `/channels/${ch}/pomodoro/config`, w.u.A, cfg);
    expect([res.status, res.body.error.code]).toEqual([409, "CALL_POMO_003"]);
  });
});

describe("PUT /channels/:id/pomodoro/goal", () => {
  it("chưa vào phòng → 409 CALL_POMO_006; mục tiêu đếm GRAPHEME (emoji ghép = 1), > 200 → 400", async () => {
    const ch = await seedChannel(w);
    await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(0));
    const notIn = await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { text: "Ôn tập", shared: false });
    expect([notIn.status, notIn.body.error.code]).toEqual([409, "CALL_POMO_006"]);

    const family = "👨‍👩‍👧";
    expect((await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { text: family.repeat(201), shared: false })).status).toBe(400);
    expect((await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { text: "a".repeat(201), shared: false })).status).toBe(400);
    // 200 emoji ghép = 200 grapheme (dù dài 1600 đơn vị mã) → qua kiểm độ dài, dừng ở 409 vì chưa vào phòng.
    expect((await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { text: family.repeat(200), shared: false })).status).toBe(409);
    expect((await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { shared: false })).status).toBe(400);
  });

  it("đã vào phòng: lưu (cắt khoảng trắng), chia sẻ thì người khác thấy trong snapshot, riêng tư thì không", async () => {
    const ch = await seedChannel(w);
    const joinA = await api("post", `/channels/${ch}/pomodoro/join`, w.u.A, { deviceId: deviceId("a") });
    expect(joinA.status).toBe(200);
    const callId = joinA.body.data.call.id as string;
    await api("post", `/channels/${ch}/pomodoro/join`, w.u.B, { deviceId: deviceId("b") });
    await connect(h, callId, w.u.A);
    await connect(h, callId, w.u.B);

    const saved = await api("put", `/channels/${ch}/pomodoro/goal`, w.u.B, { text: "  Giải 5 bài xác suất  ", shared: true });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ goal: "Giải 5 bài xác suất", shared: true });
    await api("put", `/channels/${ch}/pomodoro/goal`, w.u.A, { text: "việc riêng của A", shared: false });

    const asC = snapshotOf(await api("get", `/channels/${ch}/pomodoro`, w.u.C));
    expect(asC.participants.find((p: { userId: string }) => p.userId === w.u.B)).toMatchObject({ goal: "Giải 5 bài xác suất" });
    expect(asC.participants.find((p: { userId: string }) => p.userId === w.u.A)).not.toHaveProperty("goal");
    const asA = snapshotOf(await api("get", `/channels/${ch}/pomodoro`, w.u.A));
    expect(asA.myGoal).toEqual({ text: "việc riêng của A", shared: false });
    expect(asA.participants.map((p: { userId: string }) => p.userId).sort()).toEqual([w.u.A, w.u.B].sort());
  });
});

describe("kết quả phiên + lịch sử cá nhân", () => {
  it("summary trả số liệu của RIÊNG người xem; history mới → cũ kèm tên kênh, chỉ của mình", async () => {
    const ch = await seedChannel(w, { name: "phong-toan" });
    const joinA = await api("post", `/channels/${ch}/pomodoro/join`, w.u.A, { deviceId: deviceId("a") });
    const callId = joinA.body.data.call.id as string;
    await api("post", `/channels/${ch}/pomodoro/join`, w.u.B, { deviceId: deviceId("b") });
    await connect(h, callId, w.u.A);
    await connect(h, callId, w.u.B);
    const sessionId = joinA.body.data.snapshot.sessionId as string;
    const started = snapshotOf(await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(joinA.body.data.snapshot.version)));

    h.clock.advanceMinutes(25);
    await drainPomodoroOutbox(h); // deadline FOCUS → nghỉ ngắn: cả hai có mặt từ trước vòng → cyclesAttended 1
    h.clock.advanceMinutes(3);
    const onBreak = snapshotOf(await api("get", `/channels/${ch}/pomodoro`, w.u.A));
    expect(onBreak).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1, version: 3 });
    const ended = snapshotOf(await api("post", `/channels/${ch}/pomodoro/end`, w.u.A, cmd(onBreak.version)));
    expect(ended).toMatchObject({ phase: "ENDED", summary: { completedFocusCycles: 1 } });
    expect(started.version).toBe(2); // WAITING (v1) → FOCUS (v2)

    const summary = await api("get", `/channels/${ch}/pomodoro/sessions/${sessionId}/summary`, w.u.B);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ session: { sessionId, completedFocusCycles: 1, endReason: "HOST_ENDED" }, mine: { cyclesAttended: 1, interruptions: 0 } });
    expect(summary.body.data.mine.presentSeconds).toBeGreaterThanOrEqual(28 * 60);
    expect((await api("get", `/channels/${ch}/pomodoro/sessions/${sessionId}/summary`, w.u.C)).body.data.mine).toBeNull();
    expect((await api("get", `/channels/${await seedChannel(w)}/pomodoro/sessions/${sessionId}/summary`, w.u.B)).status).toBe(404);

    const history = await api("get", "/me/pomodoro/history?limit=10", w.u.B);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ sessionId, channelName: "phong-toan", status: "ENDED", cyclesAttended: 1, completedFocusCycles: 1 });
    expect((await api("get", "/me/pomodoro/history", w.u.D)).body.data).toEqual([]);
  });
});
