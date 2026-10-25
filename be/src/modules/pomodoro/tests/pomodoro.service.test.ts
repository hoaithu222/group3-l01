import { VersionConflictError } from "../../../core/exceptions";
import { newObjectId } from "../../../core/utils/object-id";
import { ErrorCode } from "../../../core/utils/error.codes";
import { makeHarness, type Harness } from "./support/pomodoro-harness";

const MIN = 60_000;
// UUID dạng hợp lệ (service không kiểm — DTO Zod kiểm ở route); chỉ cần khoá idempotency khác nhau.
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = (n: number, expectedVersion: number) => ({ commandId: uuid(n), expectedVersion });

async function rejectsWith(p: Promise<unknown>, code: string, status?: number): Promise<void> {
  await expect(p).rejects.toMatchObject({ errorCode: code, ...(status ? { statusCode: status } : {}) });
}

describe("PomodoroService — lệnh của chủ phòng", () => {
  let h: Harness;
  let channelId: string;

  beforeEach(() => {
    h = makeHarness();
    channelId = h.channels.add().id;
  });

  it("kênh chưa có phiên: snapshot WAITING ảo (version 0, mặc định 25/5/15/4) + myActions cho người đọc", async () => {
    const a = h.user("a");
    const snap = await h.c.service.getSnapshot(a, channelId);
    expect(snap).toMatchObject({ sessionId: null, phase: "WAITING", version: 0, hostUserId: null, participants: [], config: { focusMinutes: 25, autoAdvance: true } });
    expect(snap.myActions).toMatchObject({ canJoin: true, canStart: true, canConfigure: false, canPause: false, canEnd: false });
    expect(snap.rules).toEqual({ micAllowed: true, cameraAllowed: true, screenShareAllowed: true });
  });

  it("kênh không phải POMODORO → 400 CALL_POMO_001; kênh không tồn tại → 404", async () => {
    const voice = h.channels.add({ type: "VOICE" });
    await rejectsWith(h.c.service.getSnapshot(h.user(), voice.id), ErrorCode.CALL_POMO_001, 400);
    await rejectsWith(h.c.service.getSnapshot(h.user(), newObjectId()), ErrorCode.RES_001, 404);
  });

  it("người đầu tiên bấm start tạo phiên FOCUS: chủ = người bấm, hẹn deadline BỀN qua outbox (delayMs = 25 phút), phát pomodoro:updated", async () => {
    const a = h.user("a");
    const snap = await h.c.service.start(a, channelId, command(1, 0));
    expect(snap).toMatchObject({ phase: "FOCUS", version: 1, hostUserId: a.id, completedFocusCycles: 0 });
    expect(snap.phaseEndsAt).toBe(new Date(h.clock.now().getTime() + 25 * MIN).toISOString());
    expect(snap.remainingMs).toBe(25 * MIN);
    expect(snap.phaseDurationMs).toBe(25 * MIN);
    expect(snap.rules.micAllowed).toBe(false);
    expect(snap.myActions).toMatchObject({ canPause: true, canSkip: true, canEnd: true, canStart: false });

    const [deadline] = h.outbox.named("pomodoro.deadline");
    expect(deadline).toMatchObject({ queue: "calls", delayMs: 25 * MIN, dedupeKey: `pomodoro.deadline:pomo:${snap.sessionId}:v1`, payload: { sessionId: snap.sessionId, version: 1, phase: "FOCUS" } });
    expect(h.emitted.map((e) => e.event)).toContain("pomodoro:updated");
    expect(h.emitted.at(-1)?.room).toBe(`ch:${channelId}`);
    // Bản phát chung cả phòng: không có myGoal/myActions.
    expect(h.emitted.at(-1)?.payload).not.toHaveProperty("myActions");
  });

  it("start khi kênh chưa có phiên nhưng expectedVersion ≠ 0 → 409 RES_003", async () => {
    await expect(h.c.service.start(h.user(), channelId, command(1, 3))).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("đã có phiên đang chạy → 409 CALL_POMO_002 (kể cả với chủ phiên)", async () => {
    const a = h.user("a");
    await h.c.service.start(a, channelId, command(1, 0));
    await rejectsWith(h.c.service.start(h.user("b"), channelId, command(2, 1)), ErrorCode.CALL_POMO_002, 409);
    await rejectsWith(h.c.service.start(a, channelId, command(3, 1)), ErrorCode.CALL_POMO_002, 409);
  });

  it("chỉ chủ phiên pause/resume/skip; người khác → 403 CALL_POMO_004; sai phase → 409 CALL_POMO_005", async () => {
    const a = h.user("a");
    const b = h.user("b");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    await rejectsWith(h.c.service.pause(b, channelId, command(2, started.version)), ErrorCode.CALL_POMO_004, 403);
    await rejectsWith(h.c.service.resume(a, channelId, command(3, started.version)), ErrorCode.CALL_POMO_005, 409); // đang FOCUS, chưa PAUSED

    const paused = await h.c.service.pause(a, channelId, command(4, started.version));
    expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "HOST", version: 2, phaseEndsAt: null });
    expect(paused.remainingMs).toBe(25 * MIN);
    await rejectsWith(h.c.service.skip(a, channelId, command(5, paused.version)), ErrorCode.CALL_POMO_005, 409);

    h.clock.advanceMinutes(7); // thời gian tạm dừng KHÔNG bị tính vào phase
    const resumed = await h.c.service.resume(a, channelId, command(6, paused.version));
    expect(resumed).toMatchObject({ phase: "FOCUS", version: 3, remainingMs: 25 * MIN });
    expect(resumed.phaseEndsAt).toBe(new Date(h.clock.now().getTime() + 25 * MIN).toISOString());
    expect(h.outbox.named("pomodoro.deadline").map((e) => e.dedupeKey)).toEqual([`pomodoro.deadline:pomo:${started.sessionId}:v1`, `pomodoro.deadline:pomo:${started.sessionId}:v3`]);
  });

  it("PM-04: skip trong FOCUS chuyển sang nghỉ ngắn, completedFocusCycles KHÔNG tăng (skippedFocusCycles tăng)", async () => {
    const a = h.user("a");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    h.clock.advanceMinutes(10);
    const skipped = await h.c.service.skip(a, channelId, command(2, started.version));
    expect(skipped).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 0, skippedFocusCycles: 1, version: 2 });
    expect(skipped.rules.micAllowed).toBe(true);
    expect(skipped.remainingMs).toBe(5 * MIN);
  });

  it("PM-03: hai lệnh host cùng expectedVersion → đúng MỘT thắng, bên kia 409 RES_003; version chỉ tăng một lần", async () => {
    const a = h.user("a");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    const results = await Promise.allSettled([h.c.service.pause(a, channelId, command(2, started.version)), h.c.service.skip(a, channelId, command(3, started.version))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(VersionConflictError);
    expect((await h.repo.findById(started.sessionId as string))?.version).toBe(2);
  });

  it("PM-08: cùng commandId gửi lại trả cùng kết quả, version KHÔNG tăng lần 2, không ghi thêm outbox", async () => {
    const a = h.user("a");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    const first = await h.c.service.pause(a, channelId, command(2, started.version));
    const eventsBefore = h.outbox.events.length;
    const second = await h.c.service.pause(a, channelId, command(2, started.version)); // gửi lại do mất phản hồi
    expect(second).toMatchObject({ phase: "PAUSED", version: first.version });
    expect(second.sessionId).toBe(first.sessionId);
    expect((await h.repo.findById(first.sessionId as string))?.version).toBe(first.version);
    expect(h.outbox.events).toHaveLength(eventsBefore);
  });

  it("commandId đang xử lý (PENDING) → 409 RES_004; lệnh lỗi nhả khoá để gửi lại cùng commandId", async () => {
    const a = h.user("a");
    const b = h.user("b");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    const key = h.c.deps.commands.keyOf(channelId, a.id, uuid(9));
    await h.redis.set(key, "PENDING", 60);
    await rejectsWith(h.c.service.pause(a, channelId, command(9, started.version)), ErrorCode.RES_004, 409);

    // Lệnh của người không phải host bị từ chối → khoá được nhả (không kẹt PENDING).
    await rejectsWith(h.c.service.pause(b, channelId, command(10, started.version)), ErrorCode.CALL_POMO_004, 403);
    expect(await h.redis.get(h.c.deps.commands.keyOf(channelId, b.id, uuid(10)))).toBeNull();
  });

  it("commandId gắn với người gửi: người khác gửi trùng UUID không nhận lại kết quả của host", async () => {
    const a = h.user("a");
    const b = h.user("b");
    const started = await h.c.service.start(a, channelId, command(1, 0));
    await h.c.service.pause(a, channelId, command(2, started.version));
    await rejectsWith(h.c.service.pause(b, channelId, command(2, started.version)), ErrorCode.CALL_POMO_004, 403);
  });

  it("end: chủ phiên kết thúc (HOST_ENDED); người có manage kết thúc KHẨN CẤP (MANAGER_ENDED); người khác 403", async () => {
    const a = h.user("a");
    const manager = h.user("m");
    const stranger = h.user("s");
    h.access.managers.add(manager.id);
    const started = await h.c.service.start(a, channelId, command(1, 0));
    await rejectsWith(h.c.service.end(stranger, channelId, command(2, started.version)), ErrorCode.CALL_POMO_004, 403);
    const ended = await h.c.service.end(manager, channelId, command(3, started.version));
    expect(ended).toMatchObject({ phase: "ENDED", summary: { endReason: "MANAGER_ENDED", completedFocusCycles: 0 } });
    const row = await h.repo.findById(started.sessionId as string);
    expect(row).toMatchObject({ phase: "ENDED", activeKey: `ended:${started.sessionId}`, endReason: "MANAGER_ENDED" });

    // Kênh lại trống chỗ cho phiên mới (activeKey đã đổi) và chủ phiên cũ không còn điều khiển được gì.
    const next = await h.c.service.start(stranger, channelId, command(4, 0));
    expect(next).toMatchObject({ phase: "FOCUS", hostUserId: stranger.id });
    await rejectsWith(h.c.service.end(a, channelId, command(5, started.version)), ErrorCode.CALL_POMO_004, 403);
  });

  it("end khi chưa có phiên → 409 CALL_POMO_005", async () => {
    await rejectsWith(h.c.service.end(h.user(), channelId, command(1, 0)), ErrorCode.CALL_POMO_005, 409);
  });

  it("kênh/nhóm đã lưu trữ: xem được nhưng start → 409 CALL_018; myActions.canJoin = false (ARCHIVED)", async () => {
    const archived = h.channels.add({ status: "ARCHIVED" });
    const a = h.user("a");
    await rejectsWith(h.c.service.start(a, archived.id, command(1, 0)), ErrorCode.CALL_018, 409);
    const snap = await h.c.service.getSnapshot(a, archived.id);
    expect(snap.myActions).toMatchObject({ canJoin: false, joinBlockedReason: "ARCHIVED", canStart: false });
  });
});

