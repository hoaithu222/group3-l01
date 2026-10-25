/**
 * Integration — lời mời ĐÍCH DANH theo email (be.md p3-04 §4/§5.3), Mongo memory replset (`TEST_DB=memory`), route + service THẬT:
 *   - tạo MEMBER/GUEST, không token trong response/outbox (chỉ `tokenSealed` mã hoá), consumer `invitation.mail` → hàng đợi mail hiện có;
 *   - RB-06: tài khoản KHÁC email → 403 INV_008 (lời mời vẫn PENDING); chưa xác minh → EMAIL_NOT_VERIFIED; đúng email → vào nhóm;
 *   - chấp nhận GUEST: membership GUEST + hạn + grant DIRECT các kênh chỉ định, KHÔNG vào kênh mặc định, lên lịch hết hạn bền (outbox);
 *   - thu hồi / gửi lại (token mới, token cũ 410, cooldown 12 giờ RATE_003) / hết hạn lười; bỏ qua ALREADY_MEMBER · PENDING_EXISTS;
 *   - WS_018 (tắt mời khách), CH_013 (kênh riêng không quản lý), `GET /me/invitations` + chấp nhận theo id;
 *   - đua: 5 lời mời đồng thời cùng email → đúng MỘT lời mời PENDING (unique `pendingKey`).
 */
import { installMocks, mockEnqueue, processor, redisStore } from "./access-test-mocks";
import { buildAccessApp, expectNoLeak, makeKit, newFixture, snapshotCounts } from "./access-test-kit";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { newObjectId } from "../../../../core/utils/object-id";
// Side-effect: đăng ký processor vào `mockRegistered`.
import "../../jobs/invitation-mail.consumer";

jest.setTimeout(90_000);

const app = buildAccessApp();
const fx = newFixture();
const kit = makeKit(app, fx);
const { auth } = kit;

