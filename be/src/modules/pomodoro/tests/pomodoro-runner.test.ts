import { newObjectId } from "../../../core/utils/object-id";
import type { PomodoroSessionEntity } from "../entities/pomodoro.interface";
import { makeHarness, type Harness } from "./support/pomodoro-harness";

const MIN = 60_000;
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const command = (n: number, expectedVersion: number) => ({ commandId: uuid(n), expectedVersion });

interface Room {
  h: Harness;
  channelId: string;
  host: ReturnType<Harness["user"]>;
  session: PomodoroSessionEntity;
  callId: string;
}

/** Phiên FOCUS đang chạy, có phòng với `host` (đã CONNECTED trong LiveKit giả). */
async function runningRoom(): Promise<Room> {
  const h = makeHarness();
  const channelId = h.channels.add().id;
  const host = h.user("host");
  const started = await h.c.service.start(host, channelId, command(1, 0));
  const call = h.calls.addCall({ hostId: host.id });
  h.calls.addMember(call.id, host.id, { role: "HOST", publishPermissions: { audio: false, video: true, screen: true } });
  h.media.join(call.livekitRoom, { identity: host.id });
  await h.repo.linkCall(started.sessionId as string, call.id);
  const session = (await h.repo.findById(started.sessionId as string)) as PomodoroSessionEntity;
  h.emitted.length = 0;
  h.outbox.events.length = 0;
  return { h, channelId, host, session, callId: call.id };
}

describe("PomodoroRunner — deadline (PM-03)", () => {
  it("hết giờ FOCUS → nghỉ ngắn: completed + 1, hẹn deadline mới bằng version mới, cộng cyclesAttended cho người có mặt từ đầu vòng", async () => {
    const { h, session, host, callId } = await runningRoom();
    const late = h.user("late");
    await h.repo.markJoined(session.id, host.id, new Date(session.phaseStartedAt!.getTime() - 1000)); // có mặt từ trước khi vòng bắt đầu
    h.clock.advanceMinutes(10);
    await h.repo.markJoined(session.id, late.id, h.clock.now()); // vào giữa vòng
    h.calls.addMember(callId, late.id);

    h.clock.advanceMinutes(15);
    const r = await h.c.runner.onDeadline({ sessionId: session.id, version: session.version, phase: "FOCUS" });
    expect(r).toBe("APPLIED");
    const after = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(after).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1, version: 2 });
    expect(after.phaseStartedAt).toEqual(session.phaseEndsAt); // mốc dự kiến, không tích luỹ độ trễ của job
    expect(after.phaseEndsAt?.getTime()).toBe(session.phaseEndsAt!.getTime() + 5 * MIN);

    expect((await h.repo.findPresence(session.id, host.id))?.cyclesAttended).toBe(1);
    expect((await h.repo.findPresence(session.id, late.id))?.cyclesAttended).toBe(0); // vào giữa vòng: không tính
    expect(h.outbox.named("pomodoro.deadline").map((e) => e.dedupeKey)).toEqual([`pomodoro.deadline:pomo:${session.id}:v2`]);
    expect(h.emitted.filter((e) => e.event === "pomodoro:updated")).toHaveLength(1);
  });

  it("PM-03: hai worker cùng nhận deadline → đúng MỘT lần chuyển phase", async () => {
    const { h, session } = await runningRoom();
    h.clock.advanceMinutes(25);
    const payload = { sessionId: session.id, version: session.version, phase: "FOCUS" };
    const results = await Promise.all([h.c.runner.onDeadline(payload), h.c.runner.onDeadline(payload)]);
    expect([...results].sort()).toEqual(["APPLIED", "NOOP"].sort());
    const after = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(after).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1, version: 2 }); // không cộng hai vòng
  });

  it("job cũ (version/phase lệch — đã pause, skip…) no-op, không đổi gì", async () => {
    const { h, session, host, channelId } = await runningRoom();
    await h.c.service.pause(host, channelId, command(2, session.version));
    h.clock.advanceMinutes(40);
    expect(await h.c.runner.onDeadline({ sessionId: session.id, version: session.version, phase: "FOCUS" })).toBe("STALE");
    expect(await h.c.runner.onDeadline({ sessionId: session.id, version: 2, phase: "SHORT_BREAK" })).toBe("STALE");
    expect(await h.c.runner.onDeadline({ sessionId: newObjectId(), version: 1, phase: "FOCUS" })).toBe("STALE");
    expect((await h.repo.findById(session.id))?.phase).toBe("PAUSED");
  });

  it("job tới sớm quá dung sai (lệch đồng hồ) → không chuyển phase", async () => {
    const { h, session } = await runningRoom();
    h.clock.advanceMinutes(20);
    expect(await h.c.runner.onDeadline({ sessionId: session.id, version: session.version, phase: "FOCUS" })).toBe("NOOP");
    expect((await h.repo.findById(session.id))?.version).toBe(1);
  });

  it("vòng thứ 4 xong → nghỉ dài; autoAdvance = false: hết nghỉ dừng ở đầu vòng kế (PAUSED HOST, chưa bắt đầu)", async () => {
    const { h, session, host, channelId } = await runningRoom();
    h.channels.map.set(channelId, { ...h.channels.map.get(channelId)!, defaultConfig: { ...session.config, autoAdvance: false } });
    let cur = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    // ép 3 vòng đã hoàn thành rồi để deadline vòng 4 chạy
    await h.repo.updateSession(undefined, cur.id, { version: cur.version }, { completedFocusCycles: 3, config: { ...cur.config, autoAdvance: false } });
    cur = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    h.clock.advanceMinutes(25);
    await h.c.runner.onDeadline({ sessionId: cur.id, version: cur.version, phase: "FOCUS" });
    cur = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(cur).toMatchObject({ phase: "LONG_BREAK", completedFocusCycles: 4 });

    h.clock.advanceMinutes(15);
    await h.c.runner.onDeadline({ sessionId: cur.id, version: cur.version, phase: "LONG_BREAK" });
    cur = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(cur).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "HOST", phaseStartedAt: null, remainingMs: 25 * MIN });
    const resumed = await h.c.service.resume(host, channelId, command(3, cur.version));
    expect(resumed).toMatchObject({ phase: "FOCUS", remainingMs: 25 * MIN });
  });
});

