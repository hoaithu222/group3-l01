import { installMocks, redisStore } from "./meetings-test-mocks";
import { buildMeetingsApp, cleanupWorld, drainMeetingOutbox, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, type MeetingsHarness, type World } from "./meetings-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("meetings — người tham dự, vai trò, RSVP, chuyển chủ trì, resolve (integration, Mongo memory replset)", () => {
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

  const created = async (uid = w.u.C!, over: Record<string, unknown> = {}) => {
    const res = await api("post", `/workspaces/${w.workspaceId}/meetings`, uid, meetingBody(over), idemKey());
    expect(res.status).toBe(201);
    return res.body.data as { id: string; code: string; version: number };
  };
  const row = (meetingId: string, userId: string) => prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId, userId } } });

  it("thêm người: added/alreadyAttending/rejected; attendeeCount tăng nguyên tử; khôi phục người đã bị xoá; outbox attendees-changed; CO_HOST chỉ HOST cấp", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    const res = await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.D!, w.u.E!, w.u.X!, w.u.C!] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ added: [w.u.E], alreadyAttending: [w.u.D], rejected: [{ userId: w.u.X, code: "MEET_014" }] });
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))).toMatchObject({ attendeeCount: 3, version: 2 });
    const evt = await prisma.outboxEvent.findFirst({ where: { aggregateId: m.id, type: "meeting.attendees-changed", dedupeKey: { endsWith: ":v2" } } });
    expect(evt!.payload).toMatchObject({ added: [{ userId: w.u.E, role: "ATTENDEE" }], removed: [], wasLive: false, actorId: w.u.C });

    // ATTENDEE (D) không thêm được người; người ngoài không thấy cuộc họp
    expect((await api("post", `/meetings/${m.id}/attendees`, w.u.D!, { userIds: [w.u.B!] })).status).toBe(403);
    expect((await api("post", `/meetings/${m.id}/attendees`, w.u.X!, { userIds: [w.u.B!] })).status).toBe(404);

    // xoá rồi thêm lại → khôi phục (removedAt=null, rsvp về PENDING)
    await api("put", `/meetings/${m.id}/rsvp`, w.u.E!, { rsvp: "ACCEPTED" });
    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.E}`, w.u.C!)).status).toBe(204);
    expect((await row(m.id, w.u.E!))!.removedAt).not.toBeNull();
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.attendeeCount).toBe(2);
    const back = await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.E!] });
    expect(back.body.data.added).toEqual([w.u.E]);
    expect(await row(m.id, w.u.E!)).toMatchObject({ removedAt: null, removedBy: null, rsvp: "PENDING" });

    // CO_HOST chỉ HOST được cấp
    expect((await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.B!], role: "CO_HOST" })).body.data.added).toEqual([w.u.B]);
    await api("put", `/meetings/${m.id}/attendees/${w.u.D}/role`, w.u.C!, { role: "CO_HOST" });
    const byCoHost = await api("post", `/meetings/${m.id}/attendees`, w.u.D!, { userIds: [w.u.A!], role: "CO_HOST" });
    expect([byCoHost.status, byCoHost.body.error.code]).toEqual([403, "MEET_002"]);
  });

  it("trần người tham dự kiểm nguyên tử: 4 lượt thêm song song (1 người/lượt) khi còn 3 chỗ → đúng 3 thành công, 1 lượt 409 MEET_005", async () => {
    h = installHarness({ limits: () => Promise.resolve({ attendeesMax: 4, remindersMax: 3, joinWindowMinutes: 10, maxParticipants: 50, maxMinutes: 240 }) });
    const m = await created(w.u.C!);
    const users = [w.u.A!, w.u.B!, w.u.D!, w.u.E!];
    const results = await Promise.all(users.map((uid) => api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [uid] })));
    const ok = results.filter((r) => r.status === 200).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === "MEET_005").length;
    expect([ok, full]).toEqual([3, 1]);
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.attendeeCount).toBe(4);
    expect(await prisma.meetingAttendee.count({ where: { meetingId: m.id, removedAt: null } })).toBe(4);
  }, 60_000);

  it("MT-09: CO_HOST không xoá được HOST/CO_HOST; xoá người thường → mất quyền xem (404), attendeeCount−1, handler: thông báo MEETING_REMOVED + socket attendee-removed + rời room + ICS CANCEL", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], coHostIds: [w.u.E!] });
    await drainMeetingOutbox(h);
    h.emitted.length = 0;
    h.notified.length = 0;
    h.icsJobs.length = 0;
    const blocked = await api("delete", `/meetings/${m.id}/attendees/${w.u.E}`, w.u.E!);
    expect([blocked.status, blocked.body.error.code]).toEqual([403, "MEET_002"]);
    const noHost = await api("delete", `/meetings/${m.id}/attendees/${w.u.C}`, w.u.E!);
    expect([noHost.status, noHost.body.error.code]).toEqual([409, "MEET_016"]);

    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.D}`, w.u.E!)).status).toBe(204);
    expect((await api("get", `/meetings/${m.id}`, w.u.D!)).status).toBe(404); // MT-09: mất quyền xem
    await drainMeetingOutbox(h);
    expect(h.notified.find((n) => n.type === "meeting.removed")).toMatchObject({ recipients: [{ userId: w.u.D }] });
    expect(h.eventsTo(w.u.D!, "meeting:attendee-removed")[0]!.payload).toMatchObject({ meetingId: m.id, userId: w.u.D });
    expect(h.emitted.some((e) => e.target === "leave" && (e.to as string[]).includes(w.u.D!) && (e.payload.rooms as string[]).includes(`meet:${m.id}`))).toBe(true);
    expect(h.icsJobs).toEqual([expect.objectContaining({ meetingId: m.id, userId: w.u.D, kind: "CANCEL" })]);
  });

  it("tự rút: ATTENDEE rút được (SCHEDULED); HOST → 409 MEET_016 (chuyển chủ trì trước); người không tham dự → 404", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    const host = await api("delete", `/meetings/${m.id}/attendees/me`, w.u.C!);
    expect([host.status, host.body.error.code]).toEqual([409, "MEET_016"]);
    expect((await api("delete", `/meetings/${m.id}/attendees/me`, w.u.D!)).status).toBe(204);
    expect((await api("delete", `/meetings/${m.id}/attendees/me`, w.u.D!)).status).toBe(404);
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.attendeeCount).toBe(1);
  });

  it("danh sách người tham dự đóng băng khi ENDED/CANCELLED (MEET_009); LIVE vẫn thêm/xoá được và outbox mang wasLive", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "LIVE" } });
    expect((await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.E!] })).status).toBe(200);
    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.D}`, w.u.C!)).status).toBe(204);
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: m.id, type: "meeting.attendees-changed" } });
    expect(events.every((e) => (e.payload as { wasLive: boolean }).wasLive)).toBe(true);
    expect((await api("delete", `/meetings/${m.id}/attendees/me`, w.u.E!)).status).toBe(409); // tự rút chỉ SCHEDULED

    await prisma.meeting.update({ where: { id: m.id }, data: { status: "ENDED" } });
    const frozen = await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.B!] });
    expect([frozen.status, frozen.body.error.code]).toEqual([409, "MEET_009"]);
    expect((await api("delete", `/meetings/${m.id}/attendees/${w.u.E}`, w.u.C!)).status).toBe(409);
  });

  it("danh sách attendee (cursor tăng dần, không lộ email, avatar ký sẵn); người chỉ xem metadata → 403", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!, w.u.B!] });
    const avatarC = "65f0000000000000000000ab"; // chỉ C (HOST) có ảnh
    await prisma.user.update({ where: { id: w.u.C! }, data: { avatarAssetId: avatarC } });
    const page1 = await api("get", `/meetings/${m.id}/attendees?limit=2`, w.u.D!);
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta).toMatchObject({ hasMore: true, limit: 2 });
    const page2 = await api("get", `/meetings/${m.id}/attendees?limit=2&cursor=${page1.body.meta.nextCursor}`, w.u.D!);
    const ids = [...page1.body.data, ...page2.body.data].map((a: { userId: string }) => a.userId);
    expect(new Set(ids).size).toBe(4);
    expect(page2.body.meta.hasMore).toBe(false);
    expect(JSON.stringify([...page1.body.data, ...page2.body.data])).not.toContain("@e.com");
    expect(page1.body.data[0]).toMatchObject({ role: "HOST", name: "Người C", rsvp: "ACCEPTED" });
    expect(page1.body.data[0].avatarUrl).toMatch(new RegExp(`/api/v1/assets/${avatarC}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`));
    const others = [...page1.body.data, ...page2.body.data].filter((a: { userId: string }) => a.userId !== w.u.C);
    expect(others.map((a: { avatarUrl: string | null }) => a.avatarUrl)).toEqual([null, null, null]);
    const metaOnly = await api("get", `/meetings/${m.id}/attendees`, w.u.A!);
    expect([metaOnly.status, metaOnly.body.error.code]).toEqual([403, "PERM_004"]);
  });

  it("vai trò: HOST cấp/thu CO_HOST; CO_HOST không cấp; không đổi được HOST; transfer-host đổi vai + hostId + version, đúng MỘT host", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!] });
    const grant = await api("put", `/meetings/${m.id}/attendees/${w.u.D}/role`, w.u.C!, { role: "CO_HOST" });
    expect(grant.body.data).toMatchObject({ userId: w.u.D, role: "CO_HOST", name: "Người D" });
    const byCoHost = await api("put", `/meetings/${m.id}/attendees/${w.u.E}/role`, w.u.D!, { role: "CO_HOST" });
    expect([byCoHost.status, byCoHost.body.error.code]).toEqual([403, "MEET_002"]);
    const onHost = await api("put", `/meetings/${m.id}/attendees/${w.u.C}/role`, w.u.C!, { role: "ATTENDEE" });
    expect([onHost.status, onHost.body.error.code]).toEqual([409, "MEET_016"]);
    expect((await api("put", `/meetings/${m.id}/attendees/${w.u.D}/role`, w.u.C!, { role: "ATTENDEE" })).body.data.role).toBe("ATTENDEE");

    const cur = (await prisma.meeting.findUnique({ where: { id: m.id } }))!;
    const stale = await api("post", `/meetings/${m.id}/transfer-host`, w.u.C!, { toUserId: w.u.D!, expectedVersion: cur.version - 1 });
    expect([stale.status, stale.body.error.code]).toEqual([409, "RES_003"]);
    const notAttendee = await api("post", `/meetings/${m.id}/transfer-host`, w.u.C!, { toUserId: w.u.X!, expectedVersion: cur.version });
    expect([notAttendee.status, notAttendee.body.error.code]).toEqual([400, "MEET_014"]);
    const self = await api("post", `/meetings/${m.id}/transfer-host`, w.u.C!, { toUserId: w.u.C!, expectedVersion: cur.version });
    expect(self.status).toBe(400);
    const nonHost = await api("post", `/meetings/${m.id}/transfer-host`, w.u.D!, { toUserId: w.u.E!, expectedVersion: cur.version });
    expect([nonHost.status, nonHost.body.error.code]).toEqual([403, "MEET_002"]);

    const ok = await api("post", `/meetings/${m.id}/transfer-host`, w.u.C!, { toUserId: w.u.D!, expectedVersion: cur.version });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ hostId: w.u.D, myRole: "CO_HOST", version: cur.version + 1 });
    const hosts = await prisma.meetingAttendee.findMany({ where: { meetingId: m.id, role: "HOST", removedAt: null } });
    expect(hosts.map((a) => a.userId)).toEqual([w.u.D]);
    expect((await row(m.id, w.u.C!))!.role).toBe("CO_HOST");
    expect(await prisma.auditLog.count({ where: { action: "meeting.transfer-host", targetId: m.id } })).toBe(1);
    // host cũ giờ là CO_HOST: không đổi vai trò được nữa
    expect((await api("put", `/meetings/${m.id}/attendees/${w.u.E}/role`, w.u.C!, { role: "CO_HOST" })).status).toBe(403);
  });

  it("RSVP chỉ thông tin: attendee đặt được, không tăng version, HOST/CO_HOST nhận socket có rsvpSummary; người không tham dự 403; không chặn vào phòng", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], visibility: "WORKSPACE" });
    const res = await api("put", `/meetings/${m.id}/rsvp`, w.u.D!, { rsvp: "DECLINED" });
    expect(res.status).toBe(200);
    expect(res.body.data.rsvp).toBe("DECLINED");
    expect((await prisma.meeting.findUnique({ where: { id: m.id } }))!.version).toBe(1);
    expect(await row(m.id, w.u.D!)).toMatchObject({ rsvp: "DECLINED", rsvpAt: expect.any(Date) });
    const toHost = h.eventsTo(w.u.C!, "meeting:updated")[0]!;
    expect(toHost.payload).toMatchObject({ meetingId: m.id, changedFields: ["rsvp"], rsvpSummary: { DECLINED: 1, ACCEPTED: 1 } });
    expect(h.eventsTo(w.u.D!, "meeting:updated")).toHaveLength(0);
    expect((await api("put", `/meetings/${m.id}/rsvp`, w.u.E!, { rsvp: "ACCEPTED" })).status).toBe(403); // thành viên WS xem được nhưng không có RSVP
    expect((await api("put", `/meetings/${m.id}/rsvp`, w.u.D!, { rsvp: "MAYBE" })).status).toBe(400);
    const detail = await api("get", `/meetings/${m.id}`, w.u.D!);
    expect(detail.body.data.myRsvp).toBe("DECLINED");
  });

  it("MT-11: resolve mã họp — không tồn tại/không đủ quyền → allowed:false trung tính; attendee LIVE → JOIN; thành viên WS LIVE lobby → LOBBY; bị xoá → REMOVED; huỷ → DETAIL", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], visibility: "WORKSPACE" });
    const resolve = (uid: string, code = m.code) => api("get", `/meetings/resolve/${code}`, uid);

    expect((await resolve(w.u.D!, "abc-defg-hjk")).body.data).toEqual({ allowed: false, reason: "NOT_AVAILABLE" });
    expect((await resolve(w.u.X!)).body.data).toEqual({ allowed: false, reason: "NOT_AVAILABLE" }); // không thuộc workspace
    expect((await resolve(w.u.D!)).body.data).toMatchObject({ allowed: true, target: "DETAIL", meetingId: m.id, status: "SCHEDULED" }); // chưa tới giờ vào
    expect((await api("get", "/meetings/resolve/INVALID", w.u.D!)).status).toBe(400);

    await prisma.meeting.update({ where: { id: m.id }, data: { status: "LIVE" } });
    expect((await resolve(w.u.D!)).body.data).toMatchObject({ allowed: true, target: "JOIN" });
    expect((await resolve(w.u.E!)).body.data).toMatchObject({ allowed: true, target: "LOBBY" }); // thành viên WS, visibility WORKSPACE, lobby ≠ OFF
    expect((await resolve(w.u.G!)).body.data).toEqual({ allowed: false, reason: "NOT_AVAILABLE" }); // GUEST không thấy WORKSPACE-visibility

    await prisma.meeting.update({ where: { id: m.id }, data: { visibility: "ATTENDEES" } });
    expect((await resolve(w.u.E!)).body.data).toEqual({ allowed: false, reason: "NOT_AVAILABLE" });
    expect((await resolve(w.u.A!)).body.data).toMatchObject({ allowed: true, target: "DETAIL" }); // OWNER: metadata

    await prisma.meetingAttendee.updateMany({ where: { meetingId: m.id, userId: w.u.D! }, data: { removedAt: new Date() } });
    expect((await resolve(w.u.D!)).body.data).toEqual({ allowed: false, reason: "REMOVED" });
    await prisma.meeting.update({ where: { id: m.id }, data: { status: "CANCELLED" } });
    expect((await resolve(w.u.C!)).body.data).toMatchObject({ allowed: true, target: "DETAIL", status: "CANCELLED" });
    await prisma.meeting.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
    expect((await resolve(w.u.C!)).body.data).toEqual({ allowed: false, reason: "NOT_AVAILABLE" });
  });
});
