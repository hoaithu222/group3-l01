import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { cleanupRoomWorld, connectClient, createMeeting, deviceId, drainRoomOutbox, ensureRoomIndexes, installRoomHarness, joinMeeting, startMeeting, type RoomHarness } from "./meeting-room-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

const limitsWith = (maxParticipants: number) => () => Promise.resolve({ attendeesMax: 200, remindersMax: 3, joinWindowMinutes: 10, maxParticipants, maxMinutes: 240, restartWindowMinutes: 60 });

describe("phòng họp — bắt đầu / vào phòng (integration, Mongo memory replset, calls thật + LiveKit giả)", () => {
  const worlds: World[] = [];
  let h: RoomHarness;
  let w: World;

  beforeAll(async () => {
    await ensureRoomIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installRoomHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupRoomWorld(worlds.splice(0));
    redisStore.clear();
  });

  it("MR-01: bắt đầu trước giờ mở phòng → 409 MEET_012 kèm joinOpensAt; nút bắt đầu (myActions.canStart) vẫn tắt", async () => {
    const m = await createMeeting(api, w, w.u.C!, {}, 120);
    const res = await startMeeting(api, m, w.u.C!);
    expect([res.status, res.body.error.code]).toEqual([409, "MEET_012"]);
    expect(new Date(res.body.error.details.joinOpensAt).getTime()).toBe(new Date(m.startAt).getTime() - 10 * 60_000);
    expect(m.myActions).toMatchObject({ canStart: false });
    expect(await prisma.call.count({ where: { scopeId: m.id } })).toBe(0);
    const early = await joinMeeting(api, m.id, w.u.C!);
    expect(early.body.error.code).toBe("MEET_012");
  });

  it("start: SCHEDULED → LIVE một transaction (Meeting + Call ROOM + attendee), token theo quyền, outbox started + 2 hàng tự đóng, audit, phòng LiveKit, socket meeting:started", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!] });
    const res = await startMeeting(api, m, w.u.C!);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({ state: "JOINED", meetingId: m.id, role: "HOST", publishPermissions: { audio: true, video: true, screen: true }, recording: null, lockedAt: null, closingAt: null });
    expect(data.livekitRoom).toBe(`meet_${m.code.replace(/-/g, "")}`);
    expect(data.token.split(".")).toHaveLength(3);
    expect(data.livekitUrl).toBe("ws://localhost:7880");
    expect(data.meeting).toMatchObject({ id: m.id, status: "LIVE", version: 2, currentCallId: data.callId, myActions: { canEnd: true, canStart: false } });

    const meeting = await prisma.meeting.findUnique({ where: { id: m.id } });
    expect(meeting).toMatchObject({ status: "LIVE", currentCallId: data.callId, lockedAt: null, endedAt: null, endReason: null });
    expect(meeting!.startedAt).not.toBeNull();
    const call = await prisma.call.findUnique({ where: { id: data.callId } });
    expect(call).toMatchObject({ scopeType: "MEETING", scopeId: m.id, mode: "ROOM", status: "ACTIVE", hostId: null, activeKey: `MEETING:${m.id}`, livekitRoom: data.livekitRoom });
    expect(await prisma.callParticipant.findFirst({ where: { callId: data.callId, userId: w.u.C! } })).toMatchObject({ role: "HOST", state: "JOINING", publishPermissions: { audio: true, video: true, screen: true } });
    expect((await prisma.meetingAttendee.findMany({ where: { meetingId: m.id } })).every((a) => a.meetingStatus === "LIVE")).toBe(true);

    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.started" } })).toBe(1);
    const closers = await prisma.outboxEvent.findMany({ where: { aggregateId: m.id, type: "meeting.auto-close" } });
    expect(closers.map((c) => (c.payload as { phase: string }).phase).sort()).toEqual(["CLOSE", "WARN"]);
    expect(closers.every((c) => c.queue === "calls" && c.availableAt.getTime() > Date.now())).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "meeting.start", targetId: m.id } })).toBe(1);
    expect(h.media.callsOf("createRoom")[0]!.args[0]).toMatchObject({ name: data.livekitRoom, emptyTimeoutSeconds: 300, maxParticipants: 52 });
    expect(h.emitted.some((e) => e.target === "room" && e.to === `meet:${m.id}` && e.event === "meeting:started")).toBe(true);
    expect(h.eventsTo(w.u.D!, "meeting:started")).toHaveLength(1);
  });

  it("MR-02: hai đồng chủ trì bấm Bắt đầu cùng lúc → MỘT Call, version +1 một lần, người thứ hai nhận token vào cùng phòng", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!], coHostIds: [w.u.D!] });
    const [a, b] = await Promise.all([startMeeting(api, m, w.u.C!), startMeeting(api, m, w.u.D!)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.data.state, b.body.data.state]).toEqual(["JOINED", "JOINED"]);
    expect(a.body.data.callId).toBe(b.body.data.callId);
    expect(b.body.data.role).toBe("CO_HOST");
    expect(await prisma.call.count({ where: { scopeId: m.id } })).toBe(1);
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.version).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.started" } })).toBe(1);
  });

  it("start lần hai của LIVE = vào phòng (idempotent); expectedVersion cũ trên cuộc SCHEDULED → RES_003", async () => {
    const m = await createMeeting(api, w, w.u.C!);
    await prisma.meeting.update({ where: { id: m.id }, data: { title: "Đổi tiêu đề", version: { increment: 1 } } });
    const stale = await startMeeting(api, m, w.u.C!); // version lệch
    expect([stale.status, stale.body.error.code]).toEqual([409, "RES_003"]);
    expect(await prisma.call.count({ where: { scopeId: m.id } })).toBe(0);

    const fresh = { id: m.id, version: 2 };
    const dev = deviceId();
    const first = await startMeeting(api, fresh, w.u.C!, { deviceId: dev });
    expect(first.status).toBe(200);
    const again = await startMeeting(api, fresh, w.u.C!, { deviceId: dev });
    expect(again.status).toBe(200);
    expect(again.body.data.callId).toBe(first.body.data.callId);
    expect(await prisma.call.count({ where: { scopeId: m.id } })).toBe(1);
  });

  it("ATTENDEE/người không phải chủ trì không bắt đầu được (MEET_002); nền tảng ngoài → MEET_010 (start và join)", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] });
    const denied = await startMeeting(api, m, w.u.D!);
    expect([denied.status, denied.body.error.code]).toEqual([403, "MEET_002"]);
    const ext = await createMeeting(api, w, w.u.C!, { platform: "ZOOM", externalUrl: "https://zoom.us/j/123456789" });
    const s = await startMeeting(api, ext, w.u.C!);
    expect(s.body.error.code).toBe("MEET_010");
    const j = await joinMeeting(api, ext.id, w.u.C!);
    expect([j.status, j.body.error.code]).toEqual([409, "MEET_010"]);
  });

  it("MR-03: ATTENDEE vào khi SCHEDULED trong cửa sổ → WAITING_FOR_HOST; host bắt đầu → meeting:started; gọi lại join → JOINED (vai MEMBER)", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] });
    const waiting = await joinMeeting(api, m.id, w.u.D!);
    expect(waiting.status).toBe(200);
    expect(waiting.body.data).toMatchObject({ state: "WAITING_FOR_HOST", meetingId: m.id, startAt: m.startAt });
    expect(new Date(waiting.body.data.joinOpensAt).getTime()).toBe(new Date(m.startAt).getTime() - 10 * 60_000);

    await startMeeting(api, m, w.u.C!);
    expect(h.eventsTo(w.u.D!, "meeting:started")).toHaveLength(1);
    const joined = await joinMeeting(api, m.id, w.u.D!);
    expect(joined.body.data).toMatchObject({ state: "JOINED", role: "MEMBER", publishPermissions: { audio: true, video: true, screen: true } });
    expect(await prisma.callParticipant.findFirst({ where: { callId: joined.body.data.callId, userId: w.u.D! } })).toMatchObject({ role: "MEMBER", state: "JOINING" });
  });

  it("chưa tới cửa sổ → MEET_012; ATTENDEE quá endAt mà chưa LIVE → MEET_006; cuộc họp ENDED/CANCELLED → MEET_009", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] }, 120);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.error.code).toBe("MEET_012");
    const past = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] });
    await prisma.meeting.update({ where: { id: past.id }, data: { endAt: new Date(Date.now() - 60_000) } });
    const late = await joinMeeting(api, past.id, w.u.D!);
    expect([late.status, late.body.error.code]).toEqual([409, "MEET_006"]);
    await prisma.meeting.update({ where: { id: past.id }, data: { status: "ENDED" } });
    expect((await joinMeeting(api, past.id, w.u.D!)).body.error.code).toBe("MEET_009");
  });

  it("vào lại cùng thiết bị → JOINED (token mới, không tạo participant thứ hai); thiết bị khác → CALL_004 sameCallOtherDevice; force → đá máy cũ", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] });
    await startMeeting(api, m, w.u.C!);
    const dev1 = deviceId();
    const first = await joinMeeting(api, m.id, w.u.D!, { deviceId: dev1 });
    const again = await joinMeeting(api, m.id, w.u.D!, { deviceId: dev1 });
    expect([first.body.data.state, again.body.data.state]).toEqual(["JOINED", "JOINED"]);
    expect(await prisma.callParticipant.count({ where: { callId: first.body.data.callId, userId: w.u.D! } })).toBe(1);

    const other = await joinMeeting(api, m.id, w.u.D!, { deviceId: deviceId() });
    expect([other.status, other.body.error.code, other.body.error.details.sameCallOtherDevice]).toEqual([409, "CALL_004", true]);
    const forced = await joinMeeting(api, m.id, w.u.D!, { deviceId: deviceId(), force: true });
    expect(forced.body.data.state).toBe("JOINED");
    expect(h.media.callsOf("removeParticipant").some((c) => c.args[1] === w.u.D)).toBe(true);
  });

  it("đang ở cuộc họp/cuộc gọi khác → 409 CALL_004 (activeCallId); force → rời phòng cũ rồi vào phòng mới", async () => {
    const m1 = await createMeeting(api, w, w.u.C!);
    const m2 = await createMeeting(api, w, w.u.D!, { attendeeIds: [w.u.C!] });
    const s1 = await startMeeting(api, m1, w.u.C!);
    await startMeeting(api, m2, w.u.D!);
    const busy = await joinMeeting(api, m2.id, w.u.C!);
    expect([busy.status, busy.body.error.code, busy.body.error.details.activeCallId]).toEqual([409, "CALL_004", s1.body.data.callId]);
    const moved = await joinMeeting(api, m2.id, w.u.C!, { force: true });
    expect(moved.body.data.state).toBe("JOINED");
    expect((await prisma.callParticipant.findFirst({ where: { callId: s1.body.data.callId, userId: w.u.C! } }))!.state).toBe("LEFT");
  });

  it("MR-10: phòng đầy → MEET_018 (người thứ N+1); hai người tranh chỗ cuối chỉ MỘT thắng; chủ trì/đồng chủ trì vào được kể cả khi đầy", async () => {
    h = installRoomHarness({ limits: limitsWith(3) });
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!, w.u.B!, w.u.A!], coHostIds: [w.u.A!] });
    await startMeeting(api, m, w.u.C!); // 1/3
    const race = await Promise.all([w.u.D!, w.u.E!, w.u.B!].map((uid) => joinMeeting(api, m.id, uid)));
    const ok = race.filter((r) => r.status === 200);
    const full = race.filter((r) => r.status === 409);
    expect([ok.length, full.length]).toEqual([2, 1]);
    expect(full[0]!.body.error.code).toBe("MEET_018");
    expect(await prisma.callParticipant.count({ where: { call: { scopeId: m.id } } })).toBe(3);
    const cohost = await joinMeeting(api, m.id, w.u.A!);
    expect(cohost.body.data).toMatchObject({ state: "JOINED", role: "CO_HOST" });
    expect(await prisma.callParticipant.count({ where: { call: { scopeId: m.id } } })).toBe(4);
  });

  it("GET /room: chủ trì thấy người tham gia (tên, vai, giơ tay từ LiveKit) và số người chờ; người chưa vào chỉ nhận trạng thái chung", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!] });
    const started = await startMeeting(api, m, w.u.C!);
    const d = await joinMeeting(api, m.id, w.u.D!);
    connectClient(h, started.body.data, w.u.C!);
    connectClient(h, d.body.data, w.u.D!);
    await h.media.updateParticipant(started.body.data.livekitRoom, w.u.D!, { attributes: { handRaisedAt: "2026-09-25T10:00:00.000Z" } });

    const host = await api("get", `/meetings/${m.id}/room`, w.u.C!);
    expect(host.status).toBe(200);
    expect(host.body.data).toMatchObject({ meetingId: m.id, callId: started.body.data.callId, status: "LIVE", myRole: "HOST", lobbyCount: 0, closingAt: null });
    expect(host.body.data.participants.map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([["Người C", "HOST"], ["Người D", "MEMBER"]]);
    expect(host.body.data.participants.find((p: { userId: string }) => p.userId === w.u.D).handRaisedAt).toBe("2026-09-25T10:00:00.000Z");

    const outsider = await api("get", `/meetings/${m.id}/room`, w.u.E!);
    expect(outsider.body.data).toMatchObject({ myRole: null, participants: [], lobbyCount: 0, status: "LIVE" });
    const before = await createMeeting(api, w, w.u.C!, {}, 60);
    expect((await api("get", `/meetings/${before.id}/room`, w.u.C!)).body.data).toMatchObject({ status: "SCHEDULED", callId: null, participants: [] });
  });

  it("leave: rời phòng idempotent (LEFT, nhả busy); end: chỉ chủ trì/đồng chủ trì, ENDED + Call ENDED + deleteRoom + meeting:ended + điểm danh xếp việc; end lần hai vẫn 200", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!] });
    const started = await startMeeting(api, m, w.u.C!);
    const callId = started.body.data.callId as string;
    await joinMeeting(api, m.id, w.u.D!);
    const notHost = await api("post", `/meetings/${m.id}/end`, w.u.D!, {});
    expect([notHost.status, notHost.body.error.code]).toEqual([403, "MEET_002"]);

    expect((await api("post", `/meetings/${m.id}/leave`, w.u.D!, {})).status).toBe(204);
    expect((await api("post", `/meetings/${m.id}/leave`, w.u.D!, {})).status).toBe(204);
    expect((await prisma.callParticipant.findFirst({ where: { callId, userId: w.u.D! } }))!.state).toBe("LEFT");

    const end = await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    expect(end.status).toBe(200);
    expect(end.body.data).toMatchObject({ status: "ENDED", endReason: "HOST_ENDED", myActions: { canEnd: false } });
    expect(await prisma.call.findUnique({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "HOST_ENDED", activeKey: `ended:${callId}` });
    expect(h.media.callsOf("deleteRoom").some((c) => c.args[0] === started.body.data.livekitRoom)).toBe(true);
    expect(h.emitted.some((e) => e.event === "meeting:ended" && e.to === `meet:${m.id}` && e.payload.reason === "HOST_ENDED")).toBe(true);
    expect(h.finalizes).toEqual([{ meetingId: m.id, callId }]);
    expect(await prisma.auditLog.count({ where: { action: "meeting.end", targetId: m.id } })).toBe(1);
    expect((await api("post", `/meetings/${m.id}/end`, w.u.C!, {})).status).toBe(200);
    expect((await joinMeeting(api, m.id, w.u.D!)).body.error.code).toBe("MEET_009");
    expect(await drainRoomOutbox(h)).toBeGreaterThan(0);
  });

  it("bắt đầu lại trong restartWindow tạo Call MỚI (phòng LiveKit mới), Meeting LIVE lại, giữ startedAt đầu; quá hạn → MEET_009", async () => {
    const m = await createMeeting(api, w, w.u.C!);
    const first = await startMeeting(api, m, w.u.C!);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    const detail = (await api("get", `/meetings/${m.id}`, w.u.C!)).body.data as { version: number; startedAt: string; myActions: { canStart: boolean } };
    expect(detail.myActions.canStart).toBe(true);

    const second = await startMeeting(api, { id: m.id, version: detail.version }, w.u.C!);
    expect(second.status).toBe(200);
    expect(second.body.data.callId).not.toBe(first.body.data.callId);
    expect(second.body.data.livekitRoom).not.toBe(first.body.data.livekitRoom);
    expect(second.body.data.livekitRoom.startsWith(first.body.data.livekitRoom)).toBe(true);
    const meeting = await prisma.meeting.findUnique({ where: { id: m.id } });
    expect(meeting).toMatchObject({ status: "LIVE", currentCallId: second.body.data.callId, endedAt: null });
    expect(meeting!.startedAt!.toISOString()).toBe(detail.startedAt);
    expect(await prisma.call.count({ where: { scopeId: m.id } })).toBe(2);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});

    const late = await createMeeting(api, w, w.u.C!);
    await prisma.meeting.update({ where: { id: late.id }, data: { status: "ENDED", endAt: new Date(Date.now() - 3 * 3_600_000), startAt: new Date(Date.now() - 4 * 3_600_000) } });
    const tooLate = await startMeeting(api, { id: late.id, version: 1 }, w.u.C!);
    expect([tooLate.status, tooLate.body.error.code]).toEqual([409, "MEET_009"]);
  });

  it("LiveKit lỗi tạm thời: createRoom thử lại (lỗi 1 lần vẫn bắt đầu được); lỗi liên tiếp → 502 MEDIA_003, KHÔNG để lại Call/LIVE nửa vời", async () => {
    const m = await createMeeting(api, w, w.u.C!);
    h.media.failNext("createRoom");
    const ok = await startMeeting(api, m, w.u.C!);
    expect(ok.status).toBe(200);
    expect(h.media.callsOf("createRoom").length).toBe(2);

    const m2 = await createMeeting(api, w, w.u.D!);
    const failing = jest.spyOn(h.media, "createRoom").mockRejectedValue(Object.assign(new Error("down"), { statusCode: 502, errorCode: "MEDIA_003" }));
    const res = await startMeeting(api, m2, w.u.D!);
    failing.mockRestore();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await prisma.call.count({ where: { scopeId: m2.id } })).toBe(0);
    expect((await prisma.meeting.findUnique({ where: { id: m2.id } }))!.status).toBe("SCHEDULED");
    const retry = await startMeeting(api, m2, w.u.D!); // khoá `call:active` đã được nhả
    expect(retry.status).toBe(200);
  });
});