describe("PomodoroRunner — khôi phục & quét bù (PM-05)", () => {
  it("quá hạn nhiều (BE chết 10 phút) → PAUSED RECOVERY, completedFocusCycles KHÔNG đổi; chủ phòng tiếp tục thì phase chạy lại đủ thời lượng", async () => {
    const { h, session, host, channelId } = await runningRoom();
    h.clock.advanceMinutes(25 + 10);
    const out = await h.c.runner.reconcile();
    expect(out.overdue).toBe(1);
    const after = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(after).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "RECOVERY", completedFocusCycles: 0, remainingMs: 25 * MIN, phaseEndsAt: null });

    const resumed = await h.c.service.resume(host, channelId, command(2, after.version));
    expect(resumed).toMatchObject({ phase: "FOCUS", completedFocusCycles: 0 });
    expect(resumed.phaseEndsAt).toBe(new Date(h.clock.now().getTime() + 25 * MIN).toISOString());
  });

  it("quá hạn ít (≤ recoveryLagSeconds): tự chuyển phase như bình thường (cron nhặt job bị trôi)", async () => {
    const { h, session } = await runningRoom();
    h.clock.advanceMs(25 * MIN + 30_000);
    await h.c.runner.reconcile();
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1 });
  });

  it("không đụng phiên chưa tới hạn; quét lặp không nhân đôi (idempotent)", async () => {
    const { h, session } = await runningRoom();
    h.clock.advanceMinutes(5);
    await h.c.runner.reconcile();
    await h.c.runner.reconcile();
    expect((await h.repo.findById(session.id))?.version).toBe(1);
    h.clock.advanceMinutes(25);
    await h.c.runner.reconcile();
    await h.c.runner.reconcile();
    expect((await h.repo.findById(session.id))?.version).toBe(2);
  });

  it("kênh/nhóm đã lưu trữ → phiên ENDED (CHANNEL_ARCHIVED) và đóng phòng", async () => {
    const { h, session, channelId, callId } = await runningRoom();
    h.channels.map.set(channelId, { ...h.channels.map.get(channelId)!, status: "ARCHIVED" });
    await h.c.runner.reconcile();
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "ENDED", endReason: "CHANNEL_ARCHIVED" });
    expect(h.calls.ended).toEqual([{ callId, reason: "CHANNEL_ARCHIVED" }]);
  });
});