describe("lời mời email (p3-04 §5.3) — integration", () => {
  let harness: Harness;
  let baseline: number[] = [];

  beforeAll(async () => {
    baseline = await snapshotCounts();
    harness = await startHarness(); // `accept()` gọi `joinRooms()` → cần Socket.IO thật
    bindPermissionPorts();
    // Memory DB không chạy `db push` → tạo unique index thật của `WorkspaceInvitation` để kiểm đường P2002/`pendingKey`.
    await prisma.$runCommandRaw({
      createIndexes: "WorkspaceInvitation",
      indexes: [
        { key: { pendingKey: 1 }, name: "WorkspaceInvitation_pendingKey_key", unique: true },
        { key: { tokenHash: 1 }, name: "WorkspaceInvitation_tokenHash_key", unique: true },
      ],
    });
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

  /** Nhóm + OWNER; tuỳ chọn thêm ADMIN/MEMBER và bật mời khách. */
  async function scenario(opts: { guests?: boolean } = {}) {
    const owner = await kit.seedUser("Chủ nhóm");
    const { workspaceId, defaultChannelId } = await kit.createWorkspace(owner);
    const admin = await kit.seedUser("Quản trị");
    await kit.addMembership(workspaceId, admin, "ADMIN");
    const member = await kit.seedUser("Thành viên");
    await kit.addMembership(workspaceId, member, "MEMBER");
    if (opts.guests) await kit.enableGuests(workspaceId);
    return { owner, admin, member, workspaceId, defaultChannelId };
  }

  const inviteMembers = (actor: string, workspaceId: string, emails: string[], extra: object = {}) =>
    request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`).set(auth(actor)).send({ emails, ...extra });
  const inviteGuest = (actor: string, workspaceId: string, body: object) =>
    request(app).post(`/api/v1/workspaces/${workspaceId}/guests/invitations`).set(auth(actor)).send(body);
  const accept = (userId: string, token: string) => request(app).post(`/api/v1/invitations/by-token/${token}/accept`).set(auth(userId));
  const preview = (token: string) => request(app).get(`/api/v1/invitations/by-token/${token}`);

  /** Chạy consumer `invitation.mail` cho dòng outbox mới nhất của lời mời, trả token lấy từ URL trong email đã xếp hàng. */
  async function mailedToken(invitationId: string): Promise<string> {
    const row = await prisma.outboxEvent.findFirst({
      where: { jobName: "invitation.mail", aggregateId: invitationId },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    mockEnqueue.mockClear();
    await processor("invitation.mail")({ data: row!.payload });
    const call = mockEnqueue.mock.calls.find((c) => c[1] === "mail.send");
    expect(call).toBeDefined();
    const url = (call![2] as { vars: { url: string } }).vars.url;
    return url.split("/invite/e/")[1];
  }

  describe("mời THÀNH VIÊN", () => {
    it("tạo → DTO không token/hash/pendingKey; outbox chỉ có tokenSealed (không token nguyên văn); email đi qua hàng đợi mail hiện có; RB-06; accept vào nhóm + kênh mặc định", async () => {
      const s = await scenario();
      const invitee = await kit.seedUser("Người được mời", { email: "Duoc.Moi@Example.com" });

      const res = await inviteMembers(s.owner, s.workspaceId, ["duoc.moi@example.com"], { message: "Vào nhóm nhé" });
      expect(res.status).toBe(201);
      expect(res.body.data.skipped).toEqual([]);
      const dto = res.body.data.created[0];
      expect(dto).toMatchObject({ role: "MEMBER", status: "PENDING", email: "duoc.moi@example.com", sendCount: 1, message: "Vào nhóm nhé" });
      expect(JSON.stringify(res.body)).not.toMatch(/token|pendingKey|normalizedEmail/i);

      const row = await prisma.outboxEvent.findFirstOrThrow({ where: { jobName: "invitation.mail", aggregateId: dto.id } });
      expect(row.queue).toBe("notifications");
      expect(row.dedupeKey).toBe(`invitation.mail:invitation:${dto.id}:s1`);
      const payload = row.payload as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(["event", "invitationId", "schemaVersion", "sendCount", "tokenSealed"]);

      const token = await mailedToken(dto.id);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const mail = mockEnqueue.mock.calls.find((c) => c[1] === "mail.send")!;
      expect(mail[2]).toMatchObject({ template: "workspace-invitation", to: "duoc.moi@example.com" });
      expect(JSON.stringify(payload)).not.toContain(token); // token không nằm nguyên văn trong outbox

      // Xem trước (không cần đăng nhập): email che, không lộ id.
      const pv = await preview(token);
      expect(pv.status).toBe(200);
      expect(pv.body.data).toMatchObject({ role: "MEMBER", status: "PENDING", emailHint: "d***@example.com", workspace: { name: "Nhóm thử" } });
      expect(JSON.stringify(pv.body)).not.toContain("duoc.moi@example.com");

      // RB-06 — tài khoản KHÁC email: 403, lời mời vẫn PENDING.
      const stranger = await kit.seedUser("Người lạ", { email: "nguoi.la@example.com" });
      const bad = await accept(stranger, token);
      expect(bad.status).toBe(403);
      expect(bad.body.error).toMatchObject({ code: "INV_008", details: { reason: "EMAIL_MISMATCH" } });
      expect((await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: dto.id } })).status).toBe("PENDING");

      // Đúng email nhưng CHƯA xác minh.
      await prisma.user.update({ where: { id: invitee }, data: { emailVerified: false } });
      const unverified = await accept(invitee, token);
      expect(unverified.body.error).toMatchObject({ code: "INV_008", details: { reason: "EMAIL_NOT_VERIFIED" } });

      // Đúng email đã xác minh (khác hoa/thường) → vào nhóm.
      await prisma.user.update({ where: { id: invitee }, data: { emailVerified: true } });
      const ok = await accept(invitee, token);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ workspaceId: s.workspaceId, membership: { role: "MEMBER", status: "ACTIVE", expiresAt: null } });

      const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: invitee } } });
      expect(membership).toMatchObject({ role: "MEMBER", status: "ACTIVE", invitedBy: s.owner, invitationId: dto.id });
      expect(await prisma.channelMembership.count({ where: { channelId: s.defaultChannelId, userId: invitee } })).toBe(1);
      const accepted = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: dto.id } });
      expect(accepted).toMatchObject({ status: "ACCEPTED", acceptedBy: invitee, pendingKey: `done:${dto.id}` });
      expect((await prisma.workspace.findUniqueOrThrow({ where: { id: s.workspaceId } })).memberCount).toBeGreaterThanOrEqual(1);
      expect(await prisma.outboxEvent.count({ where: { type: "membership.joined", aggregateId: `${s.workspaceId}:${invitee}` } })).toBe(1);

      // Dùng lại token → 410 INV_010 (đã ACCEPTED).
      const again = await accept(invitee, token);
      expect(again.status).toBe(410);
      expect(again.body.error.code).toBe("INV_010");
      expect((await preview(token)).status).toBe(410);
    });

    it("bỏ qua ALREADY_MEMBER · PENDING_EXISTS; email trùng khác hoa/thường gộp một; MEMBER không mời được khi chưa bật memberCanInvite", async () => {
      const s = await scenario();
      await prisma.user.update({ where: { id: s.member }, data: { email: "da-la-thanh-vien@example.com" } });
      const first = await inviteMembers(s.admin, s.workspaceId, ["moi.moi@example.com", "MOI.MOI@example.com", "da-la-thanh-vien@example.com"]);
      expect(first.status).toBe(201);
      expect(first.body.data.created).toHaveLength(1);
      expect(first.body.data.skipped).toEqual([{ email: "da-la-thanh-vien@example.com", reason: "ALREADY_MEMBER" }]);

      const second = await inviteMembers(s.admin, s.workspaceId, ["moi.moi@example.com"]);
      expect(second.body.data.created).toEqual([]);
      expect(second.body.data.skipped).toEqual([{ email: "moi.moi@example.com", reason: "PENDING_EXISTS" }]);

      const memberTry = await inviteMembers(s.member, s.workspaceId, ["x@example.com"]);
      expect(memberTry.status).toBe(403);
      expect(memberTry.body.error.code).toBe("PERM_001");
      await prisma.workspace.update({ where: { id: s.workspaceId }, data: { guestPolicy: { enabled: false, maxGuests: 5, maxDays: 30, memberCanInvite: true } } });
      expect((await inviteMembers(s.member, s.workspaceId, ["x@example.com"])).status).toBe(201);
    });

    it("đua: 5 lời mời đồng thời cùng email → đúng MỘT lời mời PENDING (unique pendingKey), không lỗi 500", async () => {
      const s = await scenario();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => inviteMembers(s.owner, s.workspaceId, ["dua.dong.thoi@example.com"]))
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const created = results.flatMap((r) => r.body.data.created as unknown[]);
      expect(created).toHaveLength(1);
      expect(await prisma.workspaceInvitation.count({ where: { workspaceId: s.workspaceId, status: "PENDING" } })).toBe(1);
    });
  });

  describe("mời KHÁCH", () => {
    it("WS_018 khi nhóm chưa bật mời khách; CH_013 khi chỉ định kênh riêng tư mình không quản lý; kênh lạ 400; ADMIN mời được kênh public", async () => {
      const s = await scenario();
      const publicCh = await kit.createChannel(s.owner, s.workspaceId, "PUBLIC", "Công khai");
      const disabled = await inviteGuest(s.owner, s.workspaceId, { email: "khach@example.com", channelIds: [publicCh], days: 7 });
      expect(disabled.status).toBe(409);
      expect(disabled.body.error.code).toBe("WS_018");

      await kit.enableGuests(s.workspaceId);
      const privateCh = await kit.createChannel(s.owner, s.workspaceId, "PRIVATE", "Riêng của chủ");
      const notManaged = await inviteGuest(s.admin, s.workspaceId, { email: "khach@example.com", channelIds: [privateCh], days: 7 });
      expect(notManaged.status).toBe(403);
      expect(notManaged.body.error.code).toBe("CH_013");
      expect((await inviteGuest(s.admin, s.workspaceId, { email: "khach@example.com", channelIds: [newObjectId()], days: 7 })).status).toBe(400);
      expect((await inviteGuest(s.member, s.workspaceId, { email: "khach@example.com", channelIds: [publicCh], days: 7 })).status).toBe(403);

      const ok = await inviteGuest(s.admin, s.workspaceId, { email: "khach@example.com", channelIds: [publicCh], days: 7 });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ role: "GUEST", guestChannelIds: [publicCh], guestDays: 7, status: "PENDING" });
      expect((await inviteGuest(s.admin, s.workspaceId, { email: "khach@example.com", channelIds: [publicCh], days: 7 })).status).toBe(409); // đã có lời mời chờ
    });

    it("chấp nhận GUEST: membership GUEST + hạn, grant DIRECT các kênh chỉ định, KHÔNG vào kênh mặc định, lịch hết hạn bền (outbox availableAt), khách thấy đúng kênh chỉ định", async () => {
      const s = await scenario({ guests: true });
      const publicCh = await kit.createChannel(s.owner, s.workspaceId, "PUBLIC", "Công khai");
      const privateCh = await kit.createChannel(s.owner, s.workspaceId, "PRIVATE", "Riêng");
      const guest = await kit.seedUser("Khách mời", { email: "khach.moi@example.com" });

      const res = await inviteGuest(s.owner, s.workspaceId, { email: "khach.moi@example.com", channelIds: [publicCh, privateCh], days: 10 });
      expect(res.status).toBe(201);
      const invitationId = res.body.data.id as string;
      const token = await mailedToken(invitationId);

      const pv = await preview(token);
      expect(pv.body.data.channels.map((c: { name: string }) => c.name).sort()).toEqual(["Công khai", "Riêng"]);
      expect(pv.body.data.guestDays).toBe(10);

      const before = Date.now();
      const ok = await accept(guest, token);
      expect(ok.status).toBe(200);
      expect(ok.body.data.membership.role).toBe("GUEST");
      const membership = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: guest } } });
      expect(membership).toMatchObject({ role: "GUEST", status: "ACTIVE", expiryVersion: 1, invitedBy: s.owner, invitationId });
      const expiresAt = membership.expiresAt!.getTime();
      expect(expiresAt).toBeGreaterThan(before + 10 * 24 * 3600_000 - 5_000);
      expect(expiresAt).toBeLessThan(Date.now() + 10 * 24 * 3600_000 + 5_000);

      const grants = await prisma.channelGrant.findMany({ where: { workspaceId: s.workspaceId, userId: guest } });
      expect(grants.map((g) => g.channelId).sort()).toEqual([publicCh, privateCh].sort());
      expect(grants.every((g) => g.source === "DIRECT" && g.level === "MEMBER" && g.subjectKey === guest)).toBe(true);
      expect(await prisma.channelMembership.count({ where: { channelId: s.defaultChannelId, userId: guest } })).toBe(0); // không vào "Chung"

      // Lịch hết hạn: 2 dòng outbox có availableAt tương lai, jobId theo version.
      const expireRow = await prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `guest.expire:membership:${membership.id}:v1` } });
      expect(expireRow).toMatchObject({ queue: "cron", jobName: "guest.expire", status: "PENDING" });
      expect(expireRow.availableAt.getTime()).toBe(membership.expiresAt!.getTime());
      const noticeRow = await prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `guest.expiring-notice:membership:${membership.id}:v1` } });
      expect(noticeRow.availableAt.getTime()).toBe(membership.expiresAt!.getTime() - 48 * 3600_000);

      // Khách thấy đúng 2 kênh chỉ định; kênh mặc định 404; không có `memberCount`.
      const list = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/channels?include=all`).set(auth(guest));
      expect(list.status).toBe(200);
      expect(list.body.data.joined.map((c: { name: string }) => c.name).sort()).toEqual(["Công khai", "Riêng"]);
      expect(list.body.data.discoverable).toEqual([]);
      expect((await request(app).get(`/api/v1/channels/${s.defaultChannelId}`).set(auth(guest))).status).toBe(404);
      const detail = await request(app).get(`/api/v1/workspaces/${s.workspaceId}`).set(auth(guest));
      expect(detail.status).toBe(200);
      expect(detail.body.data.myRole).toBe("GUEST");
      expect(detail.body.data.memberCount).toBeUndefined();
      expect(detail.body.data.joinPolicy).toBeUndefined();
      expect(detail.body.data.myExpiresAt).toBeTruthy();
    });

    it("kênh chỉ định đã lưu trữ trước lúc chấp nhận → bỏ qua, ghi skippedChannels", async () => {
      const s = await scenario({ guests: true });
      const keep = await kit.createChannel(s.owner, s.workspaceId, "PUBLIC", "Còn hoạt động");
      const gone = await kit.createChannel(s.owner, s.workspaceId, "PUBLIC", "Sẽ lưu trữ");
      const guest = await kit.seedUser("Khách", { email: "khach.skip@example.com" });
      const res = await inviteGuest(s.owner, s.workspaceId, { email: "khach.skip@example.com", channelIds: [keep, gone], days: 5 });
      const token = await mailedToken(res.body.data.id);
      await prisma.channel.update({ where: { id: gone }, data: { status: "ARCHIVED" } });

      const ok = await accept(guest, token);
      expect(ok.status).toBe(200);
      expect(ok.body.data.skippedChannels).toEqual([{ channelId: gone, reason: "ARCHIVED" }]);
      expect(await prisma.channelGrant.count({ where: { userId: guest } })).toBe(1);
    });

    it("nhóm đã đủ số khách lúc chấp nhận → 409 WS_018 (kiểm lại chính sách khi chấp nhận)", async () => {
      const s = await scenario({ guests: true });
      const ch = await kit.createChannel(s.owner, s.workspaceId, "PUBLIC", "Kênh");
      const guest = await kit.seedUser("Khách", { email: "khach.full@example.com" });
      const res = await inviteGuest(s.owner, s.workspaceId, { email: "khach.full@example.com", channelIds: [ch], days: 5 });
      const token = await mailedToken(res.body.data.id);
      await kit.enableGuests(s.workspaceId, { maxGuests: 0 });
      const blocked = await accept(guest, token);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("WS_018");
      expect((await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: res.body.data.id } })).status).toBe("PENDING");
    });
  });

  describe("thu hồi · gửi lại · hết hạn lười", () => {
    it("thu hồi → 410 khi xem/chấp nhận, thu hồi lần 2 → 409; người không phải ADMIN/người mời → 404", async () => {
      const s = await scenario();
      const created = await inviteMembers(s.admin, s.workspaceId, ["thu.hoi@example.com"]);
      const id = created.body.data.created[0].id as string;
      const token = await mailedToken(id);

      expect((await request(app).post(`/api/v1/invitations/${id}/revoke`).set(auth(s.member))).status).toBe(404);
      const revoked = await request(app).post(`/api/v1/invitations/${id}/revoke`).set(auth(s.admin));
      expect(revoked.status).toBe(200);
      expect(revoked.body.data.status).toBe("REVOKED");
      expect((await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id } })).pendingKey).toBe(`done:${id}`);
      expect((await preview(token)).status).toBe(410);
      const invitee = await kit.seedUser("X", { email: "thu.hoi@example.com" });
      expect((await accept(invitee, token)).status).toBe(410);
      expect((await request(app).post(`/api/v1/invitations/${id}/revoke`).set(auth(s.owner))).status).toBe(409);
      // Đã thu hồi → mời lại cùng email được (pendingKey đã giải phóng).
      expect((await inviteMembers(s.owner, s.workspaceId, ["thu.hoi@example.com"])).body.data.created).toHaveLength(1);
    });

    it("gửi lại: cooldown 12 giờ → 429 RATE_003; sau đó hạn +7 ngày, token MỚI, token cũ 410, mail lần 2 xếp hàng", async () => {
      const s = await scenario();
      const created = await inviteMembers(s.owner, s.workspaceId, ["gui.lai@example.com"]);
      const id = created.body.data.created[0].id as string;
      const oldToken = await mailedToken(id);

      const tooSoon = await request(app).post(`/api/v1/invitations/${id}/resend`).set(auth(s.owner));
      expect(tooSoon.status).toBe(429);
      expect(tooSoon.body.error.code).toBe("RATE_003");
      expect(tooSoon.body.error.details.retryAfterSeconds).toBeGreaterThan(11 * 3600);

      await prisma.workspaceInvitation.update({ where: { id }, data: { lastSentAt: new Date(Date.now() - 13 * 3600_000) } });
      const resent = await request(app).post(`/api/v1/invitations/${id}/resend`).set(auth(s.owner));
      expect(resent.status).toBe(200);
      expect(resent.body.data.sendCount).toBe(2);
      expect(new Date(resent.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6.9 * 24 * 3600_000);

      expect((await preview(oldToken)).status).toBe(404); // hash cũ không còn (token đã đổi)
      const newToken = await mailedToken(id);
      expect(newToken).not.toBe(oldToken);
      expect((await preview(newToken)).status).toBe(200);
      expect(await prisma.outboxEvent.count({ where: { dedupeKey: `invitation.mail:invitation:${id}:s2` } })).toBe(1);
      // Consumer bỏ qua bản gửi CŨ (sendCount lệch) — không gửi token đã vô hiệu.
      mockEnqueue.mockClear();
      const stale = await prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `invitation.mail:invitation:${id}:s1` } });
      await processor("invitation.mail")({ data: stale.payload });
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it("PENDING quá hạn: xem trước → 410 và đặt EXPIRED (giải phóng pendingKey) → mời lại cùng email được", async () => {
      const s = await scenario();
      const created = await inviteMembers(s.owner, s.workspaceId, ["het.han@example.com"]);
      const id = created.body.data.created[0].id as string;
      const token = await mailedToken(id);
      await prisma.workspaceInvitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const pv = await preview(token);
      expect(pv.status).toBe(410);
      expect(pv.body.error.code).toBe("INV_010");
      const row = await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: "EXPIRED", pendingKey: `done:${id}` });
      expect((await inviteMembers(s.owner, s.workspaceId, ["het.han@example.com"])).body.data.created).toHaveLength(1);
    });

    it("danh sách lời mời (OWNER/ADMIN, cursor, lọc trạng thái); MEMBER → 403", async () => {
      const s = await scenario();
      await inviteMembers(s.owner, s.workspaceId, ["a1@example.com", "a2@example.com", "a3@example.com"]);
      const page1 = await request(app).get(`/api/v1/workspaces/${s.workspaceId}/invitations?limit=2`).set(auth(s.admin));
      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.meta).toMatchObject({ hasMore: true, limit: 2 });
      const page2 = await request(app)
        .get(`/api/v1/workspaces/${s.workspaceId}/invitations?limit=2&cursor=${encodeURIComponent(page1.body.meta.nextCursor)}`)
        .set(auth(s.admin));
      expect(page2.body.data).toHaveLength(1);
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/invitations?status=ACCEPTED`).set(auth(s.owner))).body.data).toEqual([]);
      expect((await request(app).get(`/api/v1/workspaces/${s.workspaceId}/invitations`).set(auth(s.member))).status).toBe(403);
    });
  });

  describe("GET /me/invitations + chấp nhận theo id", () => {
    it("chỉ với email ĐÃ XÁC MINH; chấp nhận theo id không cần token; người khác → 404", async () => {
      const s = await scenario();
      const invitee = await kit.seedUser("Người được mời", { email: "cua.toi@example.com", emailVerified: false });
      const created = await inviteMembers(s.owner, s.workspaceId, ["cua.toi@example.com"]);
      const id = created.body.data.created[0].id as string;

      expect((await request(app).get("/api/v1/me/invitations").set(auth(invitee))).body.data).toEqual([]); // chưa xác minh
      await prisma.user.update({ where: { id: invitee }, data: { emailVerified: true } });
      const mine = await request(app).get("/api/v1/me/invitations").set(auth(invitee));
      expect(mine.status).toBe(200);
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.data[0]).toMatchObject({ id, workspace: { name: "Nhóm thử" }, inviter: { name: "Chủ nhóm" } });
      expect(JSON.stringify(mine.body)).not.toMatch(/token/i);

      const other = await kit.seedUser("Khác", { email: "khac@example.com" });
      expect((await request(app).post(`/api/v1/me/invitations/${id}/accept`).set(auth(other))).status).toBe(404);
      const ok = await request(app).post(`/api/v1/me/invitations/${id}/accept`).set(auth(invitee));
      expect(ok.status).toBe(200);
      expect(ok.body.data.membership).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
    });
  });

  describe("token/hạ tầng an toàn", () => {
    it("token sai định dạng → 400; token lạ → 404; chấp nhận cần đăng nhập → 401", async () => {
      expect((await preview("ngan")).status).toBe(400);
      expect((await preview("A".repeat(43))).status).toBe(404);
      expect((await request(app).post(`/api/v1/invitations/by-token/${"A".repeat(43)}/accept`)).status).toBe(401);
    });
  });
});
