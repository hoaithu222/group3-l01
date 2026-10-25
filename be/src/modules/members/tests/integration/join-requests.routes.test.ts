/**
 * Integration — duyệt tham gia (be.md p3-04 §5.5) + `PATCH /workspaces/:id/settings`, Mongo memory replset (`TEST_DB=memory`):
 *   - settings: chỉ OWNER, CAS `expectedVersion` (409 RES_003), trả `{ joinPolicy, guestPolicy, version }`; chi tiết nhóm phản ánh chính sách;
 *   - RB-07: `joinPolicy=APPROVAL` + link mời → membership PENDING (202, `data.status`), KHÔNG đọc được nhóm/kênh (404), thẻ `status:"PENDING"` ở
 *     `GET /workspaces`, thông báo cho OWNER/ADMIN; duyệt → ACTIVE + kênh mặc định + `JOIN_APPROVED`;
 *   - RB-08: nhận link lần 2 khi đang PENDING → vẫn "chờ", không tạo thêm, KHÔNG tiêu lượt link;
 *   - từ chối → REMOVED/REJECTED, xin lại < 24 giờ → 429 WS_019, sau đó được; huỷ yêu cầu (204); 409 khi không còn PENDING;
 *   - lời mời EMAIL bỏ qua duyệt; link GUEST (dữ liệu lạ) → 400 INV_009.
 */
import { installMocks, mockEnqueue, processor, redisStore } from "./access-test-mocks";
import { buildAccessApp, expectNoLeak, makeKit, newFixture, snapshotCounts } from "./access-test-kit";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { generateInviteToken } from "../../services/invite-token.util";
import "../../jobs/invitation-mail.consumer";

jest.setTimeout(90_000);

const app = buildAccessApp();
const fx = newFixture();
const kit = makeKit(app, fx);
const { auth } = kit;

