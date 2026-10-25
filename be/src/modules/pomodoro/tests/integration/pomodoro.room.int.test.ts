import "./pomodoro-test-mocks"; // PHẢI đứng ĐẦU: env LiveKit + mock cờ/Redis trước khi nạp module khác
import { runtimeConfig } from "../../../../core/config/runtime-config";
import { prisma } from "../../../../infrastructure/database";
import { createPomodoroContainer, setPomodoroContainerForTests } from "../../pomodoro.container";
import {
  buildApp,
  cleanupWorlds,
  commandId,
  connect,
  deviceId,
  disconnect,
  drainPomodoroOutbox,
  ensureIndexes,
  grantOf,
  installHarness,
  installPermissionPorts,
  makeApi,
  resetPermissionSpy,
  roomOf,
  seedChannel,
  seedWorld,
  sourcesOf,
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
  w = await seedWorld(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  worlds.push(w);
});

afterAll(async () => {
  resetPermissionSpy();
  await cleanupWorlds(worlds);
});

const cmd = (expectedVersion: number) => ({ commandId: commandId(), expectedVersion });
type Snap = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const join = (ch: string, user: string, extra: Record<string, unknown> = {}) => api("post", `/channels/${ch}/pomodoro/join`, user, { deviceId: deviceId(), ...extra });
const snap = async (ch: string, user: string): Promise<Snap> => (await api("get", `/channels/${ch}/pomodoro`, user)).body.data as Snap;
const lastUpdateOf = (userId: string) => h.media.callsOf("updateParticipant").filter((c) => (c.args)[1] === userId).at(-1)?.args as [string, string, { permission: { canPublish: boolean; canPublishSources: string[] } }];

/** A mở phòng (WAITING) → bắt đầu FOCUS → B vào; cả hai đã kết nối LiveKit. */
async function runningRoom(): Promise<{ ch: string; callId: string; sessionId: string }> {
  const ch = await seedChannel(w);
  const joined = await join(ch, w.u.A);
  expect(joined.status).toBe(200);
  const callId = joined.body.data.call.id as string;
  const sessionId = joined.body.data.snapshot.sessionId as string;
  expect((await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(joined.body.data.snapshot.version))).status).toBe(200);
  expect((await join(ch, w.u.B)).status).toBe(200);
  await connect(h, callId, w.u.A);
  await connect(h, callId, w.u.B);
  return { ch, callId, sessionId };
}

