/**
 * Integration — Mentor Connect (p6-03 README §8), Mongo memory replset (`TEST_DB=memory`), processor job gọi tay:
 *   IR-01 chấp nhận → GUEST có hạn (nhãn MENTOR), chỉ thấy kênh chỉ định, không thấy danh sách thành viên, có nhóm chat;
 *   IR-02 hết hạn (cron `mentor.expire`) → mất quyền như thu hồi (API kênh/nhóm chat 404, rời nhóm chat, membership REMOVED/EXPIRED);
 *   IR-21 ứng tuyển 2 lần → 409 MENTOR_003; IR-22 hai ADMIN chấp nhận song song khi cần 1 → một 200, một 409 MENTOR_005;
 *   IR-23 thành viên ứng tuyển bài của nhóm → 400 MENTOR_004; IR-24 gia hạn vượt 90 ngày → 400 MENTOR_007;
 *   IR-25 3 người báo cáo bài → MỘT mục trong hàng đợi admin gộp 3 lượt.
 */
import { installMocks, processor } from "./mentor-test-mocks";
import { buildMentorApp, makeKit } from "./mentor-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
// Side-effect: đăng ký processor `mentor.*` vào `mockRegistered`.
import "../../jobs/mentor.jobs";

jest.setTimeout(120_000);

const app = buildMentorApp();
const kit = makeKit(app);
const DAY = 86_400_000;

async function outboxPayload(dedupeKey: string): Promise<Record<string, unknown>> {
  const row = await prisma.outboxEvent.findFirst({ where: { dedupeKey } });
  expect(row).not.toBeNull();
  return row?.payload as Record<string, unknown>;
}