describe("PomodoroRunner — phòng rỗng (PM-07)", () => {
  it("người cuối rời → PAUSED EMPTY_ROOM (đóng băng thời gian) + hẹn 5 phút; hết 5 phút vẫn rỗng → ENDED, đóng phòng", async () => {
    const { h, session, callId } = await runningRoom();
    h.clock.advanceMinutes(10);
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []); // reconcile của calls đã đưa host về LEFT
    expect(await h.c.runner.onMaybeEmpty(session.id)).toBe("APPLIED");
    const paused = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "EMPTY_ROOM", remainingMs: 15 * MIN });
    expect(h.outbox.named("pomodoro.empty-room")).toEqual([
      expect.objectContaining({ delayMs: 5 * MIN, dedupeKey: `pomodoro.empty-room:pomo:${session.id}:v${paused.version}`, payload: expect.objectContaining({ version: paused.version }) }),
    ]);

    h.clock.advanceMinutes(5);
    expect(await h.c.runner.onEmptyRoomExpired({ sessionId: session.id, version: paused.version })).toBe("APPLIED");
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "ENDED", endReason: "EMPTY_ROOM", activeKey: `ended:${session.id}` });
    expect(h.calls.ended).toHaveLength(1);
  });

  it("phát hiện rỗng lặp lại (webhook trùng, cron) KHÔNG kéo dài đồng hồ 5 phút", async () => {
    const { h, session, callId } = await runningRoom();
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []);
    await h.c.runner.onMaybeEmpty(session.id);
    const versionBefore = (await h.repo.findById(session.id))?.version;
    expect(await h.c.runner.onMaybeEmpty(session.id)).toBe("NOOP");
    await h.c.runner.reconcile();
    expect((await h.repo.findById(session.id))?.version).toBe(versionBefore);
    expect(h.outbox.named("pomodoro.empty-room")).toHaveLength(1);
  });

  it("còn người trong LiveKit (hoặc đang JOINING) → không coi là rỗng", async () => {
    const { h, session, callId } = await runningRoom();
    expect(await h.c.runner.onMaybeEmpty(session.id)).toBe("NOOP"); // host còn trong LiveKit
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []);
    h.calls.addMember(callId, newObjectId(), { state: "JOINING" }); // vừa nhận token, chưa kịp kết nối
    expect(await h.c.runner.onMaybeEmpty(session.id)).toBe("NOOP");
    expect((await h.repo.findById(session.id))?.phase).toBe("FOCUS");
  });

  it("có người quay lại trước hạn: huỷ đếm (PAUSED HOST chờ chủ phòng), job 5 phút cũ no-op", async () => {
    const { h, session, callId, host, channelId } = await runningRoom();
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []);
    await h.c.runner.onMaybeEmpty(session.id);
    const paused = (await h.repo.findById(session.id)) as PomodoroSessionEntity;

    h.calls.addMember(callId, host.id, { role: "HOST" });
    h.media.join(`call_${callId}`, { identity: host.id });
    expect(await h.c.runner.onOccupied(session.id)).toBe("APPLIED");
    const back = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(back).toMatchObject({ phase: "PAUSED", pauseReason: "HOST", remainingMs: paused.remainingMs });

    h.clock.advanceMinutes(6);
    expect(await h.c.runner.onEmptyRoomExpired({ sessionId: session.id, version: paused.version })).toBe("STALE");
    expect((await h.repo.findById(session.id))?.phase).toBe("PAUSED");
    const resumed = await h.c.service.resume(host, channelId, command(5, back.version));
    expect(resumed.phase).toBe("FOCUS");
  });

  it("job 5 phút chạy khi phòng đã có người → giữ nguyên (không kết thúc oan)", async () => {
    const { h, session, callId } = await runningRoom();
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []);
    await h.c.runner.onMaybeEmpty(session.id);
    const paused = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    h.media.join(`call_${callId}`, { identity: newObjectId() }); // ai đó vào nhưng webhook chưa xử lý
    h.clock.advanceMinutes(5);
    expect(await h.c.runner.onEmptyRoomExpired({ sessionId: session.id, version: paused.version })).toBe("NOOP");
    expect((await h.repo.findById(session.id))?.phase).toBe("PAUSED");
  });

  it("cron: dấu EMPTY_ROOM quá 5 phút + dư mà job hẹn giờ bị mất → kết thúc phiên (lưới an toàn)", async () => {
    const { h, session, callId } = await runningRoom();
    h.media.leave(`call_${callId}`, session.hostUserId);
    h.calls.members.set(callId, []);
    await h.c.runner.onMaybeEmpty(session.id);
    h.clock.advanceMinutes(5);
    await h.c.runner.reconcile();
    expect((await h.repo.findById(session.id))?.phase).toBe("PAUSED"); // chưa quá dư
    h.clock.advanceMinutes(2);
    await h.c.runner.reconcile();
    expect(await h.repo.findById(session.id)).toMatchObject({ phase: "ENDED", endReason: "EMPTY_ROOM" });
  });

  it("phiên chưa từng có phòng: chỉ coi là rỗng sau thời gian ân hạn (người bấm bắt đầu còn đang vào phòng)", async () => {
    const h = makeHarness();
    const channelId = h.channels.add().id;
    const host = h.user("host");
    const started = await h.c.service.start(host, channelId, command(1, 0));
    await h.c.runner.reconcile();
    expect((await h.repo.findById(started.sessionId as string))?.phase).toBe("FOCUS");
    h.clock.advanceMinutes(3);
    await h.c.runner.reconcile();
    expect(await h.repo.findById(started.sessionId as string)).toMatchObject({ phase: "PAUSED", pauseReason: "EMPTY_ROOM" });
  });
});