describe("PomodoroService — cấu hình", () => {
  let h: Harness;
  let channelId: string;
  const cfg = { focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, cyclesBeforeLongBreak: 3, autoAdvance: false };

  beforeEach(() => {
    h = makeHarness();
    channelId = h.channels.add().id;
  });

  it("chưa có phiên: cần quyền manage kênh (403 CALL_POMO_004), lưu làm mặc định của kênh cho phiên sau", async () => {
    const member = h.user("m");
    const manager = h.user("mg");
    h.access.managers.add(manager.id);
    await rejectsWith(h.c.service.updateConfig(member, channelId, cfg), ErrorCode.CALL_POMO_004, 403);

    const snap = await h.c.service.updateConfig(manager, channelId, cfg);
    expect(snap).toMatchObject({ sessionId: null, version: 0, config: { focusMinutes: 50, autoAdvance: false, hostCanSpeakInFocus: false } });
    expect(snap.myActions?.canConfigure).toBe(true);

    const started = await h.c.service.start(member, channelId, command(1, 0));
    expect(started.config).toMatchObject({ focusMinutes: 50, shortBreakMinutes: 10, cyclesBeforeLongBreak: 3, autoAdvance: false });
    expect(started.phaseDurationMs).toBe(50 * MIN);
  });

  it("phiên WAITING: chủ phiên sửa (CAS + version tăng + phát); người khác 403; expectedVersion lệch 409 RES_003", async () => {
    const host = h.user("h");
    const other = h.user("o");
    const waiting = await h.c.transitions.create(h.channels.map.get(channelId)!, host.id, false);
    await rejectsWith(h.c.service.updateConfig(other, channelId, cfg), ErrorCode.CALL_POMO_004, 403);
    await expect(h.c.service.updateConfig(host, channelId, { ...cfg, expectedVersion: 5 })).rejects.toBeInstanceOf(VersionConflictError);

    const snap = await h.c.service.updateConfig(host, channelId, { ...cfg, hostCanSpeakInFocus: true, expectedVersion: waiting.version });
    expect(snap).toMatchObject({ phase: "WAITING", version: waiting.version + 1, config: { focusMinutes: 50, hostCanSpeakInFocus: true } });
    expect(snap.myActions).toMatchObject({ canConfigure: true, canStart: true });

    const started = await h.c.service.start(host, channelId, command(1, snap.version));
    expect(started.phaseDurationMs).toBe(50 * MIN);
  });

  it("phiên đã chạy → 409 CALL_POMO_003 (chỉ đổi cấu hình khi WAITING)", async () => {
    const host = h.user("h");
    await h.c.service.start(host, channelId, command(1, 0));
    await rejectsWith(h.c.service.updateConfig(host, channelId, cfg), ErrorCode.CALL_POMO_003, 409);
  });
});

describe("PomodoroSnapshot — nguồn sự thật đồng hồ", () => {
  it("mọi snapshot kèm serverNow; đang chạy: remainingMs = phaseEndsAt − serverNow; tạm dừng: đúng phần còn lại đã lưu", async () => {
    const h = makeHarness();
    const channel = h.channels.add();
    const a = h.user("a");
    const started = await h.c.service.start(a, channel.id, command(1, 0));
    h.clock.advanceMs(90_000);
    const live = (await h.c.service.getSnapshot(a, channel.id));
    expect(live.serverNow).toBe(h.clock.now().toISOString());
    expect(live.remainingMs).toBe(25 * MIN - 90_000);
    expect(new Date(live.phaseEndsAt as string).getTime() - new Date(live.serverNow).getTime()).toBe(live.remainingMs);

    await h.c.service.pause(a, channel.id, command(2, started.version));
    h.clock.advanceMinutes(30);
    const paused = await h.c.service.getSnapshot(a, channel.id);
    expect(paused.remainingMs).toBe(25 * MIN - 90_000); // đóng băng, không trôi theo đồng hồ
  });
});