describe("vào học: phiên WAITING + Call ROOM của kênh", () => {
  it("người đầu tiên vào mở phiên WAITING (chủ = người đó) + phòng: ghi DB đúng, token CHỈ để kết nối (không quyền admin), cùng thiết bị vào lại thì idempotent", async () => {
    const ch = await seedChannel(w);
    const res = await join(ch, w.u.A, { deviceId: "device-aaaa-1111" });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.snapshot).toMatchObject({ phase: "WAITING", hostUserId: w.u.A, version: 1, sessionId: expect.any(String) });
    expect(d.call).toMatchObject({ scopeType: "CHANNEL", scopeId: ch, mode: "ROOM", status: "ACTIVE", hostId: w.u.A });
    expect(d.livekitUrl).toBe("ws://localhost:7880");
    const grant = grantOf(d.token);
    expect(grant).toMatchObject({ canPublish: true, room: `call_${d.call.id}` });
    expect(sourcesOf(d.token)).toEqual(expect.arrayContaining(["MICROPHONE", "CAMERA", "SCREEN_SHARE"])); // WAITING: chưa khoá mic
    expect(grant.roomAdmin).toBeFalsy();

    const session = await prisma.pomodoroSession.findFirst({ where: { channelId: ch } });
    expect(session).toMatchObject({ phase: "WAITING", hostUserId: w.u.A, callId: d.call.id, activeKey: ch, version: 1 });
    const call = await prisma.call.findUnique({ where: { id: d.call.id } });
    expect(call).toMatchObject({ scopeType: "CHANNEL", scopeId: ch, mode: "ROOM", status: "ACTIVE", hostId: w.u.A, activeKey: `CHANNEL:${ch}` });
    expect(await prisma.callParticipant.findUnique({ where: { callId_userId: { callId: d.call.id, userId: w.u.A } } })).toMatchObject({ role: "HOST", state: "JOINING" });

    const again = await join(ch, w.u.A, { deviceId: "device-aaaa-1111" });
    expect(again.status).toBe(200);
    expect(again.body.data.call.id).toBe(d.call.id);
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(1);
    expect(await prisma.pomodoroSession.count({ where: { channelId: ch } })).toBe(1);
  });

  it("hai người vào ĐỒNG THỜI kênh mới: đúng một phiên, một phòng, cả hai vào được; chủ phiên = chủ phòng", async () => {
    const ch = await seedChannel(w);
    const [a, b] = await Promise.all([join(ch, w.u.A), join(ch, w.u.B)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.data.call.id).toBe(b.body.data.call.id);
    expect(await prisma.pomodoroSession.count({ where: { channelId: ch } })).toBe(1);
    expect(await prisma.call.count({ where: { scopeId: ch } })).toBe(1);
    expect(await prisma.callParticipant.count({ where: { callId: a.body.data.call.id } })).toBe(2);
    const session = await prisma.pomodoroSession.findFirst({ where: { channelId: ch } });
    const call = await prisma.call.findUnique({ where: { id: a.body.data.call.id } });
    expect(call?.hostId).toBe(session?.hostUserId);
    expect(a.body.data.snapshot.hostUserId).toBe(b.body.data.snapshot.hostUserId);
  });

  it("đủ chỗ (LIMITS.pomodoro.maxParticipants = 8) → người thứ 9 nhận 409 CALL_008", async () => {
    const ch = await seedChannel(w);
    for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) expect((await join(ch, w.u[name])).status).toBe(200);
    const full = await join(ch, w.u.I);
    expect([full.status, full.body.error.code]).toEqual([409, "CALL_008"]);
    expect((await snap(ch, w.u.I)).myActions).toMatchObject({ canJoin: false, joinBlockedReason: "FULL" });
  });

  it("thiết bị khác: không force → 409 CALL_004 (sameCallOtherDevice); force → đá máy cũ (removeParticipant) và cấp token mới", async () => {
    const ch = await seedChannel(w);
    const first = await join(ch, w.u.A, { deviceId: "device-aaaa-1111" });
    const callId = first.body.data.call.id as string;
    const blocked = await join(ch, w.u.A, { deviceId: "device-bbbb-2222" });
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CALL_004"]);
    expect(blocked.body.error.details).toMatchObject({ sameCallOtherDevice: true });
    const forced = await join(ch, w.u.A, { deviceId: "device-bbbb-2222", force: true });
    expect(forced.status).toBe(200);
    expect(h.media.callsOf("removeParticipant").map((c) => c.args)).toContainEqual([roomOf(callId), w.u.A]);
    expect(await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.A } } })).toMatchObject({ respondedDeviceId: "device-bbbb-2222" });
  });

  it("người bị mời ra khỏi phòng (REMOVED) → 403 CALL_016; kênh lưu trữ → 409 CALL_018; voice tắt → 503 CALL_012 (xem preview vẫn được)", async () => {
    const ch = await seedChannel(w);
    const a = await join(ch, w.u.A);
    await join(ch, w.u.B);
    await prisma.callParticipant.update({ where: { callId_userId: { callId: a.body.data.call.id, userId: w.u.B } }, data: { state: "REMOVED" } });
    const removed = await join(ch, w.u.B);
    expect([removed.status, removed.body.error.code]).toEqual([403, "CALL_016"]);
    expect((await snap(ch, w.u.B)).myActions).toMatchObject({ canJoin: false, joinBlockedReason: "REMOVED" });

    const archived = await seedChannel(w, { status: "ARCHIVED" });
    const blocked = await join(archived, w.u.C);
    expect([blocked.status, blocked.body.error.code]).toEqual([409, "CALL_018"]);

    jest.spyOn(runtimeConfig, "isFeatureEnabled").mockImplementation((m) => Promise.resolve(m !== "voice"));
    const off = await join(ch, w.u.C);
    expect([off.status, off.body.error.code]).toEqual([503, "CALL_012"]);
    expect((await api("get", `/channels/${ch}/pomodoro`, w.u.C)).status).toBe(200);
  });

  it("kênh VOICE không dùng đường vào này (CALL_POMO_001) và kênh POMODORO không vào được bằng POST /calls (lõi từ chối CALL_013)", async () => {
    const voice = await seedChannel(w, { type: "VOICE" });
    const res = await join(voice, w.u.A);
    expect([res.status, res.body.error.code]).toEqual([400, "CALL_POMO_001"]);
    const ch = await seedChannel(w);
    const viaCalls = await api("post", "/calls", w.u.A, { scopeType: "CHANNEL", scopeId: ch, mediaKind: "AUDIO", clientCallId: commandId(), deviceId: deviceId() });
    expect([viaCalls.status, viaCalls.body.error.code]).toEqual([400, "CALL_013"]);
  });
});

