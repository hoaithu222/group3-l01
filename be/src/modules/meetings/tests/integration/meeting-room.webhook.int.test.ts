import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { cleanupRoomWorld, connectClient, createMeeting, drainRoomOutbox, ensureRoomIndexes, installRoomHarness, joinMeeting, lkEvent, startMeeting, type RoomHarness } from "./meeting-room-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("phòng họp — webhook LiveKit, việc nền, điểm danh (integration, Mongo memory replset)", () => {
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

  async function liveRoom(over: Record<string, unknown> = {}) {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!, w.u.B!], coHostIds: [w.u.B!], lobbyMode: "OFF", ...over });
    const s = await startMeeting(api, m, w.u.C!);
    const callId = s.body.data.callId as string;
    const room = s.body.data.livekitRoom as string;
    const joins: Record<string, { livekitRoom: string }> = { [w.u.C!]: s.body.data };
    for (const uid of [w.u.B!, w.u.D!, w.u.E!]) joins[uid] = (await joinMeeting(api, m.id, uid)).body.data;
    for (const [uid, j] of Object.entries(joins)) connectClient(h, j, uid);
    return { m, callId, room, joins };
  }

  const handle = (event: ReturnType<typeof lkEvent>) => h.container.room.webhook.handle(event);
  const part = (callId: string, uid: string) => prisma.callParticipant.findFirstOrThrow({ where: { callId, userId: uid } });
  const meetingOf = (id: string) => prisma.meeting.findUniqueOrThrow({ where: { id } });

  it("participant_joined: người có participant → ghi firstJoinedAt (một lần) + hẹn đối soát; identity lạ hoặc bị mời ra (token cũ) → đá khỏi phòng LiveKit", async () => {
    const { m, callId, room } = await liveRoom();
    expect(await handle(lkEvent("participant_joined", room, { identity: w.u.D! }))).toBe("PROCESSED");
    const first = (await prisma.meetingAttendee.findFirstOrThrow({ where: { meetingId: m.id, userId: w.u.D! } })).firstJoinedAt;
    expect(first).not.toBeNull();
    expect(h.reconciles.some((r) => r.callId === callId)).toBe(true);
    await handle(lkEvent("participant_joined", room, { identity: w.u.D! })); // sự kiện trùng: vô hại
    expect((await prisma.meetingAttendee.findFirstOrThrow({ where: { meetingId: m.id, userId: w.u.D! } })).firstJoinedAt).toEqual(first);

    // identity không thuộc phiên (token giả/cũ) → bị đá
    h.media.join(room, { identity: w.u.G! });
    expect(await handle(lkEvent("participant_joined", room, { identity: w.u.G! }))).toBe("PROCESSED");
    expect(h.media.callsOf("removeParticipant").some((c) => c.args[1] === w.u.G)).toBe(true);
    expect((await h.media.listParticipants(room)).some((p) => p.identity === w.u.G)).toBe(false);

    // bị mời ra rồi dùng token cũ kết nối lại → bị đá (MR-14/MR-06: token cũ không vào lại được phòng)
    await api("post", `/meetings/${m.id}/participants/${w.u.E}/remove`, w.u.C!, {});
    h.media.join(room, { identity: w.u.E! });
    await handle(lkEvent("participant_joined", room, { identity: w.u.E! }));
    expect((await h.media.listParticipants(room)).some((p) => p.identity === w.u.E)).toBe(false);
    expect((await part(callId, w.u.E!)).state).toBe("REMOVED");
  });

  it("participant_left: người thường → chỉ hẹn đối soát + nhả slot chia sẻ; chủ trì/đồng chủ trì cuối cùng mất kết nối (không /leave) → hẹn host-grace 30 s", async () => {
    const { m, callId, room } = await liveRoom();
    await h.calls.reconcile.reconcile(callId); // mọi người CONNECTED
    h.media.leave(room, w.u.D!);
    expect(await handle(lkEvent("participant_left", room, { identity: w.u.D! }))).toBe("PROCESSED");
    expect(h.graces).toEqual([]);
    await h.calls.reconcile.reconcile(callId);
    expect((await part(callId, w.u.D!)).state).toBe("LEFT");

    // C rồi B mất mạng SÁT NHAU (DB chưa kịp đối soát): C rớt trước còn B → chưa hẹn; B rớt sau, hết chủ trì, còn E → hẹn
    h.media.leave(room, w.u.C!);
    await handle(lkEvent("participant_left", room, { identity: w.u.C! }));
    expect(h.graces).toEqual([]);
    h.media.leave(room, w.u.B!);
    await handle(lkEvent("participant_left", room, { identity: w.u.B! }));
    expect(h.graces).toEqual([{ meetingId: m.id, callId, delayMs: 30_000 }]);
  });

  it("MR-09: người thứ hai chia sẻ màn hình bị chặn Ở SERVER (track bị mute + SCREEN_SHARE_REJECTED); người đầu dừng chia sẻ thì nhả slot cho người sau", async () => {
    const { callId, room } = await liveRoom();
    h.media.join(room, { identity: w.u.D!, tracks: [{ sid: "share-D", source: "SCREEN_SHARE", kind: "VIDEO", muted: false }] });
    h.media.join(room, { identity: w.u.E!, tracks: [{ sid: "share-E", source: "SCREEN_SHARE", kind: "VIDEO", muted: false }] });
    expect(await handle(lkEvent("track_published", room, { identity: w.u.D!, track: { sid: "share-D", source: "SCREEN_SHARE" } }))).toBe("PROCESSED");
    expect(await h.calls.deps.store.peekScreen(callId)).toBe(w.u.D);
    await handle(lkEvent("track_published", room, { identity: w.u.E!, track: { sid: "share-E", source: "SCREEN_SHARE" } }));
    const tracksOf = async (uid: string) => (await h.media.listParticipants(room)).find((p) => p.identity === uid)!.tracks;
    expect((await tracksOf(w.u.E!))[0]!.muted).toBe(true);
    expect((await tracksOf(w.u.D!))[0]!.muted).toBe(false);
    expect(h.eventsTo(w.u.E!, "call:host-action").map((e) => e.payload)).toEqual([expect.objectContaining({ type: "SCREEN_SHARE_REJECTED", targetUserId: w.u.E })]);
    expect(await h.calls.deps.store.peekScreen(callId)).toBe(w.u.D); // slot vẫn của D

    await handle(lkEvent("track_unpublished", room, { identity: w.u.D!, track: { sid: "share-D", source: "SCREEN_SHARE" } }));
    expect(await h.calls.deps.store.peekScreen(callId)).toBeNull();
    expect(await handle(lkEvent("track_published", room, { identity: w.u.E!, track: { sid: "share-E", source: "SCREEN_SHARE" } }))).toBe("PROCESSED");
    expect(await h.calls.deps.store.peekScreen(callId)).toBe(w.u.E);
    // nguồn khác (camera/mic) không đụng tới slot
    expect(await handle(lkEvent("track_published", room, { identity: w.u.D!, track: { sid: "cam-D", source: "CAMERA" } }))).toBe("IGNORED");
  });

  it("sự kiện của phiên CŨ (phòng đã đóng), của phòng không phải họp và của cuộc họp không còn LIVE bị bỏ qua", async () => {
    const { m, callId, room } = await liveRoom();
    expect(await handle(lkEvent("participant_joined", "meet_zzzzzzzzzz", { identity: w.u.D! }))).toBe("IGNORED"); // mã họp lạ
    expect(await handle(lkEvent("participant_joined", `call_${callId}`, { identity: w.u.D! }))).toBe("IGNORED"); // phòng gọi (calls lo)
    expect(await handle(lkEvent("participant_joined", `${room}_stale123`, { identity: w.u.D! }))).toBe("IGNORED"); // hậu tố phiên khác
    expect(await handle(lkEvent("egress_started", room))).toBe("IGNORED");
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    expect(await handle(lkEvent("room_finished", room))).toBe("IGNORED");
    expect(await handle(lkEvent("participant_joined", room, { identity: w.u.D! }))).toBe("IGNORED"); // Call đã ENDED
  });

  it("MR-12: room_finished (phòng trống quá emptyTimeout) → cuộc họp ENDED/EMPTY, Call ENDED, meeting:ended, điểm danh xếp việc, phòng chờ dọn; lặp lại → IGNORED", async () => {
    const { m, callId, room } = await liveRoom({ visibility: "WORKSPACE" });
    await h.roomRedis.hsetNx(`meet:lobby:${m.id}`, w.u.A!, JSON.stringify({ userId: w.u.A, displayName: "A", requestedAt: new Date().toISOString(), deviceId: "d" }), 60);
    expect(await handle(lkEvent("room_finished", room))).toBe("PROCESSED");
    expect(await meetingOf(m.id)).toMatchObject({ status: "ENDED", endReason: "EMPTY" });
    expect((await meetingOf(m.id)).endedAt).not.toBeNull();
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "EMPTY" });
    expect(h.emitted.some((e) => e.event === "meeting:ended" && e.to === `call:${callId}` && e.payload.reason === "EMPTY")).toBe(true);
    expect(h.finalizes).toEqual([{ meetingId: m.id, callId }]);
    expect(await h.roomRedis.hgetall(`meet:lobby:${m.id}`)).toEqual({});
    expect((await prisma.meetingAttendee.findMany({ where: { meetingId: m.id } })).every((a) => a.meetingStatus === "ENDED")).toBe(true);
    expect(await prisma.auditLog.findFirst({ where: { action: "meeting.end-system", targetId: m.id } })).toMatchObject({ metadata: expect.objectContaining({ reason: "EMPTY", system: true }) });
    expect(await handle(lkEvent("room_finished", room))).toBe("IGNORED");
  });

  it("Call bị kết thúc từ nơi khác (calls thu hồi/admin): room_finished lấy lý do của Call (ARCHIVED → WORKSPACE_ARCHIVED, FORCE_ENDED → FORCE_ENDED)", async () => {
    const a = await liveRoom();
    await h.calls.ends.endCall(a.callId, "ARCHIVED", null);
    await handle(lkEvent("room_finished", a.room));
    expect((await meetingOf(a.m.id)).endReason).toBe("WORKSPACE_ARCHIVED");
  });

  it("MR-13: tự đóng — WARN báo closingAt (socket + snapshot + join của người vào sau), CLOSE trước hạn thì hẹn lại, tới hạn thì kết thúc MAX_DURATION; job của phiên cũ bị bỏ qua", async () => {
    const { m, callId } = await liveRoom();
    const maintenance = h.container.room.maintenance;
    const closers = await prisma.outboxEvent.findMany({ where: { aggregateId: m.id, type: "meeting.auto-close" } });
    expect(closers).toHaveLength(2);

    expect(await maintenance.autoClose({ meetingId: m.id, callId, phase: "WARN" })).toBe("WARNED");
    const closeAt = (await h.roomRedis.get(`meet:closing:${callId}`))!;
    expect(new Date(closeAt).getTime()).toBeGreaterThan(Date.now() + 100 * 60_000);
    expect(h.emitted.some((e) => e.target === "room" && e.to === `meet:${m.id}` && e.event === "meeting:updated" && e.payload.closingAt === closeAt)).toBe(true);
    expect((await api("get", `/meetings/${m.id}/room`, w.u.C!)).body.data.closingAt).toBe(closeAt);
    await api("post", `/meetings/${m.id}/leave`, w.u.D!, {});
    expect((await joinMeeting(api, m.id, w.u.D!)).body.data.closingAt).toBe(closeAt);

    expect(await maintenance.autoClose({ meetingId: m.id, callId, phase: "CLOSE" })).toBe("RESCHEDULED"); // còn xa: giờ đóng đã dời
    expect((await meetingOf(m.id)).status).toBe("LIVE");
    expect(await maintenance.autoClose({ meetingId: m.id, callId: "000000000000000000000000", phase: "CLOSE" })).toBe("SKIPPED"); // phiên khác

    h.clock.advanceMinutes(126);
    expect(await maintenance.autoClose({ meetingId: m.id, callId, phase: "CLOSE" })).toBe("CLOSED");
    expect(await meetingOf(m.id)).toMatchObject({ status: "ENDED", endReason: "MAX_DURATION" });
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "MAX_DURATION" });
    expect(await maintenance.autoClose({ meetingId: m.id, callId, phase: "CLOSE" })).toBe("SKIPPED"); // đã kết thúc: idempotent
  });

  it("gia hạn endAt khi đang họp: job CLOSE cũ hẹn lại theo giờ mới thay vì đóng sớm (PATCH endAt → autoClose RESCHEDULED)", async () => {
    const { m, callId } = await liveRoom();
    h.clock.advanceMinutes(126); // tới hạn theo endAt cũ
    const detail = (await api("get", `/meetings/${m.id}`, w.u.C!)).body.data as { version: number };
    const extended = new Date(h.clock.now().getTime() + 90 * 60_000).toISOString();
    await prisma.meeting.update({ where: { id: m.id }, data: { endAt: new Date(extended), version: detail.version + 1 } });
    const before = await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.auto-close" } });
    expect(await h.container.room.maintenance.autoClose({ meetingId: m.id, callId, phase: "CLOSE" })).toBe("RESCHEDULED");
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.auto-close" } })).toBeGreaterThan(before);
    expect((await meetingOf(m.id)).status).toBe("LIVE");
  });

  it("MR-19: điểm danh — attendedSeconds = tổng giây CONNECTED qua mọi phiên (ghi đè, không cộng dồn) nên chạy lại vẫn đúng; người chưa vào = 0", async () => {
    const { m, callId } = await liveRoom({ attendeeIds: [w.u.D!, w.u.E!, w.u.B!, w.u.A!] });
    await h.calls.reconcile.reconcile(callId); // webhook participant_joined → CONNECTED (lastJoinedAt = bây giờ)
    h.clock.advanceMinutes(3);
    await api("post", `/meetings/${m.id}/leave`, w.u.D!, {});
    h.clock.advanceMinutes(7);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});

    const maintenance = h.container.room.maintenance;
    const changed = await maintenance.finalizeAttendance(m.id);
    expect(changed).toBeGreaterThan(0);
    const secondsOf = async (uid: string) => (await prisma.meetingAttendee.findFirstOrThrow({ where: { meetingId: m.id, userId: uid } })).attendedSeconds;
    expect(await secondsOf(w.u.D!)).toBeGreaterThanOrEqual(180);
    expect(await secondsOf(w.u.D!)).toBeLessThan(185);
    expect(await secondsOf(w.u.C!)).toBeGreaterThanOrEqual(600);
    expect(await secondsOf(w.u.C!)).toBeLessThan(605);
    expect(await secondsOf(w.u.A!)).toBe(0);
    expect(await maintenance.finalizeAttendance(m.id)).toBe(0); // idempotent: không đổi gì

    // phiên thứ hai (bắt đầu lại) cộng vào tổng — vẫn ghi đè từ nguồn sự thật
    const detail = (await api("get", `/meetings/${m.id}`, w.u.C!)).body.data as { version: number };
    const again = await startMeeting(api, { id: m.id, version: detail.version }, w.u.C!);
    connectClient(h, again.body.data, w.u.C!);
    await h.calls.reconcile.reconcile(again.body.data.callId);
    h.clock.advanceMinutes(2);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    await maintenance.finalizeAttendance(m.id);
    expect(await secondsOf(w.u.C!)).toBeGreaterThanOrEqual(720);
    expect(await secondsOf(w.u.C!)).toBeLessThan(730);
    await maintenance.finalizeAttendance(m.id);
    expect(await secondsOf(w.u.C!)).toBeLessThan(730);
  });

  it("workspace lưu trữ → mọi cuộc họp ĐANG DIỄN RA kết thúc (WORKSPACE_ARCHIVED, Call ARCHIVED); cuộc họp SCHEDULED không bị đụng; lặp lại → 0", async () => {
    const { m, callId } = await liveRoom();
    const scheduled = await createMeeting(api, w, w.u.D!, {}, 60);
    expect(await h.container.room.maintenance.endWorkspaceRooms(w.workspaceId)).toBe(1);
    expect(await meetingOf(m.id)).toMatchObject({ status: "ENDED", endReason: "WORKSPACE_ARCHIVED" });
    expect(await prisma.call.findUniqueOrThrow({ where: { id: callId } })).toMatchObject({ status: "ENDED", endReason: "ARCHIVED" });
    expect((await meetingOf(scheduled.id)).status).toBe("SCHEDULED");
    expect(await h.container.room.maintenance.endWorkspaceRooms(w.workspaceId)).toBe(0);
  });

  it("cron room-reconcile: cuộc họp LIVE mà Call đã kết thúc từ nơi khác → kết thúc theo lý do của Call; quá giờ đóng + 60 s mà job mất → MAX_DURATION; cuộc họp LIVE không có Call → EMPTY", async () => {
    const a = await liveRoom();
    await h.calls.ends.endCall(a.callId, "FORCE_ENDED", null); // như admin p2-07 / calls thu hồi: Call ENDED, Meeting vẫn LIVE
    expect((await meetingOf(a.m.id)).status).toBe("LIVE");

    const legacy = await createMeeting(api, w, w.u.D!, {}, 5); // LIVE nhưng chưa từng có Call (dữ liệu p2-04 cũ)
    await prisma.meeting.update({ where: { id: legacy.id }, data: { status: "LIVE", startedAt: new Date() } });

    const result = await h.container.room.maintenance.reconcileLive();
    expect(result.ended).toBeGreaterThanOrEqual(2);
    expect(await meetingOf(a.m.id)).toMatchObject({ status: "ENDED", endReason: "FORCE_ENDED" });
    expect(await meetingOf(legacy.id)).toMatchObject({ status: "ENDED", endReason: "EMPTY" });
    expect(await h.container.room.maintenance.reconcileLive()).toMatchObject({ ended: 0 }); // idempotent

    // quá hạn tự đóng mà job hẹn giờ bị mất
    const late = await createMeeting(api, w, w.u.E!, {}, 5);
    const started = await startMeeting(api, late, w.u.E!);
    h.clock.advanceMinutes(200);
    const lateResult = await h.container.room.maintenance.reconcileLive();
    expect(lateResult.ended).toBe(1);
    expect(await meetingOf(late.id)).toMatchObject({ status: "ENDED", endReason: "MAX_DURATION" });
    expect(started.body.data.callId).toBeTruthy();
    expect(await drainRoomOutbox(h)).toBeGreaterThan(0);
  });
});
