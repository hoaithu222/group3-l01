import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { connectClient, createMeeting, drainRoomOutbox, ensureRoomIndexes, joinMeeting } from "./meeting-room-test-kit";
import { cleanupRecapWorld, egressEvent, ensureRecapIndexes, installRecordingHarness, latestRecording, liveRoom, type RecordingHarness } from "./recap-recording-test-kit";
import { decodeJwtPayload } from "../../../../infrastructure/media/tests/livekit-test-utils";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("ghi hình họp — đồng ý, bắt đầu, người vào sau, dừng (integration, Mongo memory replset, LiveKit giả)", () => {
  const worlds: World[] = [];
  let h: RecordingHarness;
  let w: World;

  beforeAll(async () => {
    await ensureRoomIndexes();
    await ensureRecapIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installRecordingHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupRecapWorld(worlds.splice(0));
    redisStore.clear();
  });

  const consentRequest = (meetingId: string, uid: string) => api("post", `/meetings/${meetingId}/recordings/consent-request`, uid, {});
  const consent = (meetingId: string, uid: string, body: Record<string, unknown>) => api("post", `/meetings/${meetingId}/recordings/consent`, uid, body);
  const start = (meetingId: string, uid: string, requestId: string, layout?: string) => api("post", `/meetings/${meetingId}/recordings`, uid, { requestId, ...(layout ? { layout } : {}) });
  const roomEvents = (callId: string, state?: string) => h.emitted.filter((e) => e.target === "room" && e.to === `call:${callId}` && e.event === "call:recording" && (!state || e.payload.state === state));

  /** Chủ trì C hỏi ý kiến, B/D/E đồng ý → trả `requestId` (A chưa vào phòng nên không tính). */
  async function allConsent(meetingId: string): Promise<string> {
    const req = await consentRequest(meetingId, w.u.C!);
    const requestId = req.body.data.requestId as string;
    for (const uid of [w.u.B!, w.u.D!, w.u.E!]) expect((await consent(meetingId, uid, { requestId, accept: true })).status).toBe(200);
    return requestId;
  }

  async function recording(over: Record<string, unknown> = {}) {
    const room = await liveRoom(h, api, w, over);
    const requestId = await allConsent(room.m.id);
    const res = await start(room.m.id, w.u.C!, requestId);
    expect(res.status).toBe(201);
    return { ...room, requestId, rec: res.body.data as { id: string; status: string } };
  }

  it("RR-07: yêu cầu đồng ý → tiến độ chỉ SỐ LƯỢNG (không tên) → thiếu/từ chối thì 409 REC_001 kèm số → đủ người thì 201 STARTING, đúng một egress RoomComposite GRID vào S3, snapshot đồng ý, audit, hẹn giờ dừng", async () => {
    const { m, callId, room } = await liveRoom(h, api, w);
    const denied = await consentRequest(m.id, w.u.D!);
    expect([denied.status, denied.body.error.code]).toEqual([403, "MEET_002"]);
    expect((await consentRequest(m.id, w.u.X!)).status).toBe(404);

    const req = await consentRequest(m.id, w.u.C!);
    expect(req.status).toBe(200);
    expect(req.body.data).toMatchObject({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), pendingCount: 3 }); // B, D, E chưa trả lời; C tự đồng ý
    const requestId = req.body.data.requestId as string;
    expect(roomEvents(callId, "CONSENT_REQUESTED")).toHaveLength(1);
    expect(roomEvents(callId, "CONSENT_REQUESTED")[0]!.payload).toMatchObject({ meetingId: m.id, requestId, requestedBy: w.u.C, acceptedCount: 1, pendingCount: 3, declinedCount: 0 });
    expect(JSON.stringify(roomEvents(callId))).not.toContain(w.u.D!); // không lộ tên/id người trả lời

    const status0 = await api("get", `/meetings/${m.id}/recordings/consent-status`, w.u.C!);
    expect(status0.body.data).toMatchObject({ requestId, connectedCount: 4, acceptedCount: 1, declinedCount: 0, pendingCount: 3, ready: false });
    expect((await api("get", `/meetings/${m.id}/recordings/consent-status`, w.u.D!)).status).toBe(403);

    const early = await start(m.id, w.u.C!, requestId);
    expect([early.status, early.body.error.code, early.body.error.details]).toEqual([409, "REC_001", { pendingCount: 3, declinedCount: 0 }]);

    await consent(m.id, w.u.D!, { requestId, accept: true });
    await consent(m.id, w.u.E!, { requestId, accept: false });
    await consent(m.id, w.u.B!, { requestId, accept: true });
    expect(roomEvents(callId, "CONSENT_PROGRESS").at(-1)!.payload).toMatchObject({ acceptedCount: 3, pendingCount: 0, declinedCount: 1 });
    const declined = await start(m.id, w.u.C!, requestId);
    expect([declined.status, declined.body.error.details]).toEqual([409, { pendingCount: 0, declinedCount: 1 }]); // từ chối chặn tới khi đổi ý/rời
    await consent(m.id, w.u.E!, { requestId, accept: true }); // đổi ý
    expect((await api("get", `/meetings/${m.id}/recordings/consent-status`, w.u.B!)).body.data).toMatchObject({ acceptedCount: 4, ready: true });

    const res = await start(m.id, w.u.B!, requestId); // đồng chủ trì bắt đầu
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "STARTING", layout: "GRID", startedBy: w.u.B, consentCount: 4, myActions: { canStop: true, canDelete: false } });
    const row = await latestRecording(m.id);
    expect(row).toMatchObject({ status: "STARTING", callId, requestId, workspaceId: w.workspaceId, egressId: expect.stringMatching(/^EG_/) });
    expect(row.storageKey).toBe(`recordings/${w.workspaceId}/${m.id}/${row.id}.mp4`);
    expect(row.consentSnapshot.map((c) => c.userId).sort()).toEqual([w.u.B, w.u.C, w.u.D, w.u.E].sort());
    expect(row.consentSnapshot.every((c) => c.lateJoin === false)).toBe(true);
    const egress = h.media.callsOf("startRoomCompositeEgress");
    expect(egress).toHaveLength(1);
    expect(egress[0]!.args).toEqual([room, { fileOutput: { filepath: row.storageKey }, layout: "grid", preset: "H264_720P_30" }]);
    expect(roomEvents(callId, "STARTING")).toHaveLength(1);
    expect(await prisma.auditLog.findFirst({ where: { action: "recording.start", targetId: row.id } })).toMatchObject({ actorId: w.u.B, targetType: "MeetingRecording" });
    const stopJob = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "recording.stop-on-end", aggregateId: row.id } });
    expect(stopJob.availableAt.getTime()).toBeGreaterThan(h.clock.now().getTime() + 79 * 60_000);

    const again = await consentRequest(m.id, w.u.C!);
    expect([again.status, again.body.error.code]).toEqual([409, "REC_002"]); // đang ghi → không hỏi lại
  });

  it("RR-08: hai chủ trì bấm bắt đầu cùng lúc → MỘT bản ghi + MỘT egress, người kia nhận 409 REC_002", async () => {
    const { m } = await liveRoom(h, api, w);
    const requestId = await allConsent(m.id);
    const [a, b] = await Promise.all([start(m.id, w.u.C!, requestId), start(m.id, w.u.B!, requestId)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).body.error.code).toBe("REC_002");
    expect(await prisma.meetingRecording.count({ where: { meetingId: m.id } })).toBe(1);
    expect(h.media.callsOf("startRoomCompositeEgress")).toHaveLength(1);
  });

  it("RR-09: yêu cầu đồng ý quá 120 giây → REC_008 (bắt đầu, trả lời, xem tiến độ); hỏi lại được và yêu cầu mới thay yêu cầu cũ", async () => {
    const { m } = await liveRoom(h, api, w);
    const req = await consentRequest(m.id, w.u.C!);
    const requestId = req.body.data.requestId as string;
    h.clock.advanceSeconds(121);
    const late = await start(m.id, w.u.C!, requestId);
    expect([late.status, late.body.error.code]).toEqual([409, "REC_008"]);
    expect((await consent(m.id, w.u.D!, { requestId, accept: true })).body.error.code).toBe("REC_008");
    expect((await api("get", `/meetings/${m.id}/recordings/consent-status`, w.u.C!)).body.error.code).toBe("REC_008");

    const again = await consentRequest(m.id, w.u.C!);
    const second = again.body.data.requestId as string;
    expect(second).not.toBe(requestId);
    const stale = await consent(m.id, w.u.D!, { requestId, accept: true }); // trả lời yêu cầu CŨ
    expect([stale.status, stale.body.error.code]).toEqual([409, "REC_008"]);
    expect((await consent(m.id, w.u.D!, { accept: true })).body.error.code).toBe("REC_008"); // không requestId và chưa ghi → không có gì để đồng ý
    expect((await consent(m.id, w.u.X!, { requestId: second, accept: true })).status).toBe(404);
  });

  it("RR-10/RR-19: người vào SAU khi đang ghi nhận token KHÔNG có quyền phát + trạng thái ghi hình; đồng ý → được cấp quyền (DB + LiveKit) và có trong snapshot; từ chối → chỉ nghe/xem; vào lại giữ lựa chọn", async () => {
    const { m, callId, room, rec } = await recording();
    await h.container.recapRecording.egress.handle(egressEvent("egress_started", room, { egressId: (await latestRecording(m.id)).egressId! }));
    expect((await latestRecording(m.id)).status).toBe("RECORDING");
    expect(roomEvents(callId, "RECORDING")).toHaveLength(1);

    const join = await joinMeeting(api, m.id, w.u.A!);
    expect(join.status).toBe(200);
    expect(join.body.data).toMatchObject({ state: "JOINED", publishPermissions: { audio: false, video: false, screen: false }, recording: { status: "RECORDING", consentRequired: true, recordingId: rec.id, startedBy: w.u.C } });
    const grants = decodeJwtPayload(join.body.data.token as string).video as Record<string, unknown>;
    expect(grants.canPublish).toBe(false); // token không có quyền phát
    expect(grants.canSubscribe).toBe(true);
    connectClient(h, join.body.data, w.u.A!);
    await h.calls.reconcile.reconcile(callId);

    const snap = await api("get", `/meetings/${m.id}/room`, w.u.A!);
    expect(snap.body.data.recording).toMatchObject({ status: "RECORDING", consentRequired: true });
    const declined = await consent(m.id, w.u.A!, { accept: false });
    expect(declined.body.data).toEqual({ accepted: false, canPublish: false });
    expect((await prisma.callParticipant.findFirstOrThrow({ where: { callId, userId: w.u.A! } })).publishPermissions).toMatchObject({ audio: false, video: false, screen: false });
    expect((await latestRecording(m.id)).consentSnapshot.some((c) => c.userId === w.u.A)).toBe(false);

    const accepted = await consent(m.id, w.u.A!, { accept: true });
    expect(accepted.body.data).toEqual({ accepted: true, canPublish: true });
    expect((await prisma.callParticipant.findFirstOrThrow({ where: { callId, userId: w.u.A! } })).publishPermissions).toMatchObject({ audio: true, video: true, screen: true });
    const update = h.media.callsOf("updateParticipant").filter((c) => c.args[1] === w.u.A).at(-1)!;
    expect(update.args[2]).toMatchObject({ permission: { canPublish: true, canSubscribe: true, canPublishSources: ["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"] } });
    const entry = (await latestRecording(m.id)).consentSnapshot.find((c) => c.userId === w.u.A);
    expect(entry).toMatchObject({ lateJoin: true });
    expect((await api("get", `/meetings/${m.id}/room`, w.u.A!)).body.data.recording).toMatchObject({ consentRequired: false });
    expect((await consent(m.id, w.u.A!, { accept: true })).body.data.canPublish).toBe(true); // idempotent
    expect((await latestRecording(m.id)).consentSnapshot.filter((c) => c.userId === w.u.A)).toHaveLength(1);

    // rời rồi vào lại khi vẫn đang ghi: đã đồng ý nên vẫn được phát
    await api("post", `/meetings/${m.id}/leave`, w.u.A!, {});
    const back = await joinMeeting(api, m.id, w.u.A!);
    expect(back.body.data).toMatchObject({ publishPermissions: { audio: true, video: true, screen: true }, recording: { consentRequired: false } });
  });

  it("người vào sau TỪ CHỐI đồng ý: khi bản ghi dừng (egress COMPLETE → PROCESSING) được MỞ LẠI quyền phát (DB + LiveKit đủ trường); người đã đồng ý không bị đụng", async () => {
    const { m, callId, room } = await recording();
    const egressId = (await latestRecording(m.id)).egressId!;
    await h.container.recapRecording.egress.handle(egressEvent("egress_started", room, { egressId }));
    const join = await joinMeeting(api, m.id, w.u.A!);
    connectClient(h, join.body.data, w.u.A!);
    await h.calls.reconcile.reconcile(callId);
    expect((await consent(m.id, w.u.A!, { accept: false })).body.data).toEqual({ accepted: false, canPublish: false });
    const before = h.media.callsOf("updateParticipant").length;

    await h.container.recapRecording.egress.handle(egressEvent("egress_ended", room, { egressId, status: "COMPLETE", endedAt: new Date().toISOString(), files: [{ filename: "a.mp4", location: "s3://b/a.mp4", sizeBytes: 900_000, durationSeconds: 60 }] }));
    expect((await latestRecording(m.id)).status).toBe("PROCESSING");
    expect((await prisma.callParticipant.findFirstOrThrow({ where: { callId, userId: w.u.A! } })).publishPermissions).toMatchObject({ audio: true, video: true, screen: true });
    const updates = h.media.callsOf("updateParticipant").slice(before);
    expect(updates.map((c) => c.args[1])).toEqual([w.u.A]); // chỉ người bị khoá vì ghi hình
    expect(updates[0]!.args[2]).toEqual({ permission: { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: ["MICROPHONE", "CAMERA", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"], canUpdateMetadata: true } });
  });

  it("vào phòng trong lúc chủ trì đang hỏi ý kiến → nhận CONSENT_REQUESTED để hiện hộp thoại; người ngoài phòng không trả lời được (404 MEET_020)", async () => {
    const { m } = await liveRoom(h, api, w);
    const req = await consentRequest(m.id, w.u.C!);
    const requestId = req.body.data.requestId as string;
    expect((await consent(m.id, w.u.A!, { requestId, accept: true })).body.error.code).toBe("MEET_020"); // A chưa vào phòng
    const join = await joinMeeting(api, m.id, w.u.A!);
    expect(join.body.data.recording).toMatchObject({ status: "CONSENT_REQUESTED", consentRequired: true, requestId, startedBy: w.u.C });
    connectClient(h, join.body.data, w.u.A!);
    await consent(m.id, w.u.A!, { requestId, accept: true });
    expect((await api("get", `/meetings/${m.id}/room`, w.u.A!)).body.data.recording).toMatchObject({ status: "CONSENT_REQUESTED", consentRequired: false });
    // A vừa vào nên trở thành người phải đồng ý trước khi bắt đầu (B, D, E chưa trả lời)
    expect((await api("get", `/meetings/${m.id}/recordings/consent-status`, w.u.C!)).body.data).toMatchObject({ connectedCount: 5, pendingCount: 3 });
  });

  it("điều kiện: cuộc họp không cho ghi hình → 403 REC_006; đã kết thúc hoặc chưa LIVE → 409 REC_007", async () => {
    const off = await liveRoom(h, api, w, { recordingAllowed: false });
    expect((await consentRequest(off.m.id, w.u.C!)).body.error.code).toBe("REC_006");
    await api("post", `/meetings/${off.m.id}/end`, w.u.C!, {});
    const ended = await consentRequest(off.m.id, w.u.C!);
    expect([ended.status, ended.body.error.code]).toEqual([409, "REC_007"]);
    const scheduled = await createMeeting(api, w, w.u.C!);
    expect((await consentRequest(scheduled.id, w.u.C!)).body.error.code).toBe("REC_007");
  });

  it("REC_009/REC_006 do hạ tầng và cờ hệ thống; REC_003 khi hết slot egress toàn hệ thống", async () => {
    const { m } = await liveRoom(h, api, w);
    h.capability.isAvailable = false;
    expect((await consentRequest(m.id, w.u.C!)).body.error).toMatchObject({ code: "REC_009" });
    h.capability.isAvailable = true;
    h.capability.isEnabled = false;
    expect((await consentRequest(m.id, w.u.C!)).body.error).toMatchObject({ code: "REC_006" });
    h.capability.isEnabled = true;
    h.limits.concurrentMax = 0;
    const full = await consentRequest(m.id, w.u.C!);
    expect([full.status, full.body.error.code]).toEqual([503, "REC_003"]);
    h.limits.concurrentMax = 1;
    expect((await consentRequest(m.id, w.u.C!)).status).toBe(200);
  });

  it("egress không khởi động được → bản ghi FAILED + call:recording FAILED + 503 REC_003; hỏi lại và ghi được sau đó", async () => {
    const { m, callId } = await liveRoom(h, api, w);
    const requestId = await allConsent(m.id);
    h.media.failNext("startRoomCompositeEgress");
    const res = await start(m.id, w.u.C!, requestId);
    expect([res.status, res.body.error.code]).toEqual([503, "REC_003"]);
    expect(await latestRecording(m.id)).toMatchObject({ status: "FAILED", error: expect.any(String), stopReason: "EGRESS_FAILED", egressId: null });
    expect((await latestRecording(m.id)).retentionExpiresAt).not.toBeNull();
    expect(roomEvents(callId, "FAILED")).toHaveLength(1);
    const retry = await allConsent(m.id);
    expect((await start(m.id, w.u.C!, retry)).status).toBe(201);
  });

  it("dừng: chủ trì/đồng chủ trì dừng (STOPPING, egress dừng đúng một lần, audit), lặp lại idempotent; người thường 403; bản ghi chưa có egress → 409 REC_004", async () => {
    const { m, callId, rec } = await recording();
    expect((await api("post", `/recordings/${rec.id}/stop`, w.u.E!)).body.error.code).toBe("MEET_002");
    expect((await api("post", `/recordings/${rec.id}/stop`, w.u.X!)).status).toBe(404);
    await prisma.meetingRecording.update({ where: { id: rec.id }, data: { egressId: null } });
    expect((await api("post", `/recordings/${rec.id}/stop`, w.u.C!)).body.error.code).toBe("REC_004");
    const egressId = "EG_test_1";
    await prisma.meetingRecording.update({ where: { id: rec.id }, data: { egressId } });

    const stop = await api("post", `/recordings/${rec.id}/stop`, w.u.B!);
    expect(stop.status).toBe(200);
    expect(stop.body.data).toMatchObject({ status: "STOPPING", stopReason: "HOST_STOPPED", myActions: { canStop: false } });
    expect(roomEvents(callId, "STOPPING")).toHaveLength(1);
    expect(h.media.callsOf("stopEgress")).toEqual([{ op: "stopEgress", args: [egressId] }]);
    expect((await api("post", `/recordings/${rec.id}/stop`, w.u.C!)).body.data.status).toBe("STOPPING"); // idempotent
    expect(h.media.callsOf("stopEgress")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "recording.stop", targetId: rec.id } })).toBe(1);
    expect((await latestRecording(m.id)).stoppedBy).toBe(w.u.B);
  });

  it("RR-14: kết thúc họp khi đang ghi → dừng egress (MEETING_ENDED), bản ghi đi tiếp PROCESSING; sự kiện lặp không dừng lần hai", async () => {
    const { m, room, rec } = await recording();
    const egressId = (await latestRecording(m.id)).egressId!;
    await h.container.recapRecording.egress.handle(egressEvent("egress_started", room, { egressId }));
    expect((await api("post", `/meetings/${m.id}/end`, w.u.C!, {})).status).toBe(200);
    await drainRoomOutbox(h);
    expect(await latestRecording(m.id)).toMatchObject({ status: "STOPPING", stopReason: "MEETING_ENDED", stoppedBy: null });
    expect(h.media.callsOf("stopEgress")).toEqual([{ op: "stopEgress", args: [egressId] }]);
    const result = await h.container.recapRecording.recording.stopBySystem({ meetingId: m.id }, "MEETING_ENDED");
    expect(result).toBeNull(); // không còn gì đang chạy
    expect(h.media.callsOf("stopEgress")).toHaveLength(1);

    await h.container.recapRecording.egress.handle(egressEvent("egress_ended", room, { egressId, status: "COMPLETE", endedAt: new Date().toISOString(), files: [{ filename: "a.mp4", location: "s3://b/a.mp4", sizeBytes: 1_234_567, durationSeconds: 305.6 }] }));
    expect(await latestRecording(m.id)).toMatchObject({ id: rec.id, status: "PROCESSING", durationSec: 306, fileSizeBytes: 1_234_567 });
  });
});
