import { installMocks, redisStore } from "./meetings-test-mocks";
import { buildMeetingsApp, cleanupWorld, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, slot, type MeetingsHarness, type World } from "./meetings-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("meetings — tạo/xem/sửa/huỷ/xoá + quyền (integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let h: MeetingsHarness;
  let w: World;

  beforeAll(async () => {
    await ensureMeetingIndexes();
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const create = (uid: string, over: Record<string, unknown> = {}, headers = idemKey()) =>
    api("post", `/workspaces/${w.workspaceId}/meetings`, uid, meetingBody(over), headers);
  const created = async (uid = w.u.C!, over: Record<string, unknown> = {}) => {
    const res = await create(uid, over);
    expect(res.status).toBe(201);
    return res.body.data as { id: string; code: string; version: number; myActions: Record<string, unknown> };
  };

  it("MT-01: tạo 201 với HOST=người tạo, 1 bộ attendee, 1 outbox created; Idempotency-Key trùng → cùng response, không tạo thêm", async () => {
    const key = idemKey();
    const first = await create(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], coHostIds: [w.u.E!] }, key);
    expect(first.status).toBe(201);
    const m = first.body.data;
    expect(m).toMatchObject({ status: "SCHEDULED", hostId: w.u.C, myRole: "HOST", version: 1, attendeeCount: 3, platform: "INTERNAL", reminderMinutes: [15], coHostIds: [w.u.E] });
    expect(m.code).toMatch(/^[a-hjkmnp-z]{3}-[a-hjkmnp-z]{4}-[a-hjkmnp-z]{3}$/);
    expect(m.myActions).toMatchObject({ canEdit: true, canCancel: true, canDelete: true });
    expect(new Date(m.joinOpensAt).getTime()).toBe(new Date(m.startAt).getTime() - 10 * 60_000);

    const second = await create(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], coHostIds: [w.u.E!] }, key);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.id).toBe(m.id);
    expect(await prisma.meeting.count({ where: { workspaceId: w.workspaceId } })).toBe(1);
    const attendees = await prisma.meetingAttendee.findMany({ where: { meetingId: m.id } });
    expect(attendees.map((a) => [a.role, a.rsvp]).sort()).toEqual([["ATTENDEE", "PENDING"], ["CO_HOST", "PENDING"], ["HOST", "ACCEPTED"]].sort());
    expect(attendees.every((a) => a.removedAt === null && a.meetingStatus === "SCHEDULED")).toBe(true);
    expect(await prisma.meeting.count({ where: { id: m.id, deletedAt: null, conversationId: null } })).toBe(1); // null tường minh
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.created" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "meeting.create", targetId: m.id } })).toBe(1);
  });

  it("thiếu Idempotency-Key → 400; GUEST/người ngoài workspace không tạo được; nhóm ARCHIVED → 403 WS_002", async () => {
    expect((await api("post", `/workspaces/${w.workspaceId}/meetings`, w.u.C!, meetingBody())).status).toBe(400);
    const guest = await create(w.u.G!);
    expect([guest.status, guest.body.error.code]).toEqual([404, "PERM_404"]);
    expect((await create(w.u.X!)).status).toBe(404);
    const archived = await seedWorld("ARCHIVED");
    worlds.push(archived);
    const res = await api("post", `/workspaces/${archived.workspaceId}/meetings`, archived.u.C!, meetingBody(), idemKey());
    expect([res.status, res.body.error.code]).toEqual([403, "WS_002"]);
  });

  it("MT-02: startAt quá khứ → MEET_004; endAt ≤ startAt hoặc > 24 giờ → MEET_003 (400)", async () => {
    const past = await create(w.u.C!, slot(-120));
    expect([past.status, past.body.error.code]).toEqual([400, "MEET_004"]);
    const s = slot();
    expect((await create(w.u.C!, { startAt: s.startAt, endAt: s.startAt })).body.error.code).toBe("MEET_003");
    expect((await create(w.u.C!, slot(120, 25 * 60))).body.error.code).toBe("MEET_003");
    const tz = await create(w.u.C!, { timezone: "Mars/Olympus" });
    expect([tz.status, tz.body.error.code]).toEqual([400, "VAL_001"]);
  });

  it("MT-03: mời người ngoài workspace/GUEST-không-active → 400 MEET_014 (kèm userIds); vượt trần người tham dự → 409 MEET_005", async () => {
    const outsider = await create(w.u.C!, { attendeeIds: [w.u.X!] });
    expect([outsider.status, outsider.body.error.code]).toEqual([400, "MEET_014"]);
    expect(outsider.body.error.details.userIds).toEqual([w.u.X]);
    h = installHarness({ limits: () => Promise.resolve({ attendeesMax: 3, remindersMax: 3, joinWindowMinutes: 10, maxParticipants: 50, maxMinutes: 240 }) });
    const tooMany = await create(w.u.C!, { attendeeIds: [w.u.A!, w.u.B!, w.u.D!] });
    expect([tooMany.status, tooMany.body.error.code]).toEqual([409, "MEET_005"]);
    expect((await create(w.u.C!, { attendeeIds: [w.u.A!, w.u.B!] })).status).toBe(201);
  });

  it("MT-13: nền tảng ZOOM với http://evil.com → 400 MEET_015; URL zoom hợp lệ nhận; thiếu URL → MEET_015; INTERNAL bỏ externalUrl", async () => {
    const bad = await create(w.u.C!, { platform: "ZOOM", externalUrl: "http://evil.com/j/1" });
    expect([bad.status, bad.body.error.code]).toEqual([400, "MEET_015"]);
    expect((await create(w.u.C!, { platform: "ZOOM", externalUrl: "https://evil.com/zoom.us" })).body.error.code).toBe("MEET_015");
    expect((await create(w.u.C!, { platform: "ZOOM" })).body.error.code).toBe("MEET_015");
    const ok = await create(w.u.C!, { platform: "ZOOM", externalUrl: "https://us02web.zoom.us/j/123" });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ externalUrl: "https://us02web.zoom.us/j/123", myActions: { canOpenExternal: true, canStart: false } });
    const internal = await create(w.u.C!, { platform: "INTERNAL", externalUrl: "https://zoom.us/j/9" });
    expect(internal.body.data.externalUrl).toBeUndefined();
  });

  it("MT-04: người không tham dự (ATTENDEES) → 404 MEET_001; OWNER WS thấy BẢN METADATA không agenda/link; attendee thấy đủ", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], agenda: "Chương trình họp", location: "Phòng 3", platform: "ZOOM", externalUrl: "https://zoom.us/j/1" });
    const stranger = await api("get", `/meetings/${m.id}`, w.u.E!);
    expect([stranger.status, stranger.body.error.code]).toEqual([404, "MEET_001"]);
    expect((await api("get", `/meetings/${m.id}`, w.u.X!)).status).toBe(404);

    const owner = await api("get", `/meetings/${m.id}`, w.u.A!);
    expect(owner.status).toBe(200);
    expect(owner.body.data).toMatchObject({ isMetadataOnly: true, title: "Họp tuần", myRole: null, myActions: { canCancel: true, cancelRequiresReason: true, canDelete: true, canOpenExternal: false } });
    for (const key of ["agenda", "location", "externalUrl", "conversationId"]) expect(owner.body.data[key]).toBeUndefined();

    const attendee = await api("get", `/meetings/${m.id}`, w.u.D!);
    expect(attendee.body.data).toMatchObject({ isMetadataOnly: false, agenda: "Chương trình họp", location: "Phòng 3", externalUrl: "https://zoom.us/j/1", myRole: "ATTENDEE", myRsvp: "PENDING" });
    expect(attendee.body.data.rsvpSummary).toEqual({ PENDING: 0, ACCEPTED: 0, DECLINED: 0, TENTATIVE: 0 }); // chỉ chủ trì thấy tổng hợp
    const host = await api("get", `/meetings/${m.id}`, w.u.C!);
    expect(host.body.data.rsvpSummary).toEqual({ PENDING: 1, ACCEPTED: 1, DECLINED: 0, TENTATIVE: 0 });
  });

  it("MT-05: /workspaces/:id/meetings — người không tham dự không thấy cuộc ATTENDEES nhưng thấy WORKSPACE; OWNER thấy cả hai (metadata); /me/meetings MINE vs ALL_VISIBLE", async () => {
    const priv = await created(w.u.C!, { title: "Riêng tư", attendeeIds: [w.u.D!] });
    const pub = await created(w.u.C!, { title: "Công khai", visibility: "WORKSPACE" });
    const range = { from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() };
    const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

    const asE = await api("get", `/workspaces/${w.workspaceId}/meetings?${qs}`, w.u.E!);
    expect(asE.body.data.map((x: { title: string }) => x.title)).toEqual(["Công khai"]);
    expect(asE.body.data[0]).toMatchObject({ id: pub.id, isMetadataOnly: false });
    const asD = await api("get", `/workspaces/${w.workspaceId}/meetings?${qs}`, w.u.D!);
    expect(asD.body.data.map((x: { title: string }) => x.title).sort()).toEqual(["Công khai", "Riêng tư"]);
    const asOwner = await api("get", `/workspaces/${w.workspaceId}/meetings?${qs}`, w.u.A!);
    expect(asOwner.body.data).toHaveLength(2);
    expect(asOwner.body.data.find((x: { id: string }) => x.id === priv.id).isMetadataOnly).toBe(true);
    expect((await api("get", `/workspaces/${w.workspaceId}/meetings?${qs}`, w.u.X!)).status).toBe(404);
    expect((await api("get", `/workspaces/${w.workspaceId}/meetings?from=${range.to}&to=${range.from}`, w.u.C!)).status).toBe(400);

    const mineE = await api("get", `/me/meetings?${qs}`, w.u.E!);
    expect(mineE.body.data).toEqual([]);
    const allE = await api("get", `/me/meetings?${qs}&scope=ALL_VISIBLE`, w.u.E!);
    expect(allE.body.data.map((x: { id: string }) => x.id)).toEqual([pub.id]);
    const mineD = await api("get", `/me/meetings?${qs}&status=SCHEDULED&status=LIVE`, w.u.D!);
    expect(mineD.body.data.map((x: { id: string }) => x.id)).toEqual([priv.id]);
    const cancelledOnly = await api("get", `/me/meetings?${qs}&status=CANCELLED`, w.u.D!);
    expect(cancelledOnly.body.data).toEqual([]);
    const guest = await api("get", `/me/meetings?${qs}&scope=ALL_VISIBLE`, w.u.G!);
    expect(guest.body.data).toEqual([]); // GUEST không thấy cuộc họp WORKSPACE nếu không được mời đích danh
  });

  it("sửa SCHEDULED: đổi giờ → version+1, phi chuẩn hoá attendee, outbox updated (icsRelevant); không đổi gì → không tăng version; sai quyền/khớp version", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    const newStart = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const newEnd = new Date(Date.now() + 4 * 3_600_000).toISOString();
    const res = await api("patch", `/meetings/${m.id}`, w.u.C!, { startAt: newStart, endAt: newEnd, expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ version: 2, startAt: newStart });
    const rows = await prisma.meetingAttendee.findMany({ where: { meetingId: m.id } });
    expect(rows.every((r) => r.meetingStartAt.toISOString() === newStart && r.meetingEndAt.toISOString() === newEnd)).toBe(true);
    const evt = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.updated" } });
    expect(evt!.payload).toMatchObject({ oldVersion: 1, version: 2, icsRelevant: true, notifyRelevant: true, changedFields: expect.arrayContaining(["startAt", "endAt"]) });

    const same = await api("patch", `/meetings/${m.id}`, w.u.C!, { title: "Họp tuần", expectedVersion: 2 });
    expect(same.body.data.version).toBe(2);
    const titleOnly = await api("patch", `/meetings/${m.id}`, w.u.C!, { title: "Tên mới", expectedVersion: 2 });
    const evt2 = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.updated", dedupeKey: { endsWith: ":v3" } } });
    expect(evt2!.payload).toMatchObject({ icsRelevant: true, notifyRelevant: false }); // đổi tiêu đề: ICS có, push không
    expect(titleOnly.body.data.title).toBe("Tên mới");

    const asAttendee = await api("patch", `/meetings/${m.id}`, w.u.D!, { title: "Hack", expectedVersion: 3 });
    expect([asAttendee.status, asAttendee.body.error.code]).toEqual([403, "MEET_002"]);
    expect((await api("patch", `/meetings/${m.id}`, w.u.E!, { title: "Hack", expectedVersion: 3 })).status).toBe(404);
    const past = await api("patch", `/meetings/${m.id}`, w.u.C!, { startAt: new Date(Date.now() - 3_600_000).toISOString(), expectedVersion: 3 });
    expect([past.status, past.body.error.code]).toEqual([400, "MEET_004"]);
    const badRange = await api("patch", `/meetings/${m.id}`, w.u.C!, { endAt: new Date(Date.now() + 60_000).toISOString(), expectedVersion: 3 });
    expect([badRange.status, badRange.body.error.code]).toEqual([400, "MEET_003"]);
    const unknown = await api("patch", `/meetings/${m.id}`, w.u.C!, { hostId: w.u.D!, expectedVersion: 3 });
    expect(unknown.status).toBe(400); // .strict(): không cho sửa hostId qua PATCH
  });

  it("MT-10: hai chủ trì sửa cùng lúc → một 200, một 409 RES_003", async () => {
    const m = await created(w.u.C!, { coHostIds: [w.u.D!] });
    const [r1, r2] = await Promise.all([
      api("patch", `/meetings/${m.id}`, w.u.C!, { title: "Bản của C", expectedVersion: 1 }),
      api("patch", `/meetings/${m.id}`, w.u.D!, { title: "Bản của D", expectedVersion: 1 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe("RES_003");
    expect(loser.body.error.details.currentVersion).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.updated" } })).toBe(1);
  });

  it("LIVE chỉ sửa tiêu đề/agenda/endAt/lobby; ENDED/CANCELLED không sửa được (MEET_009)", async () => {
    const m = await created(w.u.C!);
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "LIVE", startedAt: new Date() } });
    await prisma.meetingAttendee.updateMany({ where: { meetingId: m.id }, data: { meetingStatus: "LIVE" } });
    const okEdit = await api("patch", `/meetings/${m.id}`, w.u.C!, { title: "Đang họp", lobbyMode: "OFF", expectedVersion: 1 });
    expect(okEdit.status).toBe(200);
    const forbidden = await api("patch", `/meetings/${m.id}`, w.u.C!, { startAt: new Date(Date.now() + 9e6).toISOString(), timezone: "Asia/Tokyo", expectedVersion: 2 });
    expect([forbidden.status, forbidden.body.error.code]).toEqual([409, "MEET_009"]);
    expect(forbidden.body.error.details.fields.sort()).toEqual(["startAt", "timezone"]);
    const shortEnd = await api("patch", `/meetings/${m.id}`, w.u.C!, { endAt: new Date(Date.now() + 60_000).toISOString(), expectedVersion: 2 });
    expect(shortEnd.body.error.code).toBe("MEET_003"); // kéo dài phải ≥ now + 5 phút
    const extend = await api("patch", `/meetings/${m.id}`, w.u.C!, { endAt: new Date(Date.now() + 2 * 3_600_000).toISOString(), expectedVersion: 2 });
    expect(extend.status).toBe(200);

    await prisma.meeting.update({ where: { id: m.id }, data: { status: "ENDED" } });
    const ended = await api("patch", `/meetings/${m.id}`, w.u.C!, { title: "Sau khi kết thúc", expectedVersion: 3 });
    expect([ended.status, ended.body.error.code]).toEqual([409, "MEET_009"]);
  });

  it("MT-08 (API): huỷ SCHEDULED → CANCELLED, denorm attendee, outbox cancelled, audit; huỷ lần 2 → MEET_009; attendee/người ngoài không huỷ được", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    expect((await api("post", `/meetings/${m.id}/cancel`, w.u.D!, { expectedVersion: 1 })).status).toBe(403);
    expect((await api("post", `/meetings/${m.id}/cancel`, w.u.E!, { expectedVersion: 1 })).status).toBe(404);
    const res = await api("post", `/meetings/${m.id}/cancel`, w.u.C!, { expectedVersion: 1, reason: "Hoãn" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "CANCELLED", cancelReason: "Hoãn", version: 2, myActions: { canDelete: true, canEdit: false } });
    expect((await prisma.meetingAttendee.findMany({ where: { meetingId: m.id } })).every((a) => a.meetingStatus === "CANCELLED")).toBe(true);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: m.id, type: "meeting.cancelled" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "meeting.cancel", targetId: m.id } })).toBe(1);
    const again = await api("post", `/meetings/${m.id}/cancel`, w.u.C!, { expectedVersion: 2 });
    expect([again.status, again.body.error.code]).toEqual([409, "MEET_009"]);
  });

  it("OWNER/ADMIN không tham dự huỷ cuộc họp của người khác: BẮT BUỘC lý do (400) + audit meeting.cancel-by-admin", async () => {
    const m = await created(w.u.C!);
    const noReason = await api("post", `/meetings/${m.id}/cancel`, w.u.B!, { expectedVersion: 1 });
    expect([noReason.status, noReason.body.error.code]).toEqual([400, "VAL_001"]);
    const ok = await api("post", `/meetings/${m.id}/cancel`, w.u.B!, { expectedVersion: 1, reason: "Vi phạm quy định nhóm" });
    expect(ok.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "meeting.cancel-by-admin", targetId: m.id, reason: "Vi phạm quy định nhóm" } })).toBe(1);
    const evt = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.cancelled" } });
    expect(evt!.payload).toMatchObject({ byAdmin: true });
  });

  it("xoá mềm: HOST xoá SCHEDULED (huỷ+xoá một bước, ICS CANCEL), CANCELLED; không còn thấy/không truy vấn được; LIVE → 409; người khác 403/404", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    expect((await api("delete", `/meetings/${m.id}?expectedVersion=1`, w.u.D!)).status).toBe(403);
    const del = await api("delete", `/meetings/${m.id}?expectedVersion=1&reason=Tao%20nham`, w.u.C!);
    expect(del.status).toBe(204);
    const row = await prisma.meeting.findUnique({ where: { id: m.id } });
    expect([row!.status, row!.deletedAt, row!.deletedBy]).toEqual(["CANCELLED", expect.any(Date), w.u.C]);
    expect((await api("get", `/meetings/${m.id}`, w.u.C!)).status).toBe(404);
    const evt = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.cancelled" } });
    expect(evt!.payload).toMatchObject({ alsoDeleted: true });

    const live = await created(w.u.C!);
    await prisma.meeting.update({ where: { id: live.id }, data: { status: "LIVE" } });
    const liveDel = await api("delete", `/meetings/${live.id}?expectedVersion=2`, w.u.C!);
    expect([liveDel.status, liveDel.body.error.code]).toEqual([409, "MEET_009"]);
    expect(await prisma.meeting.count({ where: { id: live.id, deletedAt: null } })).toBe(1);

    const ended = await created(w.u.C!);
    await prisma.meeting.update({ where: { id: ended.id }, data: { status: "ENDED" } });
    expect((await api("delete", `/meetings/${ended.id}?expectedVersion=1`, w.u.C!)).status).toBe(204);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: ended.id, type: "meeting.deleted" } })).toBe(1);
    // OWNER WS xoá cuộc họp của người khác (CANCELLED) — được
    const other = await created(w.u.D!);
    await api("post", `/meetings/${other.id}/cancel`, w.u.D!, { expectedVersion: 1 });
    expect((await api("delete", `/meetings/${other.id}?expectedVersion=2`, w.u.A!)).status).toBe(204);
  });

  it("GET /meetings/:id/ics: attendee tải .ics (PUBLISH, UID ổn định); người không thấy chi tiết → 404", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], title: "Họp, có dấu; phẩy" });
    const res = await api("get", `/meetings/${m.id}/ics`, w.u.D!);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/calendar");
    expect(res.headers["content-disposition"]).toContain(`meeting-${m.code}.ics`);
    expect(res.text).toContain("METHOD:PUBLISH");
    expect(res.text).toContain(`UID:${m.id}@superapp.vcijsc.com`);
    expect(res.text).toContain("SUMMARY:Họp\\, có dấu\\; phẩy");
    expect((await api("get", `/meetings/${m.id}/ics`, w.u.A!)).status).toBe(403); // OWNER chỉ có metadata — không tải chi tiết
    expect((await api("get", `/meetings/${m.id}/ics`, w.u.E!)).status).toBe(404);
  });

  it("id không hợp lệ → 400; cuộc họp không tồn tại → 404 MEET_001; cờ meeting tắt → 404 CFG_005", async () => {
    expect((await api("get", "/meetings/khong-phai-objectid", w.u.C!)).status).toBe(400);
    const missing = await api("get", `/meetings/${newObjectId()}`, w.u.C!);
    expect([missing.status, missing.body.error.code]).toEqual([404, "MEET_001"]);
    const { runtimeConfig } = await import("../../../../core/config/runtime-config");
    const spy = jest.spyOn(runtimeConfig, "isFeatureEnabled").mockResolvedValue(false);
    const off = await api("get", `/me/meetings?from=${new Date().toISOString()}&to=${new Date(Date.now() + 1e6).toISOString()}`, w.u.C!);
    expect([off.status, off.body.error.code]).toEqual([404, "CFG_005"]);
    spy.mockRestore();
    expect(h.emitted).toBeDefined();
  });
});
