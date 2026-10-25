import { installMocks, redisStore } from "./admin-media-test-mocks";
import { buildApp, cleanup, ensureOutboxIndex, newIds, seedCall, seedMeeting, seedWorkspace, tokenFor, type Ids } from "./admin-media-test-kit";
import request from "supertest";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { handleCallForceEnd, type CallForceEndPayload } from "../../../calls/jobs/call-admin.outbox-handlers";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "../../../meetings/tests/integration/meetings-test-kit";
import { cleanupRoomWorld, connectClient, createMeeting, ensureRoomIndexes, installRoomHarness, joinMeeting, startMeeting, type RoomHarness } from "../../../meetings/tests/integration/meeting-room-test-kit";
import type { MeetingForceEndPayload } from "../../../meetings/services/meeting-force-end.service";
import { clearCallSignalSinks, registerCallSignalSink, type CallSignalPayload } from "../../../calls";
import { clearMeetingEventSinks } from "../../../meetings";
import type { MeetingEventPayload } from "../../../meetings/services/meeting-events";
import { AdminMediaUpdatedPublisher } from "../../events/admin-media-updated.publisher";
import { registerAdminMediaSinks } from "../../events/admin-media.sinks";

/**
 * OPC-03/04 đầu-cuối (p2-07): admin `POST /admin/meetings/:id/force-end` → outbox `meeting.force-end` (+ audit có lý do) → consumer của `meetings` (`endBySystem(FORCE_ENDED)`) → LiveKit room bị xoá,
 * `meeting:ended { reason: FORCE_ENDED }` tới mọi người, chủ trì/đồng chủ trì nhận thông báo; và tương tự `POST /admin/calls/:id/force-end` → `call.force-end` → `CallEndService.endCall`.
 * Container `meetings`/`calls` là thật (Mongo memory replset, LiveKit giả); "relay" outbox thủ công (đọc hàng PENDING rồi chạy consumer như worker). Dùng bộ dựng test của `meetings`/`calls` (chỉ test).
 */
const admin = buildApp();
const userApp = buildMeetingsApp();
const userApi = makeApi(userApp);
const ADMIN_ID = newObjectId();
const REASON = "Phòng treo sau sự cố mạng";