describe("duyệt tham gia + settings (p3-04 §5.5) — integration", () => {
  let harness: Harness;
  let baseline: number[] = [];

  beforeAll(async () => {
    baseline = await snapshotCounts();
    harness = await startHarness();
    bindPermissionPorts();
  });
  afterAll(async () => {
    await expectNoLeak(baseline); // dọn sạch OutboxEvent/Notification do suite tạo
    await stopHarness(harness);
    resetPermissionPorts();
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    await kit.cleanup();
    redisStore.clear();
  });

  async function scenario(policy: "OPEN" | "APPROVAL" = "APPROVAL") {
    const owner = await kit.seedUser("Chủ nhóm");
    const { workspaceId, defaultChannelId } = await kit.createWorkspace(owner);
    const admin = await kit.seedUser("Quản trị");
    await kit.addMembership(workspaceId, admin, "ADMIN");
    const member = await kit.seedUser("Thành viên");
    await kit.addMembership(workspaceId, member, "MEMBER");
    if (policy === "APPROVAL") await prisma.workspace.update({ where: { id: workspaceId }, data: { joinPolicy: "APPROVAL" } });
    const link = await request(app).post(`/api/v1/workspaces/${workspaceId}/invites`).set(auth(owner)).send({ expiresInHours: 24, maxUses: 10 });
    expect(link.status).toBe(201);
    const token = (link.body.data.url as string).split("/invite/")[1];
    return { owner, admin, member, workspaceId, defaultChannelId, linkId: link.body.data.id as string, token };
  }

  const acceptLink = (userId: string, token: string) => request(app).post(`/api/v1/invites/${token}/accept`).set(auth(userId));
  const membershipOf = (workspaceId: string, userId: string) =>
    prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });

  describe("PATCH /workspaces/:id/settings", () => {
    it("OWNER đổi joinPolicy/guestPolicy → { joinPolicy, guestPolicy, version } và chi tiết nhóm phản ánh; ADMIN/MEMBER → 403; sai version → 409", async () => {
      const s = await scenario("OPEN");
      const detail = await request(app).get(`/api/v1/workspaces/${s.workspaceId}`).set(auth(s.owner));
      expect(detail.body.data).toMatchObject({
        joinPolicy: "OPEN",
        guestPolicy: { enabled: false, maxGuests: 20, maxDays: 90, memberCanInvite: false }, // mặc định nền tảng
      });
      const v = detail.body.data.version as number;

      const body = { joinPolicy: "APPROVAL", guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: true }, expectedVersion: v };
      expect((await request(app).patch(`/api/v1/workspaces/${s.workspaceId}/settings`).set(auth(s.admin)).send(body)).status).toBe(403);
      expect((await request(app).patch(`/api/v1/workspaces/${s.workspaceId}/settings`).set(auth(s.member)).send(body)).status).toBe(403);

      const ok = await request(app).patch(`/api/v1/workspaces/${s.workspaceId}/settings`).set(auth(s.owner)).send(body);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toEqual({ joinPolicy: "APPROVAL", guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: true }, version: v + 1 });

      const stale = await request(app).patch(`/api/v1/workspaces/${s.workspaceId}/settings`).set(auth(s.owner)).send({ joinPolicy: "OPEN", expectedVersion: v });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("RES_003");

      const after = await request(app).get(`/api/v1/workspaces/${s.workspaceId}`).set(auth(s.member));
      expect(after.body.data).toMatchObject({ joinPolicy: "APPROVAL", myPermissions: { canInvite: true } }); // MEMBER + memberCanInvite
      expect(await prisma.outboxEvent.count({ where: { aggregateId: s.workspaceId, dedupeKey: `workspace.updated:${s.workspaceId}:v${v + 1}` } })).toBe(1);
    });

    it("body không hợp lệ: không có thay đổi, maxGuests/maxDays vượt trần → 400", async () => {
      const s = await scenario("OPEN");
      const path = `/api/v1/workspaces/${s.workspaceId}/settings`;
      expect((await request(app).patch(path).set(auth(s.owner)).send({ expectedVersion: 1 })).status).toBe(400);
      expect((await request(app).patch(path).set(auth(s.owner)).send({ guestPolicy: { enabled: true, maxGuests: 999, maxDays: 30, memberCanInvite: false }, expectedVersion: 1 })).status).toBe(400);
      expect((await request(app).patch(path).set(auth(s.owner)).send({ guestPolicy: { enabled: true, maxGuests: 5, maxDays: 365, memberCanInvite: false }, expectedVersion: 1 })).status).toBe(400);
    });
  });

  describe("RB-07 / RB-08 — link mời khi APPROVAL", () => {
    it("PENDING (202): không đọc được nhóm/kênh, thẻ PENDING trong danh sách, tiêu MỘT lượt link, thông báo cho OWNER/ADMIN; nhận link lần 2 không tạo thêm/không tiêu lượt", async () => {
      const s = await scenario();
      const requester = await kit.seedUser("Người xin vào");

      const res = await acceptLink(requester, s.token);
      expect(res.status).toBe(202);
      expect(res.body.data).toMatchObject({ workspaceId: s.workspaceId, status: "PENDING", alreadyMember: false, defaultChannelId: null });

      expect(await membershipOf(s.workspaceId, requester)).toMatchObject({ status: "PENDING", role: "MEMBER", inviteLinkId: s.linkId });
      expect((await membershipOf(s.workspaceId, requester))!.requestedAt).toBeInstanceOf(Date);
      // Chưa là thành viên → 404 với mọi nội dung.
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}`).set(auth(requester))).status).toBe(404);
      expect((await request(app).get(`/api/v1/channels/${s.defaultChannelId}`).set(auth(requester))).status).toBe(404);
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/members`).set(auth(requester))).status).toBe(404);
      expect(await prisma.channelMembership.count({ where: { channelId: s.defaultChannelId, userId: requester } })).toBe(0);
      // Nhóm KHÔNG đếm người chờ.
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(1);

      // `GET /workspaces` trả thẻ chờ duyệt.
      const list = await request(app).get("/api/v1/workspaces").set(auth(requester));
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: s.workspaceId, status: "PENDING", myRole: "MEMBER", unreadCount: 0 });

      // Tiêu đúng MỘT lượt link; thông báo tới OWNER + ADMIN (không tới MEMBER).
      const link = await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } });
      expect(link).toMatchObject({ remainingUses: 9, usesCount: 1 });
      const recipients = await prisma.notificationRecipient.findMany({ where: { workspaceId: s.workspaceId } });
      expect(recipients.map((r) => r.recipientId).sort()).toEqual([s.owner, s.admin].sort());
      const notification = await prisma.notification.findFirstOrThrow({ where: { workspaceId: s.workspaceId, type: "workspace.join-requested" } });
      expect(notification.refs).toMatchObject({ workspaceId: s.workspaceId, requesterId: requester });

      // RB-08 — lần 2: vẫn 202 PENDING, không đổi gì, KHÔNG tiêu lượt.
      const again = await acceptLink(requester, s.token);
      expect(again.status).toBe(202);
      expect(again.body.data.status).toBe("PENDING");
      expect(await prisma.workspaceMembership.count({ where: { workspaceId: s.workspaceId, userId: requester } })).toBe(1);
      expect(await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } })).toMatchObject({ remainingUses: 9, usesCount: 1 });
      expect(await prisma.notificationRecipient.count({ where: { workspaceId: s.workspaceId } })).toBe(2);
    });

    it("OWNER/ADMIN thấy danh sách (không email); MEMBER 403; duyệt → ACTIVE + kênh mặc định + JOIN_APPROVED, đọc được nhóm; duyệt lại → 409", async () => {
      const s = await scenario();
      const requester = await kit.seedUser("Người xin vào");
      await acceptLink(requester, s.token);

      const list = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/join-requests`).set(auth(s.admin));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ user: { id: requester, name: "Người xin vào", avatarUrl: null }, via: "INVITE_LINK", requestMessage: null });
      expect(JSON.stringify(list.body)).not.toContain("@e.com");
      expect(list.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/join-requests`).set(auth(s.member))).status).toBe(403);
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-requests/${requester}/approve`).set(auth(s.member)).send({})).status).toBe(403);

      const approved = await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-requests/${requester}/approve`).set(auth(s.admin)).send({});
      expect(approved.status).toBe(200);
      expect(approved.body.data).toMatchObject({ userId: requester, role: "MEMBER", status: "ACTIVE" });
      const m = await membershipOf(s.workspaceId, requester);
      expect(m).toMatchObject({ status: "ACTIVE", decidedBy: s.admin });
      expect(await prisma.channelMembership.count({ where: { channelId: s.defaultChannelId, userId: requester } })).toBe(1);
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(2);
      expect(await prisma.notification.count({ where: { workspaceId: s.workspaceId, type: "workspace.join-approved" } })).toBe(1);

      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}`).set(auth(requester))).status).toBe(200);
      expect((await request(app).get(`/api/v1/channels/${s.defaultChannelId}`).set(auth(requester))).status).toBe(200);
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-requests/${requester}/approve`).set(auth(s.owner)).send({})).status).toBe(409);
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-requests/${requester}/reject`).set(auth(s.owner)).send({})).status).toBe(409);
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/join-requests`).set(auth(s.owner))).body.data).toEqual([]);
    });

    it("requestMessage (p3-04 §5.5): lưu lời nhắn đã chuẩn hoá vào yêu cầu PENDING và hiện ở danh sách của OWNER/ADMIN; nhận link lần 2 KHÔNG ghi đè", async () => {
      const s = await scenario();
      const requester = await kit.seedUser("Người có lời nhắn");
      const res = await acceptLink(requester, s.token).send({ requestMessage: "  Chào anh chị,\r\nem là sinh viên năm 3 muốn xin vào nhóm ạ  " });
      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe("PENDING");
      // Cắt khoảng trắng đầu/cuối, bỏ ký tự điều khiển `\r` (giữ `\n`).
      const stored = await membershipOf(s.workspaceId, requester);
      expect(stored?.requestMessage).toBe("Chào anh chị,\nem là sinh viên năm 3 muốn xin vào nhóm ạ");

      const list = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/join-requests`).set(auth(s.admin));
      expect(list.body.data[0]).toMatchObject({ user: { id: requester }, requestMessage: "Chào anh chị,\nem là sinh viên năm 3 muốn xin vào nhóm ạ" });

      // Đang PENDING: gửi lại kèm lời nhắn khác → vẫn 202, lời nhắn cũ giữ nguyên, không tiêu thêm lượt.
      const again = await acceptLink(requester, s.token).send({ requestMessage: "Lời nhắn khác" });
      expect(again.status).toBe(202);
      expect((await membershipOf(s.workspaceId, requester))?.requestMessage).toBe("Chào anh chị,\nem là sinh viên năm 3 muốn xin vào nhóm ạ");
      expect(await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } })).toMatchObject({ remainingUses: 9, usesCount: 1 });
    });

    it("requestMessage: quá 500 ký tự → 400 VAL_001 (không tạo yêu cầu, không tiêu lượt); rỗng/toàn khoảng trắng hoặc không gửi → null tường minh; HTML bị bỏ", async () => {
      const s = await scenario();
      const tooLong = await kit.seedUser("Lời nhắn dài");
      const bad = await acceptLink(tooLong, s.token).send({ requestMessage: "x".repeat(501) });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe("VAL_001");
      expect(await membershipOf(s.workspaceId, tooLong)).toBeNull();
      expect(await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } })).toMatchObject({ remainingUses: 10, usesCount: 0 });

      const blank = await kit.seedUser("Lời nhắn rỗng");
      expect((await acceptLink(blank, s.token).send({ requestMessage: "   \t  " })).status).toBe(202);
      expect((await membershipOf(s.workspaceId, blank))?.requestMessage).toBeNull();

      const none = await kit.seedUser("Không gửi lời nhắn");
      expect((await acceptLink(none, s.token)).status).toBe(202);
      expect((await membershipOf(s.workspaceId, none))?.requestMessage).toBeNull();
      // `null` tường minh (không phải field vắng mặt) — cần cho mọi truy vấn lọc `requestMessage: null` sau này.
      const raw = (await prisma.workspaceMembership.findRaw({ filter: { workspaceId: { $oid: s.workspaceId }, userId: { $oid: none } } })) as unknown as Array<Record<string, unknown>>;
      expect(raw[0]).toHaveProperty("requestMessage", null);

      const html = await kit.seedUser("Lời nhắn có HTML");
      expect((await acceptLink(html, s.token).send({ requestMessage: "Xin chào <script>alert(1)</script>em xin vào" })).status).toBe(202);
      expect((await membershipOf(s.workspaceId, html))?.requestMessage).not.toContain("<script>");
    });

    it("từ chối → REMOVED/REJECTED (không ban), JOIN_REJECTED; xin lại < 24 giờ → 429 WS_019 (không tiêu lượt); qua 24 giờ → PENDING lại", async () => {
      const s = await scenario();
      const requester = await kit.seedUser("Bị từ chối");
      await acceptLink(requester, s.token);

      const rejected = await request(app)
        .post(`/api/v1/workspaces/${s.workspaceId}/join-requests/${requester}/reject`)
        .set(auth(s.owner))
        .send({ reason: "Không thuộc lớp" });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data).toMatchObject({ userId: requester, status: "REMOVED" });
      expect(await membershipOf(s.workspaceId, requester)).toMatchObject({ status: "REMOVED", leftReason: "REJECTED", decidedBy: s.owner });
      expect(await prisma.notification.count({ where: { workspaceId: s.workspaceId, type: "workspace.join-rejected" } })).toBe(1);
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBe(1);

      const usesBefore = (await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } })).usesCount;
      const cooldown = await acceptLink(requester, s.token);
      expect(cooldown.status).toBe(429);
      expect(cooldown.body.error.code).toBe("WS_019");
      expect(cooldown.body.error.details.retryAfterSeconds).toBeGreaterThan(23 * 3600);
      expect((await prisma.inviteLink.findUniqueOrThrow({ where: { id: s.linkId } })).usesCount).toBe(usesBefore);

      await prisma.workspaceMembership.updateMany({
        where: { workspaceId: s.workspaceId, userId: requester },
        data: { decidedAt: new Date(Date.now() - 25 * 3600_000) },
      });
      const retry = await acceptLink(requester, s.token);
      expect(retry.status).toBe(202);
      expect(await membershipOf(s.workspaceId, requester)).toMatchObject({ status: "PENDING", leftReason: null, decidedAt: null });
    });

    it("huỷ yêu cầu của chính mình → 204 (LEFT); không có yêu cầu → 404; người khác không huỷ hộ được", async () => {
      const s = await scenario();
      const requester = await kit.seedUser("Người xin vào");
      await acceptLink(requester, s.token);

      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-request/cancel`).set(auth(s.member))).status).toBe(404); // MEMBER không có yêu cầu
      const cancelled = await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-request/cancel`).set(auth(requester));
      expect(cancelled.status).toBe(204);
      expect(await membershipOf(s.workspaceId, requester)).toMatchObject({ status: "LEFT" });
      expect((await request(app).post(`/api/v1/workspaces/${s.workspaceId}/join-request/cancel`).set(auth(requester))).status).toBe(404);
    });
  });

  describe("các đường không qua duyệt", () => {
    it("joinPolicy=OPEN: link vào thẳng như Phase 1 (200, không có status PENDING)", async () => {
      const s = await scenario("OPEN");
      const user = await kit.seedUser("Vào thẳng");
      const res = await acceptLink(user, s.token);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ workspaceId: s.workspaceId, alreadyMember: false });
      expect(res.body.data.status).toBeUndefined();
      expect(await membershipOf(s.workspaceId, user)).toMatchObject({ status: "ACTIVE" });
    });

    it("joinPolicy=OPEN + có requestMessage: vào thẳng, lời nhắn bị bỏ qua (chỉ lưu khi tạo yêu cầu chờ duyệt)", async () => {
      const s = await scenario("OPEN");
      const user = await kit.seedUser("Vào thẳng kèm lời nhắn");
      const res = await acceptLink(user, s.token).send({ requestMessage: "Em xin vào nhóm" });
      expect(res.status).toBe(200);
      expect(await membershipOf(s.workspaceId, user)).toMatchObject({ status: "ACTIVE" });
      expect((await membershipOf(s.workspaceId, user))?.requestMessage ?? null).toBeNull();
    });

    it("lời mời EMAIL bỏ qua duyệt (đã đích danh): APPROVAL nhưng người được mời vào thẳng ACTIVE, kể cả khi đang PENDING", async () => {
      const s = await scenario();
      const invitee = await kit.seedUser("Được mời", { email: "duoc.moi.email@example.com" });
      await acceptLink(invitee, s.token); // đang PENDING
      const created = await request(app).post(`/api/v1/workspaces/${s.workspaceId}/invitations`).set(auth(s.owner)).send({ emails: ["duoc.moi.email@example.com"] });
      const id = created.body.data.created[0].id as string;
      const row = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "invitation.mail", aggregateId: id } });
      await processor("invitation.mail")({ data: row.payload });
      const token = ((mockEnqueue.mock.calls.find((c) => c[1] === "mail.send")![2] as { vars: { url: string } }).vars.url).split("/invite/e/")[1];

      const ok = await request(app).post(`/api/v1/invitations/by-token/${token}/accept`).set(auth(invitee));
      expect(ok.status).toBe(200);
      expect(ok.body.data.membership.status).toBe("ACTIVE");
      expect(await membershipOf(s.workspaceId, invitee)).toMatchObject({ status: "ACTIVE", requestedAt: null });
    });

    it("hồi quy Phase 1: link tạo qua API ghi revokedAt/revokedBy/lastUsedAt = null tường minh; link CŨ thiếu field (absent) vẫn chấp nhận được (isSet:false)", async () => {
      const s = await scenario("OPEN");
      const raw = await prisma.$runCommandRaw({ find: "InviteLink", filter: { _id: { $oid: s.linkId } }, limit: 1 });
      const doc = (raw as unknown as { cursor: { firstBatch: Array<Record<string, unknown>> } }).cursor.firstBatch[0];
      expect(doc).toHaveProperty("revokedAt", null); // KHÔNG vắng mặt

      // Link "cũ": bỏ hẳn field revokedAt (như dữ liệu tạo trước bản sửa).
      await prisma.$runCommandRaw({
        update: "InviteLink",
        updates: [{ q: { _id: { $oid: s.linkId } }, u: { $unset: { revokedAt: "", revokedBy: "", lastUsedAt: "" } } }],
      });
      const user = await kit.seedUser("Vào bằng link cũ");
      const res = await acceptLink(user, s.token);
      expect(res.status).toBe(200);
      expect(await membershipOf(s.workspaceId, user)).toMatchObject({ status: "ACTIVE" });
    });

    it("link mời có role GUEST (dữ liệu lạ) → 400 INV_009 (khách chỉ qua lời mời đích danh)", async () => {
      const s = await scenario("OPEN");
      const { token, tokenHash, tokenPrefix } = generateInviteToken();
      await prisma.inviteLink.create({
        data: {
          workspaceId: s.workspaceId,
          tokenHash,
          tokenPrefix,
          role: "GUEST",
          maxUses: 5,
          remainingUses: 5,
          expiresAt: new Date(Date.now() + 3600_000),
          createdBy: s.owner,
        },
      });
      const user = await kit.seedUser("Thử qua link");
      const res = await acceptLink(user, token);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INV_009");
      expect(await membershipOf(s.workspaceId, user)).toBeNull();
    });
  });
});
