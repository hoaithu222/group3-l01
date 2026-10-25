import { installMocks, redisStore } from "./meetings-test-mocks";
import { buildMeetingsApp, cleanupWorld, drainMeetingOutbox, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, type MeetingsHarness, type World } from "./meetings-test-kit";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

/**
 * be.md §7 "Ma trận thông báo": chỉ đổi giờ/địa điểm/link mới push (`meeting.updated`); đổi tiêu đề/nội dung chỉ socket; email `.ics` gửi lại khi
 * đổi giờ/địa điểm/link/TIÊU ĐỀ (mục lịch của khách phải khớp) nhưng KHÔNG khi chỉ đổi nội dung/nhắc/lobby. `SEQUENCE` = version, luôn tăng.
 */
describe("meetings — sửa cuộc họp: đổi gì thì push / ICS / chỉ socket (integration, Mongo memory replset)", () => {
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

  const created = async () => {
    const res = await api("post", `/workspaces/${w.workspaceId}/meetings`, w.u.C!, meetingBody({ attendeeIds: [w.u.D!], reminderMinutes: [15] }), idemKey());
    expect(res.status).toBe(201);
    await drainMeetingOutbox(h);
    h.emitted.length = 0;
    h.icsJobs.length = 0;
    h.notified.length = 0;
    h.reminders.scheduled.length = 0;
    h.reminders.cancelled.length = 0;
    return res.body.data as { id: string };
  };
  /** PATCH rồi chạy handler outbox; trả kết quả các kênh MÀ NGƯỜI THAM DỰ D (không phải người sửa) nhận. */
  const edit = async (id: string, version: number, body: Record<string, unknown>) => {
    const res = await api("patch", `/meetings/${id}`, w.u.C!, { ...body, expectedVersion: version });
    expect(res.status).toBe(200);
    h.emitted.length = 0;
    h.icsJobs.length = 0;
    h.notified.length = 0;
    h.reminders.scheduled.length = 0;
    h.reminders.cancelled.length = 0;
    await drainMeetingOutbox(h);
    return {
      version: res.body.data.version as number,
      push: h.notified.filter((n) => n.type === "meeting.updated"),
      ics: [...h.icsJobs], // sao chép: harness dùng lại cùng một mảng cho lần sửa sau
      socket: h.eventsTo(w.u.D!, "meeting:updated"),
    };
  };

  it("chỉ đổi nội dung (agenda): KHÔNG push, KHÔNG ICS — chỉ socket meeting:updated kèm changedFields", async () => {
    const m = await created();
    const r = await edit(m.id, 1, { agenda: "Chương trình mới" });
    expect(r.push).toHaveLength(0);
    expect(r.ics).toHaveLength(0);
    expect(r.socket).toHaveLength(1);
    expect(r.socket[0]!.payload).toMatchObject({ meetingId: m.id, changedFields: ["agenda"], status: "SCHEDULED" });
  });

  it("chỉ đổi lobby/nhắc: không push, không ICS; đổi nhắc thì job nhắc được đặt lại theo mốc mới", async () => {
    const m = await created();
    const lobby = await edit(m.id, 1, { lobbyMode: "OFF" });
    expect([lobby.push.length, lobby.ics.length, lobby.socket.length]).toEqual([0, 0, 1]);
    // handler luôn đặt lại nhắc khi có `updated` (be.md §7): cùng (mốc, giờ) ⇒ cùng jobId nên BullMQ không nhân đôi
    expect([h.reminders.cancelled.map((r) => r.minutes), h.reminders.scheduled.map((r) => r.minutes)]).toEqual([[15], [15]]);
    const rem = await edit(m.id, lobby.version, { reminderMinutes: [30] });
    expect([rem.push.length, rem.ics.length]).toEqual([0, 0]);
    expect(h.reminders.cancelled.map((r) => r.minutes)).toEqual([15]);
    expect(h.reminders.scheduled.map((r) => r.minutes)).toEqual([30]);
  });

  it("đổi tiêu đề: gửi lại ICS (mục lịch của khách phải khớp) nhưng không push", async () => {
    const m = await created();
    const r = await edit(m.id, 1, { title: "Tiêu đề mới" });
    expect(r.push).toHaveLength(0);
    expect(r.ics.map((j) => [j.userId, j.kind, j.sequence, j.updated])).toEqual([[w.u.D, "REQUEST", 2, true]]);
    expect(r.socket).toHaveLength(1);
  });

  it("đổi địa điểm: vừa push meeting.updated (không gửi cho người sửa) vừa ICS; SEQUENCE tăng đơn điệu theo version qua nhiều lần sửa", async () => {
    const m = await created();
    const agenda = await edit(m.id, 1, { agenda: "a" }); // v2 — không ICS
    const title = await edit(m.id, agenda.version, { title: "Tên khác" }); // v3
    const place = await edit(m.id, title.version, { location: "Phòng 5, tầng 3" }); // v4
    expect([agenda.version, title.version, place.version]).toEqual([2, 3, 4]);
    expect(place.push).toHaveLength(1);
    expect(place.push[0]!.recipients).toEqual([{ userId: w.u.D }]); // chủ trì (người sửa) không nhận push
    expect(place.push[0]!.refs).toMatchObject({ meetingId: m.id, version: 4 });
    expect(place.ics.map((j) => [j.userId, j.sequence])).toEqual([[w.u.D, 4]]);
    expect(title.ics.map((j) => j.sequence)).toEqual([3]);
    expect(agenda.ics).toHaveLength(0);
    // Người sửa (chủ trì) không có việc ICS/push nào cho chính mình ở mọi lần sửa.
    for (const r of [agenda, title, place]) expect(r.ics.every((j) => j.userId !== w.u.C)).toBe(true);
  });

  it("đổi giờ: push + ICS (updated=true) + đặt lại nhắc; ICS gửi bằng email mang UID cũ và SEQUENCE mới, DTSTART mới", async () => {
    const m = await created();
    const before = (await prisma.meeting.findUnique({ where: { id: m.id } }))!;
    const newStart = new Date(before.startAt.getTime() + 45 * 60_000);
    const r = await edit(m.id, 1, { startAt: newStart.toISOString(), endAt: new Date(before.endAt.getTime() + 45 * 60_000).toISOString() });
    expect(r.push).toHaveLength(1);
    expect(r.ics).toEqual([expect.objectContaining({ userId: w.u.D, kind: "REQUEST", sequence: 2, updated: true })]);
    expect(h.reminders.scheduled).toEqual([expect.objectContaining({ minutes: 15, startAt: newStart })]);

    await h.container.ics.sendOne(m.id, w.u.D!, "REQUEST", 2, true);
    const mail = h.mails[h.mails.length - 1]!;
    expect(mail.subject).toContain("Cập nhật cuộc họp");
    const ics = mail.icalEvent!.content as string;
    expect(ics).toContain(`UID:${m.id}@superapp.vcijsc.com`);
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain(`DTSTART:${newStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
  });
});