const adminPost = (path: string, body: unknown, role: "admin" | "manager" = "admin") => request(admin).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokenFor(role, ADMIN_ID)}`).send(body as object);

describe("admin-media-ops — force-end (integration, Mongo memory replset, LiveKit giả)", () => {
  const worlds: World[] = [];
  const ids: Ids = newIds();
  let h: RoomHarness;
  let w: World;

  beforeAll(async () => {
    await ensureRoomIndexes();
    await ensureOutboxIndex();
  });

  beforeEach(async () => {
    installMocks();
    h = installRoomHarness();
    await prisma.outboxEvent.deleteMany({ where: { type: { in: ["meeting.force-end", "call.force-end"] } } });
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanup(ids);
    Object.assign(ids, newIds());
    await cleanupRoomWorld(worlds.splice(0));
    redisStore.clear();
  });

  /** Chủ trì C, đồng chủ trì B, D đều đã vào phòng LIVE (có mic); E được mời nhưng CHƯA vào. */
  async function liveMeeting() {
    const m = await createMeeting(userApi, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.B!, w.u.E!], coHostIds: [w.u.B!], lobbyMode: "OFF" });
    const s = await startMeeting(userApi, m, w.u.C!);
    const callId = s.body.data.callId as string;
    const room = s.body.data.livekitRoom as string;
    const joins: Record<string, { livekitRoom: string }> = { [w.u.C!]: s.body.data };
    for (const uid of [w.u.B!, w.u.D!]) joins[uid] = (await joinMeeting(userApi, m.id, uid)).body.data;
    for (const [uid, j] of Object.entries(joins)) connectClient(h, j, uid, [{ sid: `mic-${uid}`, source: "MICROPHONE" }]);
    await h.calls.reconcile.reconcile(callId);
    return { m, callId, room };
  }

  const pendingRows = (type: string) => prisma.outboxEvent.findMany({ where: { type, status: "PENDING" }, orderBy: { createdAt: "asc" } });

  it("OPC-03: force-end cuộc họp LIVE có 3 người → 202, outbox + audit có lý do; consumer kết thúc: room LiveKit bị xoá, meeting:ended FORCE_ENDED, chủ trì/đồng chủ trì nhận thông báo", async () => {
    const { m, callId, room } = await liveMeeting();
    const res = await adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON });
    expect([res.status, res.body.data]).toEqual([202, { accepted: true }]);

    const rows = await pendingRows("meeting.force-end");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ queue: "calls", jobName: "meeting.force-end", aggregateType: "Meeting", aggregateId: m.id });
    expect(rows[0]!.payload).toMatchObject({ meetingId: m.id, actorId: ADMIN_ID, callId, reason: REASON });
    const audit = await prisma.auditLog.findMany({ where: { targetId: m.id, action: "meeting.force-end" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: ADMIN_ID, actorRole: "admin", reason: REASON, workspaceId: w.workspaceId, metadata: { title: "Họp tuần", connectedCount: 3 } });
    // Chưa chạy consumer: cuộc họp vẫn LIVE (kết thúc là bất đồng bộ).
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("LIVE");

    await h.container.room.forceEnd.run(rows[0]!.payload as unknown as MeetingForceEndPayload);

    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } });
    expect(meeting).toMatchObject({ status: "ENDED", endReason: "FORCE_ENDED" });
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call).toMatchObject({ status: "ENDED", endReason: "FORCE_ENDED", endedBy: ADMIN_ID });
    expect(h.media.callsOf("deleteRoom").map((c) => c.args[0])).toContain(room);
    const ended = h.emitted.filter((e) => e.target === "room" && e.event === "meeting:ended");
    expect(ended.map((e) => e.to).sort()).toEqual([`call:${callId}`, `meet:${m.id}`].sort());
    expect(ended[0]!.payload).toMatchObject({ meetingId: m.id, reason: "FORCE_ENDED" });
    // Chủ trì + đồng chủ trì (theo lịch) nhận hộp thư; người tham dự thường và admin thì không.
    const notice = h.notified.filter((n) => n.type === "meeting.force-ended");
    expect(notice).toHaveLength(1);
    expect(notice[0]!.recipients.map((r) => r.userId).sort()).toEqual([w.u.C!, w.u.B!].sort());
    expect(JSON.stringify(notice)).not.toContain(ADMIN_ID);
    // Không ghi thêm audit `meeting.end-system` (đã có `meeting.force-end` kèm lý do).
    expect(await prisma.auditLog.count({ where: { targetId: m.id, action: "meeting.end-system" } })).toBe(0);

    // Consumer chạy lại (retry) → idempotent: không kết thúc lại, thông báo dedupe theo phiên.
    await expect(h.container.room.forceEnd.run(rows[0]!.payload as unknown as MeetingForceEndPayload)).resolves.toBe("ENDED");
    expect(h.media.callsOf("deleteRoom").filter((c) => c.args[0] === room)).toHaveLength(1);
  });

  it("bấm force-end hai lần khi phòng vẫn LIVE (version chưa đổi) → cả hai 202 nhưng MỘT outbox và MỘT audit; đua đồng thời cũng vậy", async () => {
    const { m } = await liveMeeting();
    const [a, b] = await Promise.all([adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON }), adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON })]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect((await adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON })).status).toBe(202);
    expect(await pendingRows("meeting.force-end")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { targetId: m.id, action: "meeting.force-end" } })).toBe(1);
  });

  it("OPC-04: thiếu/ngắn lý do → 400 VAL_001; cuộc họp không LIVE → 409 MEET_009; không tồn tại → 404 MEET_001 — không ghi outbox/audit", async () => {
    const ws = await seedWorkspace(ids);
    const scheduled = await seedMeeting(ids, ws, { status: "SCHEDULED" });
    const ended = await seedMeeting(ids, ws, { status: "ENDED", endReason: "HOST_ENDED" });
    for (const body of [{}, { reason: "ngắn" }, { reason: "x".repeat(501) }, { reason: REASON, extra: 1 }]) {
      const res = await adminPost(`/admin/meetings/${scheduled.id}/force-end`, body);
      expect([JSON.stringify(body).slice(0, 30), res.status, res.body.error.code]).toEqual([JSON.stringify(body).slice(0, 30), 400, "VAL_001"]);
    }
    for (const id of [scheduled.id, ended.id]) {
      const res = await adminPost(`/admin/meetings/${id}/force-end`, { reason: REASON });
      expect([res.status, res.body.error.code]).toEqual([409, "MEET_009"]);
    }
    const miss = await adminPost(`/admin/meetings/${newObjectId()}/force-end`, { reason: REASON });
    expect([miss.status, miss.body.error.code]).toEqual([404, "MEET_001"]);
    expect(await pendingRows("meeting.force-end")).toHaveLength(0);
    expect(await prisma.auditLog.count({ where: { targetId: { in: [scheduled.id, ended.id] } } })).toBe(0);
  });

  it("consumer bỏ qua yêu cầu LỖI THỜI: chủ trì kết thúc bình thường trước khi job chạy → không đổi lý do kết thúc, không thông báo", async () => {
    const { m } = await liveMeeting();
    await adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON });
    const [row] = await pendingRows("meeting.force-end");
    expect((await userApi("post", `/meetings/${m.id}/end`, w.u.C!, {})).status).toBe(200);
    await expect(h.container.room.forceEnd.run(row!.payload as unknown as MeetingForceEndPayload)).resolves.toBe("SKIPPED");
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).endReason).toBe("HOST_ENDED");
    expect(h.notified.filter((n) => n.type === "meeting.force-ended")).toHaveLength(0);
  });

  describe("cuộc gọi", () => {
    it("force-end phòng thoại kênh đang ACTIVE → 202, outbox call.force-end + audit (không userId/scopeId); consumer gọi endCall(FORCE_ENDED, admin): Call ENDED, room bị xoá, outbox call.ended; chạy lại → một lần", async () => {
      const ws = await seedWorkspace(ids);
      const c = await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: ws.workspaceId, status: "ACTIVE", peakParticipants: 4 });
      const res = await adminPost(`/admin/calls/${c.id}/force-end`, { reason: REASON });
      expect([res.status, res.body.data]).toEqual([202, { accepted: true }]);

      const [row] = await pendingRows("call.force-end");
      expect(row).toMatchObject({ queue: "calls", jobName: "call.force-end", aggregateType: "Call", aggregateId: c.id });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { targetId: c.id, action: "call.force-end" } });
      expect(audit).toMatchObject({ actorId: ADMIN_ID, reason: REASON, workspaceId: ws.workspaceId, metadata: { scopeType: "CHANNEL", mode: "ROOM", peakParticipants: 4 } });
      expect(JSON.stringify(audit)).not.toContain(c.scopeId);
      expect((await adminPost(`/admin/calls/${c.id}/force-end`, { reason: REASON })).status).toBe(202); // bấm lại
      expect(await pendingRows("call.force-end")).toHaveLength(1);

      const port = { findCall: (id: string) => h.calls.deps.repo.findById(id), endCall: (id: string, reason: "FORCE_ENDED", actor: string | null) => h.calls.ends.endCall(id, reason, actor) };
      const payload = row!.payload as unknown as CallForceEndPayload;
      await expect(handleCallForceEnd(payload, port)).resolves.toBe("ENDED");
      await expect(handleCallForceEnd(payload, port)).resolves.toBe("SKIPPED");
      expect(await prisma.call.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "ENDED", endReason: "FORCE_ENDED", endedBy: ADMIN_ID });
      expect(h.media.callsOf("deleteRoom").filter((x) => x.args[0] === `call_${c.id}`)).toHaveLength(1);
      const ends = await prisma.outboxEvent.findMany({ where: { type: "call.ended", aggregateId: c.id } });
      expect(ends).toHaveLength(1);
      expect(ends[0]!.payload).toMatchObject({ event: "ended", callId: c.id, reason: "FORCE_ENDED" });
      // Đã ENDED → 410 CALL_005.
      const gone = await adminPost(`/admin/calls/${c.id}/force-end`, { reason: REASON });
      expect([gone.status, gone.body.error.code]).toEqual([410, "CALL_005"]);
    });

    it("cuộc gọi của cuộc họp → 409 ADMIN_MEDIA_002 (kèm meetingId); không tồn tại → 404 CALL_005; thiếu lý do → 400 — không ghi outbox/audit", async () => {
      const ws = await seedWorkspace(ids);
      const m = await seedMeeting(ids, ws, { status: "LIVE" });
      const mc = await seedCall(ids, { scopeType: "MEETING", scopeId: m.id, mode: "ROOM", workspaceId: ws.workspaceId, status: "ACTIVE" });
      const res = await adminPost(`/admin/calls/${mc.id}/force-end`, { reason: REASON });
      expect([res.status, res.body.error.code, res.body.error.details]).toEqual([409, "ADMIN_MEDIA_002", { meetingId: m.id }]);
      const miss = await adminPost(`/admin/calls/${newObjectId()}/force-end`, { reason: REASON });
      expect([miss.status, miss.body.error.code]).toEqual([404, "CALL_005"]);
      expect((await adminPost(`/admin/calls/${mc.id}/force-end`, {})).status).toBe(400);
      expect(await pendingRows("call.force-end")).toHaveLength(0);
      expect(await prisma.auditLog.count({ where: { targetId: mc.id } })).toBe(0);
    });
  });

  it("sink admin:media-updated: call.ended (dispatcher thật) và meeting.ended (handler thật) phát invalidate tới room admin:media; sink khác ném lỗi không làm hỏng dispatch", async () => {
    const emitted: Array<{ room: string; event: string; payload: object }> = [];
    registerAdminMediaSinks(new AdminMediaUpdatedPublisher(() => Promise.resolve(true), (room, event, payload) => emitted.push({ room, event, payload })));
    registerCallSignalSink("sink-loi", () => Promise.reject(new Error("sink lỗi")));
    try {
      const ws = await seedWorkspace(ids);
      const c = await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: ws.workspaceId, status: "ACTIVE" });
      await h.calls.ends.endCall(c.id, "FORCE_ENDED", ADMIN_ID);
      const [callEnded] = await prisma.outboxEvent.findMany({ where: { type: "call.ended", aggregateId: c.id } });
      await expect(h.calls.dispatcher.dispatch(callEnded!.payload as unknown as CallSignalPayload)).resolves.toBeUndefined();
      expect(emitted).toContainEqual({ room: "admin:media", event: "admin:media-updated", payload: { kind: "CALL", id: c.id, status: "ENDED" } });

      const { m } = await liveMeeting();
      await adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON });
      const [row] = await pendingRows("meeting.force-end");
      await h.container.room.forceEnd.run(row!.payload as unknown as MeetingForceEndPayload);
      const [meetingEnded] = await prisma.outboxEvent.findMany({ where: { type: "meeting.ended", aggregateId: m.id } });
      await h.container.events.handle(meetingEnded!.payload as unknown as MeetingEventPayload);
      expect(emitted).toContainEqual({ room: "admin:media", event: "admin:media-updated", payload: { kind: "MEETING", id: m.id, status: "ENDED" } });
      // Không có nội dung/người dùng trong payload.
      expect(JSON.stringify(emitted)).not.toMatch(/userId|title|reason|actor/);
    } finally {
      clearCallSignalSinks();
      clearMeetingEventSinks();
    }
  });

  it("manager (meeting:update) cũng force-end được; audit ghi vai trò manager", async () => {
    const { m } = await liveMeeting();
    expect((await adminPost(`/admin/meetings/${m.id}/force-end`, { reason: REASON }, "manager")).status).toBe(202);
    expect(await prisma.auditLog.count({ where: { targetId: m.id, action: "meeting.force-end", actorRole: "manager" } })).toBe(1);
  });
});