describe("luật mic theo phase — quyền thực thi ở máy chủ media (PM-02, PM-06 phía API)", () => {
  it("vào giữa FOCUS: token KHÔNG có MICROPHONE (mic bị khoá, camera/màn hình được); sau khi kết nối LiveKit áp quyền chặt [CAMERA, SCREEN_SHARE]; gia hạn token vẫn khoá", async () => {
    const { ch, callId } = await runningRoom();
    const late = await join(ch, w.u.C);
    expect(late.status).toBe(200);
    expect(late.body.data.snapshot).toMatchObject({ phase: "FOCUS", rules: { micAllowed: false } });
    const grant = grantOf(late.body.data.token);
    expect(grant.canPublish).toBe(true);
    expect(sourcesOf(late.body.data.token)).not.toContain("MICROPHONE");
    expect(sourcesOf(late.body.data.token)).toEqual(expect.arrayContaining(["CAMERA", "SCREEN_SHARE"]));
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.C } } }))?.publishPermissions).toMatchObject({ audio: false, video: true });

    await connect(h, callId, w.u.C);
    const update = lastUpdateOf(w.u.C);
    expect(update[2].permission).toMatchObject({ canPublish: true, canPublishSources: ["CAMERA", "SCREEN_SHARE"] });

    const refreshed = await api("post", `/calls/${callId}/token`, w.u.C);
    expect(refreshed.status).toBe(200);
    expect(sourcesOf(refreshed.body.data.token)).not.toContain("MICROPHONE");
  });

  it("hết FOCUS → nghỉ: trả lại MICROPHONE cho mọi người (LiveKit + DB + token), KHÔNG bật mic hộ; hết nghỉ → FOCUS lại khoá", async () => {
    const { ch, callId } = await runningRoom();
    h.media.calls.length = 0;
    h.clock.advanceMinutes(25);
    expect(await drainPomodoroOutbox(h)).toContain("pomodoro.deadline");
    expect(await snap(ch, w.u.B)).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1, rules: { micAllowed: true } });

    for (const u of [w.u.A, w.u.B]) expect(lastUpdateOf(u)[2].permission.canPublishSources).toEqual(expect.arrayContaining(["MICROPHONE", "CAMERA", "SCREEN_SHARE"]));
    expect(h.media.callsOf("mutePublishedTrack")).toHaveLength(0);
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B } } }))?.publishPermissions.audio).toBe(true);
    const refreshed = await api("post", `/calls/${callId}/token`, w.u.B);
    expect(sourcesOf(refreshed.body.data.token)).toContain("MICROPHONE");

    h.clock.advanceMinutes(5);
    await drainPomodoroOutbox(h);
    expect((await snap(ch, w.u.B)).phase).toBe("FOCUS");
    for (const u of [w.u.A, w.u.B]) expect(lastUpdateOf(u)[2].permission).toMatchObject({ canPublish: true, canPublishSources: ["CAMERA", "SCREEN_SHARE"] });
    expect((await prisma.callParticipant.findUnique({ where: { callId_userId: { callId, userId: w.u.B } } }))?.publishPermissions.audio).toBe(false);
  });

  it("tạm dừng giữa vòng tập trung vẫn giữ khoá mic; tạm dừng khi nghỉ thì không", async () => {
    const { ch } = await runningRoom();
    const focus = await snap(ch, w.u.A);
    const paused = (await api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, cmd(focus.version))).body.data as Snap;
    expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", rules: { micAllowed: false } });
    const resumed = (await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(paused.version))).body.data as Snap;
    const skipped = (await api("post", `/channels/${ch}/pomodoro/skip`, w.u.A, cmd(resumed.version))).body.data as Snap;
    expect(skipped).toMatchObject({ phase: "SHORT_BREAK", rules: { micAllowed: true } });
    const breakPaused = (await api("post", `/channels/${ch}/pomodoro/pause`, w.u.A, cmd(skipped.version))).body.data as Snap;
    expect(breakPaused).toMatchObject({ phase: "PAUSED", previousPhase: "SHORT_BREAK", rules: { micAllowed: true } });
  });
});

