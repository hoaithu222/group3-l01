import { installMocks, redisStore } from "./meeting-room-test-mocks";
import { buildMeetingsApp, makeApi, seedWorld, type World } from "./meetings-test-kit";
import { createMeeting, drainRoomOutbox, ensureRoomIndexes } from "./meeting-room-test-kit";
import { cleanupRecapWorld, ensureRecapIndexes, installRecordingHarness, liveRoom, seedAsset, type RecordingHarness } from "./recap-recording-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { createAssetAccessService } from "../../../assets/public";

const app = buildMeetingsApp();
const api = makeApi(app);
const recapPath = (id: string) => `/meetings/${id}/recap`;

describe("biên bản họp (integration, Mongo memory replset, LiveKit giả)", () => {
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

  const save = (meetingId: string, uid: string, body: Record<string, unknown>) => api("put", recapPath(meetingId), uid, body);
  const publish = (meetingId: string, uid: string, expectedVersion: number) => api("post", `${recapPath(meetingId)}/publish`, uid, { expectedVersion });
  const attach = (meetingId: string, uid: string, assetId: string) => api("post", `${recapPath(meetingId)}/attachments`, uid, { assetId });

  it("người sửa lưu nháp (lần đầu không cần expectedVersion); chưa có bản ghi → nháp rỗng ảo version 0; RR-02 attendee không thấy nháp (404 MEET_001) và không sửa được (403 MEET_002)", async () => {
    const { m } = await liveRoom(h, api, w);
    const virtual = await api("get", recapPath(m.id), w.u.C!);
    expect(virtual.status).toBe(200);
    expect(virtual.body.data).toMatchObject({ recapId: null, version: 0, content: "", myActions: { canEdit: true, canPublish: true } });
    const early = await api("get", recapPath(m.id), w.u.E!);
    expect([early.status, early.body.error.code]).toEqual([404, "MEET_001"]); // chưa có bản ghi: người xem thường không thấy gì

    const first = await save(m.id, w.u.C!, { content: "# Mục tiêu\n- Chốt kế hoạch" });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ version: 1, authorId: w.u.C, lastEditedBy: w.u.C, hasUnpublishedChanges: true, content: "# Mục tiêu\n- Chốt kế hoạch" });

    const draftForViewer = await api("get", recapPath(m.id), w.u.E!);
    expect([draftForViewer.status, draftForViewer.body.error.code]).toEqual([404, "MEET_001"]); // RR-02: nháp không lộ
    const edit = await save(m.id, w.u.E!, { content: "tôi thử sửa", expectedVersion: 1 });
    expect([edit.status, edit.body.error.code]).toEqual([403, "MEET_002"]);
    expect((await save(m.id, w.u.X!, { content: "người ngoài", expectedVersion: 1 })).status).toBe(404);
    expect((await api("get", recapPath(m.id), w.u.X!)).status).toBe(404);
    // Đồng chủ trì (B) xem được nháp
    expect((await api("get", recapPath(m.id), w.u.B!)).body.data.content).toContain("Chốt kế hoạch");
  });

  it("RR-01: chủ trì và đồng chủ trì cùng sửa với cùng expectedVersion → một thành công, một 409 RES_003; lưu lần hai không expectedVersion cũng 409", async () => {
    const { m } = await liveRoom(h, api, w);
    await save(m.id, w.u.C!, { content: "bản đầu" });
    const [a, b] = await Promise.all([save(m.id, w.u.C!, { content: "bản của chủ trì", expectedVersion: 1 }), save(m.id, w.u.B!, { content: "bản của đồng chủ trì", expectedVersion: 1 })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe("RES_003");
    expect((await prisma.meetingRecap.findUniqueOrThrow({ where: { meetingId: m.id } })).version).toBe(2);
    const noVersion = await save(m.id, w.u.C!, { content: "thiếu expectedVersion" });
    expect([noVersion.status, noVersion.body.error.code]).toEqual([409, "RES_003"]);
  });

  it("chỉ viết được khi cuộc họp LIVE/ENDED (SCHEDULED → 409 MEET_021); nội dung quá dài → 400 MEET_023; lưu nháp rỗng được nhưng công bố rỗng thì 400 MEET_023", async () => {
    const scheduled = await createMeeting(api, w, w.u.C!);
    const early = await save(scheduled.id, w.u.C!, { content: "sớm quá" });
    expect([early.status, early.body.error.code]).toEqual([409, "MEET_021"]);

    const { m } = await liveRoom(h, api, w);
    const tooLong = await save(m.id, w.u.C!, { content: "a".repeat(20_001) });
    expect([tooLong.status, tooLong.body.error.code]).toEqual([400, "MEET_023"]);
    const created = await save(m.id, w.u.C!, { content: "" });
    expect([created.status, created.body.data.version]).toEqual([200, 1]);
    const blank = await publish(m.id, w.u.C!, 1);
    expect([blank.status, blank.body.error.code]).toEqual([400, "MEET_023"]);
    const badRange = await save(m.id, w.u.C!, { content: "x", expectedVersion: 1, startedAt: "2026-01-02T00:00:00Z", endedAt: "2026-01-01T00:00:00Z" });
    expect(badRange.status).toBe(400);
  });

  it("RR-03: công bố → MỘT thẻ MEETING_RECAP trong nhóm chat + push/inbox tới người tham dự (trừ người công bố) + socket; công bố lại SỬA thẻ, không tạo tin mới, không thông báo lại; người xem chỉ thấy bản đã công bố", async () => {
    const { m } = await liveRoom(h, api, w, { createChatGroup: false });
    const chat = await api("post", `/meetings/${m.id}/chat-group`, w.u.C!);
    const conversationId = chat.body.data.conversationId as string;
    w.conversationIds.push(conversationId);

    await save(m.id, w.u.C!, { content: "**Quyết định**\n- Ra mắt vào tháng 10\n- [ ] Giao việc cho Thu" });
    const denied = await publish(m.id, w.u.E!, 1);
    expect([denied.status, denied.body.error.code]).toEqual([403, "MEET_002"]);
    const pub = await publish(m.id, w.u.B!, 1); // đồng chủ trì được công bố
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ publishedVersion: 2, version: 2, hasUnpublishedChanges: false, publishedBy: w.u.B });
    expect(await prisma.auditLog.count({ where: { action: "meeting.recap-publish", targetId: m.id } })).toBe(1);

    await drainRoomOutbox(h);
    const cards = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: conversationId, systemType: "MEETING_RECAP" } });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.systemPayload).toMatchObject({ meetingId: m.id, title: "Họp tuần", excerpt: "Quyết định\nRa mắt vào tháng 10\nGiao việc cho Thu", attachmentCount: 0, publishedVersion: 2 });
    expect((await prisma.meetingRecap.findUniqueOrThrow({ where: { meetingId: m.id } })).systemMessageId).toBe(cards[0]!.id);
    const pushed = h.notified.filter((n) => n.type === "meeting.recap-published");
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.recipients.map((r) => r.userId).sort()).toEqual([w.u.A, w.u.C, w.u.D, w.u.E].sort()); // trừ B là người công bố
    expect(h.eventsTo(w.u.E!, "meeting:recap-published")).toHaveLength(1);
    expect(h.eventsTo(w.u.E!, "meeting:recap-published")[0]!.payload).toMatchObject({ meetingId: m.id, publishedVersion: 2, firstPublish: true });

    // Người xem thấy bản đã công bố (không thấy nháp sau đó)
    const view = await api("get", recapPath(m.id), w.u.E!);
    expect(view.body.data).toMatchObject({ content: expect.stringContaining("Ra mắt vào tháng 10"), publishedVersion: 2, hasUnpublishedChanges: false, myActions: { canEdit: false, canPublish: false } });
    await save(m.id, w.u.C!, { content: "NHÁP MỚI chưa công bố", expectedVersion: 2 });
    expect((await api("get", recapPath(m.id), w.u.E!)).body.data.content).toContain("Ra mắt vào tháng 10");
    const editorView = await api("get", recapPath(m.id), w.u.C!);
    expect(editorView.body.data).toMatchObject({ content: "NHÁP MỚI chưa công bố", hasUnpublishedChanges: true, version: 3 });

    // Công bố lại → sửa thẻ tại chỗ (cùng message id), không tin mới, không thông báo lại
    expect((await publish(m.id, w.u.C!, 3)).status).toBe(200);
    await drainRoomOutbox(h);
    const after = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: conversationId, systemType: "MEETING_RECAP" } });
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(cards[0]!.id);
    expect(after[0]!.systemPayload).toMatchObject({ excerpt: "NHÁP MỚI chưa công bố", publishedVersion: 4 });
    expect(after[0]!.version).toBeGreaterThan(cards[0]!.version);
    expect(h.notified.filter((n) => n.type === "meeting.recap-published")).toHaveLength(1);
    expect(h.eventsTo(w.u.E!, "meeting:recap-published")).toHaveLength(2);
    // message:updated tới client phải mang systemPayload (outbox `message.updated` reason SYSTEM_PAYLOAD)
    const updatedRow = await prisma.outboxEvent.findFirst({ where: { type: "message.updated", aggregateId: cards[0]!.id } });
    expect(updatedRow?.payload).toMatchObject({ event: "updated", reason: "SYSTEM_PAYLOAD" });
    expect((await api("get", recapPath(m.id), w.u.E!)).body.data.content).toBe("NHÁP MỚI chưa công bố");
  });

  it("RR-04: đính kèm tệp chưa READY → 409 ASSET_003, của người khác → 403 ASSET_005, sai scope → 415 ASSET_001; tệp thứ 11 → 409 MEET_022; đính kèm lại cùng tệp idempotent; gỡ tệp giảm số đếm", async () => {
    const { m } = await liveRoom(h, api, w);
    await save(m.id, w.u.C!, { content: "có tệp" });
    const uploading = await seedAsset(w.u.C!, w.workspaceId, { status: "UPLOADING" });
    expect([(await attach(m.id, w.u.C!, uploading)).status, (await attach(m.id, w.u.C!, uploading)).body.error.code]).toEqual([409, "ASSET_003"]);
    const others = await seedAsset(w.u.E!, w.workspaceId);
    const foreign = await attach(m.id, w.u.C!, others);
    expect([foreign.status, foreign.body.error.code]).toEqual([403, "ASSET_005"]);
    const wrongScope = await seedAsset(w.u.C!, w.workspaceId, { scope: "MESSAGE" });
    const wrong = await attach(m.id, w.u.C!, wrongScope);
    expect([wrong.status, wrong.body.error.code]).toEqual([415, "ASSET_001"]);
    expect((await attach(m.id, w.u.E!, await seedAsset(w.u.E!, w.workspaceId))).body.error.code).toBe("MEET_002"); // attendee không đính kèm được

    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const id = await seedAsset(w.u.C!, w.workspaceId, { name: `tai-lieu-${i}.pdf` });
      ids.push(id);
      expect((await attach(m.id, w.u.C!, id)).status).toBe(200);
    }
    const eleventh = await attach(m.id, w.u.C!, await seedAsset(w.u.C!, w.workspaceId));
    expect([eleventh.status, eleventh.body.error.code]).toEqual([409, "MEET_022"]);
    const again = await attach(m.id, w.u.C!, ids[0]!); // đã gắn: idempotent, không tăng đếm
    expect(again.status).toBe(200);
    expect(again.body.data.attachments).toHaveLength(10);
    expect(again.body.data.attachments[0]).toMatchObject({ assetId: ids[0], name: "tai-lieu-0.pdf", mime: "application/pdf", size: 1000 });

    const detached = await api("delete", `${recapPath(m.id)}/attachments/${ids[0]}`, w.u.C!);
    expect(detached.status).toBe(200);
    expect(detached.body.data.attachments).toHaveLength(9);
    expect((await prisma.meetingRecap.findUniqueOrThrow({ where: { meetingId: m.id } })).attachmentCount).toBe(9);
    expect((await api("delete", `${recapPath(m.id)}/attachments/${ids[0]}`, w.u.C!)).status).toBe(404);
    expect((await attach(m.id, w.u.C!, await seedAsset(w.u.C!, w.workspaceId))).status).toBe(200); // còn chỗ sau khi gỡ
  });

  it("RR-05: quyền đọc tệp đính kèm theo BIÊN BẢN — người ngoài cuộc họp không đọc được; attendee chỉ đọc tệp đã công bố (tệp thêm sau công bố ẩn tới khi công bố lại)", async () => {
    const { m } = await liveRoom(h, api, w);
    const access = createAssetAccessService();
    const asset = async (id: string) => ({ id, ownerId: w.u.C!, status: "READY" as const, parentAssetId: null });
    const canRead = (uid: string, id: string) => asset(id).then((a) => access.canRead({ id: uid, email: "" }, a));

    await save(m.id, w.u.C!, { content: "biên bản có tệp" });
    const first = await seedAsset(w.u.C!, w.workspaceId);
    await attach(m.id, w.u.C!, first);
    expect(await canRead(w.u.C!, first)).toBe(true); // người sửa
    expect(await canRead(w.u.B!, first)).toBe(true); // đồng chủ trì
    expect(await canRead(w.u.E!, first)).toBe(false); // nháp: attendee chưa đọc được
    expect(await canRead(w.u.X!, first)).toBe(false);

    expect((await publish(m.id, w.u.C!, 2)).status).toBe(200);
    expect(await canRead(w.u.E!, first)).toBe(true); // đã công bố
    expect(await canRead(w.u.X!, first)).toBe(false); // người ngoài cuộc họp: 404 ở tầng asset
    expect(await canRead(w.u.G!, first)).toBe(false); // khách workspace không tham dự

    const late = await seedAsset(w.u.C!, w.workspaceId);
    await attach(m.id, w.u.C!, late);
    expect(await canRead(w.u.E!, late)).toBe(false); // thêm sau công bố: chưa lộ
    expect((await api("get", recapPath(m.id), w.u.E!)).body.data.attachments.map((a: { assetId: string }) => a.assetId)).toEqual([first]);
    expect((await publish(m.id, w.u.C!, 4)).status).toBe(200);
    expect(await canRead(w.u.E!, late)).toBe(true);
  });

  it("RR-06: kết thúc họp recapRequired chưa công bố → hộp thư cho chủ trì + đồng chủ trì ngay và một hàng nhắc lại sau 24 giờ; nhắc → hộp thư + push; đã công bố hoặc họp bắt đầu lại → không nhắc", async () => {
    const { m } = await liveRoom(h, api, w, { recapRequired: true });
    expect((await api("post", `/meetings/${m.id}/end`, w.u.C!, {})).status).toBe(200);
    await drainRoomOutbox(h);

    const required = h.notified.filter((n) => n.type === "meeting.recap-required");
    expect(required).toHaveLength(1);
    expect(required[0]!.recipients.map((r) => r.userId).sort()).toEqual([w.u.B, w.u.C].sort());
    const ended = (await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).endedAt!;
    const row = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "meeting.recap-reminder", aggregateId: m.id } });
    expect(row.availableAt.getTime()).toBe(ended.getTime() + 24 * 3_600_000);
    expect(row.payload).toMatchObject({ meetingId: m.id, endedAtMs: ended.getTime() });
    const job = { meetingId: m.id, endedAtMs: ended.getTime() };

    expect(await h.container.recapRecording.events.fireRecapReminder(job)).toBe(2);
    expect(h.notified.filter((n) => n.type === "meeting.recap-reminder")[0]).toMatchObject({ refs: { kind: "RECAP", meetingId: m.id } });
    expect(await h.container.recapRecording.events.fireRecapReminder({ ...job, endedAtMs: job.endedAtMs + 1 })).toBe(0); // job của phiên kết thúc cũ

    await save(m.id, w.u.C!, { content: "biên bản viết sau họp" });
    expect((await publish(m.id, w.u.C!, 1)).status).toBe(200);
    expect(await h.container.recapRecording.events.fireRecapReminder(job)).toBe(0); // đã công bố

    const unrequired = await liveRoom(h, api, w, { recapRequired: false });
    await api("post", `/meetings/${unrequired.m.id}/end`, w.u.C!, {});
    await drainRoomOutbox(h);
    expect(await prisma.outboxEvent.count({ where: { jobName: "meeting.recap-reminder", aggregateId: unrequired.m.id } })).toBe(0);
  });

  it("thẻ 'Cuộc họp đã bắt đầu' được sửa tại chỗ khi kết thúc (endedAt + durationSec) — không đăng tin mới", async () => {
    const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!], createChatGroup: true, lobbyMode: "OFF" });
    expect(await h.container.conversationSync.sync({ meetingId: m.id })).toBe("SYNCED");
    const conversationId = (await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).conversationId!;
    w.conversationIds.push(conversationId);
    const start = await api("post", `/meetings/${m.id}/start`, w.u.C!, { expectedVersion: m.version, deviceId: "dev-12345678" });
    expect(start.status).toBe(200);
    await drainRoomOutbox(h);
    const before = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: conversationId, systemType: "MEETING_STARTED" } });
    expect(before).toHaveLength(1);
    // `startedAt` = lúc PHIÊN bắt đầu (thẻ chat hiện giờ bắt đầu); chưa có `endedAt`/`durationSec` khi đang diễn ra.
    expect(before[0]!.systemPayload).toEqual({ meetingId: m.id, title: "Họp tuần", startedAt: expect.any(String) });

    h.clock.advanceMinutes(45);
    expect((await api("post", `/meetings/${m.id}/end`, w.u.C!, {})).status).toBe(200);
    await drainRoomOutbox(h);
    const after = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: conversationId, systemType: "MEETING_STARTED" } });
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.systemPayload).toMatchObject({ meetingId: m.id, title: "Họp tuần", endedAt: expect.any(String), durationSec: expect.any(Number) });
    expect((after[0]!.systemPayload as { startedAt: string }).startedAt).toBe((before[0]!.systemPayload as { startedAt: string }).startedAt); // sửa tại chỗ giữ nguyên giờ bắt đầu
    expect(after[0]!.version).toBeGreaterThan(before[0]!.version);
  });

  it("chi tiết cuộc họp phản ánh biên bản: người xem thường chỉ thấy nút 'Xem biên bản' khi ĐÃ công bố; chủ trì luôn có Xem/Sửa; xoá cuộc họp ENDED có biên bản đã công bố chỉ OWNER kèm lý do (MEET_016)", async () => {
    const { m } = await liveRoom(h, api, w);
    await api("post", `/meetings/${m.id}/end`, w.u.C!, {});
    const detail = (uid: string) => api("get", `/meetings/${m.id}`, uid).then((r) => r.body.data);
    expect((await detail(w.u.E!)).myActions).toMatchObject({ canViewRecap: false, canEditRecap: false });
    expect((await detail(w.u.C!)).myActions).toMatchObject({ canViewRecap: true, canEditRecap: true });

    await save(m.id, w.u.C!, { content: "đã có biên bản" });
    await publish(m.id, w.u.C!, 1);
    expect(await detail(w.u.E!)).toMatchObject({ hasPublishedRecap: true, myActions: { canViewRecap: true, canEditRecap: false } });
    const version = (await detail(w.u.C!)).version as number;
    const byHost = await api("delete", `/meetings/${m.id}?expectedVersion=${version}`, w.u.C!);
    expect([byHost.status, byHost.body.error.code]).toEqual([409, "MEET_016"]);
    expect((await api("delete", `/meetings/${m.id}?expectedVersion=${version}&reason=Xoa+theo+yeu+cau+quan+tri`, w.u.A!)).status).toBe(204); // OWNER workspace + lý do
  });
});
