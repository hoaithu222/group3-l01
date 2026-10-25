import { installMocks, redisStore } from "./meetings-test-mocks";
import { buildMeetingsApp, cleanupWorld, drainMeetingOutbox, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, slot, type MeetingsHarness, type World } from "./meetings-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { revokeScope, setPermissionPorts, resetPermissionPorts, clearRevokeListeners, registerRevokeListener } from "../../../../core/permission";
import { reminderJobId } from "../../services/meeting-jobs.port";
import type { MeetingRevocationInput } from "../../services/meeting-lifecycle.service";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";

const app = buildMeetingsApp();
const api = makeApi(app);

describe("meetings — outbox → nhắc, thông báo, socket, ICS, nhóm chat, vòng đời workspace (integration, Mongo memory replset)", () => {
  const worlds: World[] = [];
  let h: MeetingsHarness;
  let w: World;

  let socketHarness: Harness;

  beforeAll(async () => {
    await ensureMeetingIndexes();
    socketHarness = await startHarness(); // Socket.IO thật cho hook nhóm chat (phát conversation:updated)
  });

  afterAll(async () => {
    await stopHarness(socketHarness);
  });

  beforeEach(async () => {
    installMocks();
    h = installHarness();
    setPermissionPorts({ realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() }, outbox: { enqueueNow: () => Promise.resolve() } });
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    clearRevokeListeners();
    resetPermissionPorts();
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
  });

  const created = async (uid = w.u.C!, over: Record<string, unknown> = {}) => {
    const res = await api("post", `/workspaces/${w.workspaceId}/meetings`, uid, meetingBody(over), idemKey());
    expect(res.status).toBe(201);
    return res.body.data as { id: string; code: string; version: number; startAt: string };
  };
  const notificationsOf = async (userId: string, type: string) =>
    prisma.notificationRecipient.count({ where: { recipientId: userId, notification: { type } } });

  it("meeting.created: đặt nhắc theo mốc, thông báo mời (trừ chủ trì), socket meeting:invited, ICS REQUEST cho từng người, đồng bộ nhóm chat khi createChatGroup", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], reminderMinutes: [15, 60], createChatGroup: true });
    await drainMeetingOutbox(h);
    expect(h.reminders.scheduled.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([15, 60]);
    expect(new Set(h.reminders.scheduled.map((r) => r.startAt.toISOString()))).toEqual(new Set([m.startAt]));
    const invited = h.notified.find((n) => n.type === "meeting.invited")!;
    expect(invited.recipients.map((r) => r.userId).sort()).toEqual([w.u.D, w.u.E].sort());
    expect(invited).toMatchObject({ scope: { type: "MEETING", id: m.id }, workspaceId: w.workspaceId, actorId: w.u.C });
    expect(h.eventsTo(w.u.D!, "meeting:invited")[0]!.payload).toMatchObject({ meetingId: m.id, role: "ATTENDEE", hostId: w.u.C });
    expect(h.eventsTo(w.u.C!, "meeting:invited")).toHaveLength(0);
    expect(h.icsJobs.map((j) => [j.userId, j.kind, j.sequence]).sort()).toEqual([[w.u.D, "REQUEST", 1], [w.u.E, "REQUEST", 1]].sort());
    expect(h.syncJobs).toEqual([{ meetingId: m.id, version: 1, archive: false }].map((x) => expect.objectContaining({ meetingId: x.meetingId, version: 1 })));
  });

  it("MT-06: dời giờ 30 phút → job nhắc CŨ bị xoá theo (mốc, startAt cũ) và job mới đặt theo startAt mới; job cũ nếu vẫn chạy thì no-op (lệch startAt)", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], reminderMinutes: [15] });
    await drainMeetingOutbox(h);
    h.reminders.scheduled.length = 0;
    const oldStart = new Date(m.startAt);
    const newStart = new Date(oldStart.getTime() + 30 * 60_000);
    const newEnd = new Date(newStart.getTime() + 60 * 60_000);
    const res = await api("patch", `/meetings/${m.id}`, w.u.C!, { startAt: newStart.toISOString(), endAt: newEnd.toISOString(), expectedVersion: 1 });
    expect(res.status).toBe(200);
    await drainMeetingOutbox(h);

    expect(h.reminders.cancelled).toEqual([{ meetingId: m.id, minutes: 15, startAt: oldStart }]);
    expect(h.reminders.scheduled).toEqual([{ meetingId: m.id, minutes: 15, startAt: newStart }]);
    expect(reminderJobId(m.id, 15, oldStart)).not.toBe(reminderJobId(m.id, 15, newStart));
    expect(h.notified.find((n) => n.type === "meeting.updated")!.recipients).toEqual([{ userId: w.u.D }]); // trừ actor
    expect(h.eventsTo(w.u.D!, "meeting:updated")[0]!.payload).toMatchObject({ changedFields: expect.arrayContaining(["startAt"]), status: "SCHEDULED" });
    expect(h.icsJobs.filter((j) => j.userId === w.u.D && j.updated)).toEqual([expect.objectContaining({ kind: "REQUEST", sequence: 2 })]);

    // job cũ vẫn chạy (không kịp xoá) → no-op; job mới chạy → nhắc đúng một lần
    expect(await h.container.reminders.fire({ meetingId: m.id, minutes: 15, startAtMs: oldStart.getTime() })).toBe(0);
    expect(await h.container.reminders.fire({ meetingId: m.id, minutes: 15, startAtMs: newStart.getTime() })).toBe(2);
    expect(h.notified.filter((n) => n.type === "meeting.reminder")).toHaveLength(1);
  });

  it("MT-07: job nhắc chạy lặp (retry/2 worker nối tiếp) → MỘT thông báo cho mỗi người (dedupeKey theo mốc + startAt)", async () => {
    h = installHarness({ realNotify: true });
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], reminderMinutes: [15] });
    const job = { meetingId: m.id, minutes: 15, startAtMs: new Date(m.startAt).getTime() };
    expect(await h.container.reminders.fire(job)).toBe(3);
    expect(await h.container.reminders.fire(job)).toBe(3); // chạy lại: notify() idempotent theo dedupeKey
    expect(await h.container.reminders.fire(job)).toBe(3);
    for (const uid of [w.u.C!, w.u.D!, w.u.E!]) expect(await notificationsOf(uid, "meeting.reminder")).toBe(1);
    expect(await prisma.notification.count({ where: { workspaceId: w.workspaceId, type: "meeting.reminder" } })).toBe(1);
  });

  it("nhắc chỉ khi còn SCHEDULED/chưa xoá/mốc còn trong danh sách; huỷ rồi thì no-op", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], reminderMinutes: [15] });
    const job = { meetingId: m.id, minutes: 15, startAtMs: new Date(m.startAt).getTime() };
    expect(await h.container.reminders.fire({ ...job, minutes: 30 })).toBe(0); // mốc không còn trong danh sách
    await api("post", `/meetings/${m.id}/cancel`, w.u.C!, { expectedVersion: 1 });
    expect(await h.container.reminders.fire(job)).toBe(0);
    expect(h.notified.filter((n) => n.type === "meeting.reminder")).toHaveLength(0);
  });

  it("MT-16: notifyVia=CHAT nhưng không có nhóm chat → nhắc rơi về APP (thông báo); notifyVia=APP không ghi tin chat", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], notifyVia: "CHAT", reminderMinutes: [15] });
    const job = { meetingId: m.id, minutes: 15, startAtMs: new Date(m.startAt).getTime() };
    expect(await h.container.reminders.fire(job)).toBe(2);
    expect(h.notified.filter((n) => n.type === "meeting.reminder")).toHaveLength(1);
    expect(await prisma.message.count({ where: { systemType: "MEETING_REMINDER", workspaceId: w.workspaceId } })).toBe(0);
  });

  it("nhóm chat họp: sync tạo nhóm (chủ trì OWNER, đồng chủ trì ADMIN, người còn lại MEMBER), đồng bộ thêm/xoá; nhắc BOTH ghi MỘT tin MEETING_REMINDER; huỷ → nhóm ARCHIVED (chỉ đọc)", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], coHostIds: [w.u.D!], createChatGroup: true, notifyVia: "BOTH", reminderMinutes: [15] });
    expect(await h.container.conversationSync.sync({ meetingId: m.id })).toBe("SYNCED");
    const meeting = await prisma.meeting.findUnique({ where: { id: m.id } });
    expect(meeting!.conversationId).not.toBeNull();
    w.conversationIds.push(meeting!.conversationId!);
    const members = await prisma.conversationMember.findMany({ where: { conversationId: meeting!.conversationId!, status: "ACTIVE" } });
    expect(Object.fromEntries(members.map((x) => [x.userId, x.role]))).toEqual({ [w.u.C!]: "OWNER", [w.u.D!]: "ADMIN", [w.u.E!]: "MEMBER" });
    expect(await h.container.conversationSync.sync({ meetingId: m.id })).toBe("SYNCED"); // idempotent
    expect(await prisma.conversation.count({ where: { meetingId: m.id } })).toBe(1);

    await api("delete", `/meetings/${m.id}/attendees/${w.u.E}`, w.u.C!);
    await h.container.conversationSync.sync({ meetingId: m.id });
    expect((await prisma.conversationMember.findMany({ where: { conversationId: meeting!.conversationId!, status: "ACTIVE" } })).map((x) => x.userId).sort()).toEqual([w.u.C, w.u.D].sort());

    const job = { meetingId: m.id, minutes: 15, startAtMs: new Date(m.startAt).getTime() };
    await h.container.reminders.fire(job);
    await h.container.reminders.fire(job); // chạy lại: tin nhắc dedupe theo khoá — vẫn MỘT tin
    const reminders = await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: meeting!.conversationId!, systemType: "MEETING_REMINDER" } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.systemPayload).toMatchObject({ meetingId: m.id, minutesBefore: 15, title: "Họp tuần" });

    // huỷ: handler xếp job archive, job chạy → nhóm chat ARCHIVED (không giải tán)
    const cancel = await api("post", `/meetings/${m.id}/cancel`, w.u.C!, { expectedVersion: (await prisma.meeting.findUnique({ where: { id: m.id } }))!.version });
    expect(cancel.status).toBe(200);
    await drainMeetingOutbox(h);
    expect(h.syncJobs.some((j) => j.meetingId === m.id && j.archive)).toBe(true);
    expect(await h.container.conversationSync.sync({ meetingId: m.id, archive: true })).toBe("ARCHIVED");
    expect((await prisma.conversation.findUnique({ where: { id: meeting!.conversationId! } }))).toMatchObject({ status: "ARCHIVED" });
  });

  it("MT-08 (handler): huỷ → nhắc bị xoá, thông báo meeting.cancelled (trừ người huỷ), socket meeting:cancelled, ICS CANCEL cùng UID/SEQUENCE=version", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], reminderMinutes: [15, 60] });
    await drainMeetingOutbox(h);
    h.emitted.length = 0;
    h.icsJobs.length = 0;
    await api("post", `/meetings/${m.id}/cancel`, w.u.C!, { expectedVersion: 1, reason: "Hoãn" });
    await drainMeetingOutbox(h);
    expect(h.reminders.cancelled.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([15, 60]);
    expect(h.notified.find((n) => n.type === "meeting.cancelled")!.recipients.map((r) => r.userId).sort()).toEqual([w.u.D, w.u.E].sort());
    expect(h.eventsTo(w.u.D!, "meeting:cancelled")[0]!.payload).toMatchObject({ meetingId: m.id, cancelReason: "Hoãn", byAdmin: false });
    expect(h.emitted.some((e) => e.target === "room" && e.event === "meeting:cancelled" && e.to === `meet:${m.id}`)).toBe(true);
    expect(h.icsJobs.map((j) => [j.userId, j.kind, j.sequence]).sort()).toEqual([[w.u.D, "CANCEL", 2], [w.u.E, "CANCEL", 2]].sort());
  });

  it("email .ics: REQUEST/cập nhật/CANCEL gắn icalEvent đúng method, UID ổn định, link /m/<mã>; người đã bị xoá không nhận REQUEST; SMTP lỗi → ném để job retry", async () => {
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!], title: "Họp <b>quan trọng</b>", location: "Phòng 3, tầng 2" });
    expect(await h.container.ics.sendOne(m.id, w.u.D!, "REQUEST", 1)).toBe(true);
    const req = h.mails[0]!;
    expect(req).toMatchObject({ to: `${w.u.D}@e.com`, subject: "Lời mời họp: Họp <b>quan trọng</b>", icalEvent: { method: "REQUEST" } });
    expect(req.html).toContain("Họp &lt;b&gt;quan trọng&lt;/b&gt;"); // HTML đã escape
    expect(req.html).toContain(`/m/${m.code}`);
    expect(req.icalEvent!.content).toContain(`UID:${m.id}@superapp.vcijsc.com`);
    expect(req.icalEvent!.content).toContain("SEQUENCE:1");
    expect(req.icalEvent!.content).toContain("LOCATION:Phòng 3\\, tầng 2");

    await h.container.ics.sendOne(m.id, w.u.D!, "REQUEST", 2, true);
    expect(h.mails[1]!.subject).toContain("Cập nhật cuộc họp");
    await api("delete", `/meetings/${m.id}/attendees/${w.u.D}`, w.u.C!);
    expect(await h.container.ics.sendOne(m.id, w.u.D!, "REQUEST", 3)).toBe(false);
    expect(await h.container.ics.sendOne(m.id, w.u.D!, "CANCEL", 3)).toBe(true);
    expect(h.mails[2]).toMatchObject({ subject: "Huỷ cuộc họp: Họp <b>quan trọng</b>", icalEvent: { method: "CANCEL" } });
    expect(h.mails[2]!.icalEvent!.content).toContain("STATUS:CANCELLED");

    const failing = installHarness({ mail: { sendRaw: () => Promise.reject(new Error("SMTP down")) } });
    await expect(failing.container.ics.sendOne(m.id, w.u.C!, "REQUEST", 4)).rejects.toThrow("SMTP down");
  });

  it("MT-14: workspace lưu trữ → mọi cuộc SCHEDULED thành CANCELLED (WORKSPACE_ARCHIVED) + ICS CANCEL; cuộc LIVE để p2-05 xử lý", async () => {
    const a = await created(w.u.C!, { attendeeIds: [w.u.D!], title: "Họp 1" });
    const b = await created(w.u.D!, { title: "Họp 2" });
    const live = await created(w.u.C!, { title: "Đang họp" });
    await prisma.meeting.update({ where: { id: live.id }, data: { status: "LIVE" } });
    await prisma.meetingAttendee.updateMany({ where: { meetingId: live.id }, data: { meetingStatus: "LIVE" } });

    const result = await h.container.lifecycle.handle({ scopeType: "WORKSPACE", scopeId: w.workspaceId, userIds: [], reason: "ARCHIVED" });
    expect(result.cancelled).toBe(2);
    for (const id of [a.id, b.id]) expect(await prisma.meeting.findUnique({ where: { id } })).toMatchObject({ status: "CANCELLED", cancelReason: "WORKSPACE_ARCHIVED" });
    expect((await prisma.meeting.findUnique({ where: { id: live.id } }))!.status).toBe("LIVE");
    await drainMeetingOutbox(h);
    expect(h.icsJobs.filter((j) => j.kind === "CANCEL").map((j) => j.meetingId).sort()).toEqual([a.id, a.id, b.id].sort());
    // lặp lại: idempotent
    expect((await h.container.lifecycle.handle({ scopeType: "WORKSPACE", scopeId: w.workspaceId, userIds: [], reason: "ARCHIVED" })).cancelled).toBe(0);
  });

  it("MT-15: HOST bị loại khỏi workspace, có CO_HOST → CO_HOST thành HOST (audit + socket meeting:updated), HOST cũ bị bỏ khỏi danh sách; không có CO_HOST → SCHEDULED huỷ HOST_REMOVED; người thường bị bỏ khỏi mọi cuộc họp", async () => {
    const withCo = await created(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!], coHostIds: [w.u.D!] });
    const alone = await created(w.u.C!, { attendeeIds: [w.u.E!], title: "Không có đồng chủ trì" });
    const asAttendee = await created(w.u.D!, { attendeeIds: [w.u.C!], title: "C chỉ là người tham dự" });

    const res = await h.container.lifecycle.handle({ scopeType: "WORKSPACE", scopeId: w.workspaceId, userIds: [w.u.C!], reason: "REMOVED" });
    expect(res).toEqual({ cancelled: 1, removed: 2, transferred: 1 });
    const meeting = await prisma.meeting.findUnique({ where: { id: withCo.id } });
    expect([meeting!.hostId, meeting!.attendeeCount]).toEqual([w.u.D, 2]);
    expect((await prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId: withCo.id, userId: w.u.D! } } }))!.role).toBe("HOST");
    expect((await prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId: withCo.id, userId: w.u.C! } } }))!.removedAt).not.toBeNull();
    expect(await prisma.meetingAttendee.count({ where: { meetingId: withCo.id, role: "HOST", removedAt: null } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "meeting.transfer-host", targetId: withCo.id } })).toBe(1);
    expect(await prisma.meeting.findUnique({ where: { id: alone.id } })).toMatchObject({ status: "CANCELLED", cancelReason: "HOST_REMOVED" });
    expect((await prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId: asAttendee.id, userId: w.u.C! } } }))!.removedAt).not.toBeNull();

    await drainMeetingOutbox(h);
    expect(h.eventsTo(w.u.E!, "meeting:updated").some((e) => (e.payload.changedFields as string[]).includes("hostId"))).toBe(true);
    expect(h.notified.some((n) => n.type === "meeting.role-changed" && n.recipients[0]!.userId === w.u.D)).toBe(true);
  });

  it("revokeScope(WORKSPACE) → listener xếp job lifecycle (mô phỏng): thành viên bị loại bị bỏ khỏi cuộc họp; ROLE_CHANGED không ảnh hưởng", async () => {
    setPermissionPorts({ realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() }, outbox: { enqueueNow: () => Promise.resolve() } });
    clearRevokeListeners();
    registerRevokeListener("meetings.lifecycle", async (input) => {
      if (input.scope.type !== "WORKSPACE") return;
      await h.container.lifecycle.handle({ scopeType: input.scope.type, scopeId: input.scope.id, userIds: input.userIds, reason: input.reason } satisfies MeetingRevocationInput);
    });
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    await revokeScope({ scope: { type: "WORKSPACE", id: w.workspaceId }, userIds: [w.u.D!], reason: "ROLE_CHANGED", cascade: false });
    expect((await prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId: m.id, userId: w.u.D! } } }))!.removedAt).toBeNull();
    await prisma.workspaceMembership.updateMany({ where: { workspaceId: w.workspaceId, userId: w.u.D! }, data: { status: "REMOVED" } });
    await revokeScope({ scope: { type: "WORKSPACE", id: w.workspaceId }, userIds: [w.u.D!], reason: "REMOVED", cascade: false });
    expect((await prisma.meetingAttendee.findUnique({ where: { meetingId_userId: { meetingId: m.id, userId: w.u.D! } } }))!.removedAt).not.toBeNull();
    expect((await api("get", `/meetings/${m.id}`, w.u.D!)).status).toBe(404); // không còn thành viên workspace ⇒ mất quyền ngay
  });

  it("cron dự phòng: reconcile đặt lại job nhắc cho cuộc SCHEDULED trong 25 giờ tới, bỏ qua cuộc xa hơn/đã huỷ", async () => {
    const soon = await created(w.u.C!, { reminderMinutes: [15, 30], ...slot(180) });
    const far = await created(w.u.C!, { ...slot(60 * 30) });
    const cancelled = await created(w.u.C!, { ...slot(240) });
    await api("post", `/meetings/${cancelled.id}/cancel`, w.u.C!, { expectedVersion: 1 });
    h.reminders.scheduled.length = 0;
    expect(await h.container.reminders.reconcile()).toBe(1);
    expect(h.reminders.scheduled.map((r) => [r.meetingId, r.minutes]).sort()).toEqual([[soon.id, 15], [soon.id, 30]].sort());
    expect(h.reminders.scheduled.some((r) => r.meetingId === far.id)).toBe(false);
  });

  it("sink outbox: module khác (p2-05/p2-06) đăng ký sink nhận mọi sự kiện meeting.*", async () => {
    const { registerMeetingEventSink, clearMeetingEventSinks } = await import("../../index");
    const seen: string[] = [];
    registerMeetingEventSink("test", (p) => {
      seen.push(p.event);
      return Promise.resolve();
    });
    const m = await created(w.u.C!, { attendeeIds: [w.u.D!] });
    await api("post", `/meetings/${m.id}/attendees`, w.u.C!, { userIds: [w.u.E!] });
    await drainMeetingOutbox(h);
    clearMeetingEventSinks();
    expect(seen.sort()).toEqual(["attendees-changed", "created"]);
  });
});