describe("đồng hồ bền: job hẹn giờ, khôi phục, phòng rỗng", () => {
  it("PM-03: hai worker cùng nhận deadline → đúng MỘT lần chuyển phase (CAS trên Mongo thật), completedFocusCycles chỉ +1", async () => {
    const { ch, sessionId } = await runningRoom();
    const before = await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } });
    h.clock.advanceMinutes(25);
    const payload = { sessionId, version: before.version, phase: "FOCUS" };
    const results = await Promise.all([h.pomo.runner.onDeadline(payload), h.pomo.runner.onDeadline(payload)]);
    expect([...results].sort()).toEqual(["APPLIED", "NOOP"]);
    expect(await snap(ch, w.u.A)).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 1, version: before.version + 1 });
  });

  it("cyclesAttended chỉ tính người có mặt TỪ ĐẦU vòng; người vào giữa vòng không được tính", async () => {
    const ch = await seedChannel(w);
    const joined = await join(ch, w.u.A);
    const callId = joined.body.data.call.id as string;
    const sessionId = joined.body.data.snapshot.sessionId as string;
    await connect(h, callId, w.u.A);
    await api("post", `/channels/${ch}/pomodoro/start`, w.u.A, cmd(1));
    h.clock.advanceMinutes(10);
    await join(ch, w.u.B);
    await connect(h, callId, w.u.B); // vào giữa vòng
    h.clock.advanceMinutes(15);
    await drainPomodoroOutbox(h);
    expect(await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId: w.u.A } } })).toMatchObject({ cyclesAttended: 1, leftAt: null });
    expect(await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId: w.u.B } } })).toMatchObject({ cyclesAttended: 0, leftAt: null });
  });

  it("presentSeconds theo giờ rời; rời rồi vào lại = +1 gián đoạn", async () => {
    const { callId, sessionId } = await runningRoom();
    h.clock.advanceMinutes(12);
    await disconnect(h, callId, w.u.B);
    expect(await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId: w.u.B } } })).toMatchObject({ presentSeconds: 12 * 60, interruptions: 0 });
    h.clock.advanceMinutes(2);
    await connect(h, callId, w.u.B);
    expect(await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId: w.u.B } } })).toMatchObject({ leftAt: null, interruptions: 1 });
  });

  it("PM-07: người cuối rời → PAUSED EMPTY_ROOM (đóng băng thời gian); 5 phút vẫn rỗng → ENDED và đóng phòng; không chạy vô hạn", async () => {
    const { ch, callId, sessionId } = await runningRoom();
    h.clock.advanceMinutes(10);
    await disconnect(h, callId, w.u.B);
    expect((await snap(ch, w.u.A)).phase).toBe("FOCUS"); // còn A
    await disconnect(h, callId, w.u.A);
    const paused = await snap(ch, w.u.A);
    expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "EMPTY_ROOM" });
    expect(paused.remainingMs).toBeGreaterThan(14 * MIN);
    expect(paused.remainingMs).toBeLessThanOrEqual(15 * MIN);
    const emptyJobs = await prisma.outboxEvent.findMany({ where: { aggregateId: sessionId, jobName: "pomodoro.empty-room" } });
    expect(emptyJobs).toHaveLength(1);
    expect(emptyJobs[0].delayMs).toBe(5 * MIN);

    h.clock.advanceMinutes(5);
    await drainPomodoroOutbox(h);
    expect(await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ phase: "ENDED", endReason: "EMPTY_ROOM", activeKey: `ended:${sessionId}` });
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "EMPTY" });
  });

  it("có người quay lại trước 5 phút: huỷ đếm — phiên PAUSED chờ chủ phòng tiếp tục, job cũ không kết thúc oan", async () => {
    const { ch, callId, sessionId } = await runningRoom();
    await disconnect(h, callId, w.u.B);
    await disconnect(h, callId, w.u.A);
    expect((await snap(ch, w.u.A)).pauseReason).toBe("EMPTY_ROOM");

    h.clock.advanceMinutes(2);
    expect((await join(ch, w.u.A)).status).toBe(200);
    await connect(h, callId, w.u.A);
    expect(await snap(ch, w.u.A)).toMatchObject({ phase: "PAUSED", pauseReason: "HOST" });

    h.clock.advanceMinutes(4);
    await drainPomodoroOutbox(h);
    const cur = await snap(ch, w.u.A);
    expect(cur.phase).toBe("PAUSED"); // job 5 phút cũ (version lệch) no-op
    const resumed = await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(cur.version));
    expect(resumed.body.data.phase).toBe("FOCUS");
    expect(await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ phase: "FOCUS", endedAt: null });
  });

  it("PM-05: BE khởi động lại giữa FOCUS — snapshot đọc lại đúng từ DB; quá hạn nhiều → cron đưa vào PAUSED RECOVERY (không cộng vòng ảo), chủ phòng tiếp tục", async () => {
    const { ch, sessionId } = await runningRoom();
    const before = await snap(ch, w.u.B);
    // "Khởi động lại": dựng lại toàn bộ container (mất mọi trạng thái trong bộ nhớ) trên cùng DB.
    const restarted = createPomodoroContainer({
      redisPort: h.pomoRedis,
      now: () => h.clock.now(),
      jobs: { scheduleHostSync: () => Promise.resolve() },
      socket: { emit: () => undefined },
    });
    setPomodoroContainerForTests(restarted);
    const after = await snap(ch, w.u.B);
    expect(after).toMatchObject({ phase: "FOCUS", phaseEndsAt: before.phaseEndsAt, version: before.version, completedFocusCycles: 0 });

    h.clock.advanceMinutes(25 + 10); // BE chết 10 phút quá hạn
    await restarted.runner.reconcile();
    const recovered = await snap(ch, w.u.A);
    expect(recovered).toMatchObject({ phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "RECOVERY", completedFocusCycles: 0 });
    expect(recovered.remainingMs).toBe(25 * MIN);
    const resumed = await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(recovered.version));
    expect(resumed.body.data).toMatchObject({ phase: "FOCUS", completedFocusCycles: 0 });
    expect((await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } })).completedFocusCycles).toBe(0);
  });
});