describe("PomodoroRunner — đồng bộ chủ phòng (PM-09)", () => {
  it("failover của calls đổi Call.hostId → phiên đồng bộ hostUserId (version + 1) và phát pomodoro:updated", async () => {
    const { h, session, callId } = await runningRoom();
    const next = h.user("next");
    h.calls.calls.set(callId, { ...h.calls.calls.get(callId)!, hostId: next.id });
    await h.c.runner.onHostSync(session.id);
    const after = (await h.repo.findById(session.id)) as PomodoroSessionEntity;
    expect(after).toMatchObject({ hostUserId: next.id, version: 2 });
    const last = h.emitted.filter((e) => e.event === "pomodoro:updated").at(-1);
    expect(last?.payload).toMatchObject({ hostUserId: next.id, version: 2 });
    await h.c.runner.onHostSync(session.id); // idempotent
    expect((await h.repo.findById(session.id))?.version).toBe(2);
  });

  it("chủ phòng MỚI (theo Call) điều khiển được ngay cả khi phiên chưa kịp đồng bộ; chủ cũ mất quyền", async () => {
    const { h, session, callId, host, channelId } = await runningRoom();
    const next = h.user("next");
    h.calls.calls.set(callId, { ...h.calls.calls.get(callId)!, hostId: next.id });
    const paused = await h.c.service.pause(next, channelId, command(7, session.version + 1)); // đồng bộ tức thời làm version 2
    expect(paused).toMatchObject({ phase: "PAUSED", hostUserId: next.id });
    await expect(h.c.service.resume(host, channelId, command(8, paused.version))).rejects.toMatchObject({ errorCode: "CALL_POMO_004" });
  });
});