describe("Mentor Connect — integration (IR-01, IR-02, IR-21..IR-25)", () => {
  beforeAll(() => bindPermissionPorts());
  afterAll(() => resetPermissionPorts());
  beforeEach(() => installMocks());
  afterEach(() => kit.cleanup());

  async function scenario() {
    const owner = await kit.seedUser("Chủ nhóm");
    const { workspaceId, defaultChannelId } = await kit.createWorkspace(owner);
    const admin = await kit.seedUser("Quản trị");
    const member = await kit.seedUser("Thành viên");
    await kit.addMember(workspaceId, admin, "ADMIN");
    await kit.addMember(workspaceId, member, "MEMBER");
    const otherPublic = await kit.createChannel(owner, workspaceId, "Thảo luận", "PUBLIC");
    const secret = await kit.createChannel(owner, workspaceId, "Bí mật", "PRIVATE");
    const mentor = await kit.seedUser("Cố vấn");
    const post = await kit.createPost(owner, workspaceId);
    return { owner, admin, member, mentor, workspaceId, defaultChannelId, otherPublic, secret, post };
  }

  async function acceptMentor(s: Awaited<ReturnType<typeof scenario>>) {
    const applied = await kit.apply(s.mentor, s.post.id);
    expect(applied.status).toBe(201);
    const res = await kit.call("post", s.owner, `/mentor/applications/${applied.body.data.id}/accept`, {
      durationDays: 30,
      channelIds: [s.defaultChannelId],
      createConversation: true,
      includeMemberIds: [s.member],
      expectedPostVersion: s.post.version,
    });
    expect(res.status).toBe(200);
    const engagementId = res.body.data.engagement.id as string;
    await processor("mentor.accepted-effects")({ data: await outboxPayload(`mentor.accepted:engagement:${engagementId}`) });
    const engagement = await prisma.mentorEngagement.findUniqueOrThrow({ where: { id: engagementId } });
    return { engagementId, conversationId: engagement.conversationId as string };
  }

  it("IR-01 — GUEST có hạn + nhãn MENTOR; chỉ kênh chỉ định; danh bạ thành viên 404; nhóm chat cố vấn có cố vấn + người đăng + người kèm", async () => {
    const s = await scenario();
    const { conversationId } = await acceptMentor(s);

    const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.mentor } } });
    expect(membership).toMatchObject({ role: "GUEST", status: "ACTIVE", displayTag: "MENTOR" });
    expect(Math.abs((membership.expiresAt as Date).getTime() - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

    expect((await kit.call("get", s.mentor, `/workspaces/${s.workspaceId}/members`)).status).toBe(404);
    expect((await kit.call("get", s.mentor, `/channels/${s.defaultChannelId}`)).status).toBe(200);
    expect((await kit.call("get", s.mentor, `/channels/${s.defaultChannelId}/messages`)).status).toBe(200);
    for (const ch of [s.otherPublic, s.secret]) expect((await kit.call("get", s.mentor, `/channels/${ch}`)).status).toBe(404);

    expect(conversationId).toBeTruthy();
    expect((await kit.call("get", s.mentor, `/conversations/${conversationId}`)).status).toBe(200);
    const members = await prisma.conversationMember.findMany({ where: { conversationId, status: "ACTIVE" }, select: { userId: true, role: true } });
    expect(members.map((m) => m.userId).sort()).toEqual([s.owner, s.member, s.mentor].sort());
    expect(members.find((m) => m.userId === s.owner)?.role).toBe("OWNER");
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(convo).toMatchObject({ kind: "GROUP", allowGuests: true, title: "Cố vấn · Cần cố vấn kiến trúc backend" });
    expect(await prisma.message.count({ where: { scopeId: conversationId, systemType: "MENTOR_JOINED" } })).toBe(1);

    const mine = await kit.call("get", s.mentor, "/me/mentor/engagements");
    expect(mine.body.data).toEqual([expect.objectContaining({ conversationId, workspace: expect.objectContaining({ id: s.workspaceId }) })]);
    const notifs = await prisma.notificationRecipient.findMany({ where: { recipientId: s.mentor }, include: { notification: true } });
    expect(notifs.map((n) => n.notification.type)).toContain("mentor.accepted");
  });

  it("IR-02 — hết hạn (cron mentor.expire) → ENDED(EXPIRED), membership REMOVED/EXPIRED, rời nhóm chat, API kênh + nhóm chat 404", async () => {
    const s = await scenario();
    const { engagementId, conversationId } = await acceptMentor(s);
    const past = new Date(Date.now() - 60_000);
    await prisma.mentorEngagement.update({ where: { id: engagementId }, data: { endsAt: past } });
    await prisma.workspaceMembership.updateMany({ where: { workspaceId: s.workspaceId, userId: s.mentor }, data: { expiresAt: past } });

    await processor("mentor.expire")({ data: {} });
    expect(await prisma.mentorEngagement.findUniqueOrThrow({ where: { id: engagementId } })).toMatchObject({ status: "ENDED", endedReason: "EXPIRED" });
    await processor("mentor.ended-effects")({ data: await outboxPayload(`mentor.ended:engagement:${engagementId}`) });

    const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.mentor } } });
    expect(membership).toMatchObject({ status: "REMOVED", leftReason: "EXPIRED", displayTag: null });
    expect(await prisma.conversationMember.findFirst({ where: { conversationId, userId: s.mentor } })).toMatchObject({ status: "REMOVED" });
    // Tin hệ thống `MENTOR_LEFT` (payload không có nội dung nhạy cảm) vào nhóm chat cố vấn — chạy lại job không đăng thêm.
    await processor("mentor.ended-effects")({ data: await outboxPayload(`mentor.ended:engagement:${engagementId}`) });
    const leftMessages = await prisma.message.findMany({ where: { scopeId: conversationId, systemType: "MENTOR_LEFT" } });
    expect(leftMessages).toHaveLength(1);
    expect(leftMessages[0]?.systemPayload).toEqual({ mentorId: s.mentor, reason: "EXPIRED" });
    expect((await kit.call("get", s.mentor, `/channels/${s.defaultChannelId}`)).status).toBe(404);
    expect((await kit.call("get", s.mentor, `/conversations/${conversationId}`)).status).toBe(404);
    // Nhóm chat vẫn giữ cho thành viên; bài trở lại OPEN (còn hạn) để tìm cố vấn khác.
    expect((await kit.call("get", s.member, `/conversations/${conversationId}`)).status).toBe(200);
    expect(await prisma.mentorPost.findUniqueOrThrow({ where: { id: s.post.id } })).toMatchObject({ status: "OPEN", activeEngagements: 0 });
  });

  it("OWNER loại cố vấn khỏi nhóm bằng tay (đường p1-02) → listener thu hồi quyền kết thúc đợt MEMBERSHIP_REVOKED, bài mở lại", async () => {
    const s = await scenario();
    const { engagementId } = await acceptMentor(s);
    const removed = await kit.call("post", s.owner, `/workspaces/${s.workspaceId}/members/${s.mentor}/remove`, { reason: "Kết thúc hợp tác sớm" });
    expect(removed.status).toBe(200);
    expect(await prisma.mentorEngagement.findUniqueOrThrow({ where: { id: engagementId } })).toMatchObject({ status: "ENDED", endedReason: "MEMBERSHIP_REVOKED" });
    expect(await prisma.mentorPost.findUniqueOrThrow({ where: { id: s.post.id } })).toMatchObject({ status: "OPEN", activeEngagements: 0 });
    // Hậu kỳ chạy lặp vô hại: khách đã bị gỡ → revoke SKIPPED, nhãn được xoá.
    await processor("mentor.ended-effects")({ data: await outboxPayload(`mentor.ended:engagement:${engagementId}`) });
    const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.mentor } } });
    expect(membership).toMatchObject({ status: "REMOVED", displayTag: null });
  });

  it("IR-21 — ứng tuyển 2 lần cùng bài → lần 2 409 MENTOR_003, chỉ một đơn", async () => {
    const s = await scenario();
    expect((await kit.apply(s.mentor, s.post.id)).status).toBe(201);
    const second = await kit.apply(s.mentor, s.post.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("MENTOR_003");
    expect(await prisma.mentorApplication.count({ where: { postId: s.post.id } })).toBe(1);
  });

  it("IR-22 — hai ADMIN chấp nhận hai đơn song song khi mentorsNeeded=1 → một 200, một 409 MENTOR_005", async () => {
    const s = await scenario();
    const other = await kit.seedUser("Cố vấn khác");
    const [a, b] = [await kit.apply(s.mentor, s.post.id), await kit.apply(other, s.post.id)];
    const body = { durationDays: 14, channelIds: [s.defaultChannelId], createConversation: false, includeMemberIds: [], expectedPostVersion: s.post.version };
    const results = await Promise.all([
      kit.call("post", s.owner, `/mentor/applications/${a.body.data.id}/accept`, body),
      kit.call("post", s.admin, `/mentor/applications/${b.body.data.id}/accept`, body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe("MENTOR_005");
    expect(await prisma.mentorEngagement.count({ where: { postId: s.post.id } })).toBe(1);
    expect(await prisma.mentorPost.findUniqueOrThrow({ where: { id: s.post.id } })).toMatchObject({ status: "FULFILLED", activeEngagements: 1 });
    expect(await prisma.workspaceMembership.count({ where: { workspaceId: s.workspaceId, role: "GUEST" } })).toBe(1);
  });

  it("IR-23 — thành viên nhóm ứng tuyển bài của chính nhóm → 400 MENTOR_004", async () => {
    const s = await scenario();
    const res = await kit.apply(s.member, s.post.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MENTOR_004");
  });

  it("IR-24 — gia hạn vượt 90 ngày tổng → 400 MENTOR_007; trong giới hạn → hạn khách dời theo", async () => {
    const s = await scenario();
    const { engagementId } = await acceptMentor(s);
    const ok = await kit.call("post", s.owner, `/mentor/engagements/${engagementId}/extend`, { addDays: 50, expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.totalDays).toBe(80);
    const over = await kit.call("post", s.owner, `/mentor/engagements/${engagementId}/extend`, { addDays: 11, expectedVersion: 2 });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe("MENTOR_007");
    expect(over.body.error.details).toEqual({ max: 90, remaining: 10 });
    const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.mentor } } });
    expect((membership.expiresAt as Date).toISOString()).toBe(ok.body.data.endsAt);
  });

  it("IR-25 — 3 người báo cáo bài → MỘT mục trong hàng đợi kiểm duyệt gộp 3 lượt; OWNER nhóm không tự báo cáo (400)", async () => {
    const s = await scenario();
    for (const name of ["Người A", "Người B", "Người C"]) {
      const reporter = await kit.seedUser(name);
      const res = await kit.call("post", reporter, `/mentor/posts/${s.post.id}/report`, { reason: "SPAM" });
      expect(res.status).toBe(201);
    }
    expect((await kit.call("post", s.owner, `/mentor/posts/${s.post.id}/report`, { reason: "SPAM" })).status).toBe(400);

    const platformAdmin = await kit.seedUser("Quản trị nền tảng");
    const queue = await kit.call("get", platformAdmin, "/admin/reports?targetType=MENTOR_POST", undefined, "admin");
    expect(queue.status).toBe(200);
    const groups = (queue.body.data as Array<{ targetId: string; reportCount: number; handlerLevel: string }>).filter((g) => g.targetId === s.post.id);
    expect(groups).toEqual([expect.objectContaining({ reportCount: 3, handlerLevel: "PLATFORM_ONLY" })]);

    const hidden = await kit.call("post", platformAdmin, `/admin/mentor/posts/${s.post.id}/hide`, { reason: "Bài đăng lừa đảo, đã xác minh" }, "admin");
    expect(hidden.status).toBe(200);
    expect(await prisma.report.count({ where: { targetId: s.post.id, status: "OPEN" } })).toBe(0);
    expect((await kit.call("get", s.mentor, `/mentor/posts/${s.post.id}`)).status).toBe(404);
  });
});