describe("chủ phòng: failover đồng bộ với p2-03 (PM-09)", () => {
  it("chủ phiên rớt mạng: calls chuyển chủ Call sau grace, phiên đồng bộ hostUserId, phát pomodoro:updated; chủ mới điều khiển được, chủ cũ mất quyền", async () => {
    const { ch, callId, sessionId } = await runningRoom();
    await disconnect(h, callId, w.u.A);
    expect(h.failovers.at(-1)).toMatchObject({ callId, delayMs: 30_000 }); // failover của lõi calls theo grace 30 s
    expect(h.hostSyncs).toEqual([{ sessionId, delayMs: 35_000 }]); // Pomodoro hẹn đồng bộ ngay sau đó

    expect(await h.calls.host.failover(callId)).toBe("CHANGED"); // job `call.host-failover` chạy khi hết grace
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).hostId).toBe(w.u.B);
    h.emitted.length = 0;
    await h.pomo.runner.onHostSync(sessionId); // job `pomodoro.host-sync`
    expect((await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } })).hostUserId).toBe(w.u.B);
    expect(h.emitted.at(-1)?.payload).toMatchObject({ hostUserId: w.u.B });

    const cur = await snap(ch, w.u.B);
    expect(cur.myActions).toMatchObject({ canPause: true, canSkip: true, canEnd: true });
    expect((await api("post", `/channels/${ch}/pomodoro/pause`, w.u.B, cmd(cur.version))).status).toBe(200);
    const denied = await api("post", `/channels/${ch}/pomodoro/resume`, w.u.A, cmd(cur.version + 1));
    expect([denied.status, denied.body.error.code]).toEqual([403, "CALL_POMO_004"]);
  });

  it("chủ mới điều khiển được NGAY cả khi job đồng bộ chưa chạy (lệnh tự đồng bộ theo Call.hostId)", async () => {
    const { ch, callId } = await runningRoom();
    await disconnect(h, callId, w.u.A);
    await h.calls.host.failover(callId);
    const before = await snap(ch, w.u.B); // GET tự đồng bộ chủ phiên
    expect(before.hostUserId).toBe(w.u.B);
    expect((await api("post", `/channels/${ch}/pomodoro/skip`, w.u.B, cmd(before.version))).status).toBe(200);
  });

  it("rời phòng bằng POST /calls/:id/leave của lõi (không kiểm loại kênh): người thường rời được, hiện diện chốt qua webhook", async () => {
    const { callId, sessionId } = await runningRoom();
    h.clock.advanceMinutes(3);
    const res = await api("post", `/calls/${callId}/leave`, w.u.B, {});
    expect(res.status).toBe(200);
    await disconnect(h, callId, w.u.B);
    expect(await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId: w.u.B } } })).toMatchObject({ presentSeconds: 3 * 60 });
  });
});

describe("kết thúc phiên đóng phòng + kênh lưu trữ", () => {
  it("chủ phòng kết thúc phiên → phiên ENDED, Call kết thúc (HOST_ENDED), hiện diện còn mở được chốt; người khác không vào lại phòng cũ", async () => {
    const { ch, callId, sessionId } = await runningRoom();
    h.clock.advanceMinutes(7);
    const cur = await snap(ch, w.u.A);
    const ended = await api("post", `/channels/${ch}/pomodoro/end`, w.u.A, cmd(cur.version));
    expect(ended.status).toBe(200);
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "HOST_ENDED" });
    const presences = await prisma.pomodoroPresence.findMany({ where: { sessionId } });
    expect(presences).toHaveLength(2);
    for (const p of presences) expect(p).toMatchObject({ presentSeconds: 7 * 60 });
    expect(presences.every((p) => p.leftAt !== null)).toBe(true);
    // Phiên mới trên cùng kênh: phòng MỚI (Call cũ đã ENDED).
    const again = await join(ch, w.u.C);
    expect(again.status).toBe(200);
    expect(again.body.data.call.id).not.toBe(callId);
    expect(again.body.data.snapshot).toMatchObject({ phase: "WAITING", hostUserId: w.u.C });
  });

  it("kênh bị lưu trữ giữa chừng → cron kết thúc phiên (CHANNEL_ARCHIVED) và đóng phòng", async () => {
    const { ch, callId, sessionId } = await runningRoom();
    await prisma.channel.update({ where: { id: ch }, data: { status: "ARCHIVED" } });
    await h.pomo.runner.reconcile();
    expect(await prisma.pomodoroSession.findUniqueOrThrow({ where: { id: sessionId } })).toMatchObject({ phase: "ENDED", endReason: "CHANNEL_ARCHIVED" });
    expect((await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status).toBe("ENDED");
  });
});
