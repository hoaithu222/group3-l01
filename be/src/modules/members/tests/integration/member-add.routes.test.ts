/**
 * Integration — tra người theo email/SĐT + thêm thẳng thành viên (`GET …/member-lookup`, `POST …/members`), Mongo memory replset
 * (`TEST_DB=memory`), route + service + cổng tra cứu THẬT:
 *   - lookup: chỉ khớp CHÍNH XÁC email (không phân biệt hoa/thường) / SĐT (mọi kiểu gõ → E.164), tên/số dở dang → 400;
 *   - riêng tư: `findableByEmail/Phone=false` → như không tồn tại (trung tính); gợi ý che chỉ theo cờ; không lộ email/SĐT đầy đủ;
 *   - tài khoản không ACTIVE, người chặn nhau → không thấy; trạng thái AVAILABLE/ALREADY_MEMBER/BANNED; ADMIN+ mới gọi được;
 *   - add: membership ACTIVE (MEMBER) + kênh mặc định + memberCount + thông báo hộp thư + outbox + audit; idempotent; LEFT/PENDING → ACTIVE;
 *     BANNED 403; đua hai lượt thêm cùng người → đúng MỘT thành viên.
 */
import { installMocks, mockAuditRecord, redisStore } from "./access-test-mocks";
import { buildAccessApp, expectNoLeak, makeKit, newFixture, snapshotCounts } from "./access-test-kit";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { newObjectId } from "../../../../core/utils/object-id";

jest.setTimeout(90_000);

const app = buildAccessApp();
const fx = newFixture();
const kit = makeKit(app, fx);
const { auth } = kit;

describe("tra người theo email/SĐT + thêm thành viên — integration", () => {
  let harness: Harness;
  let baseline: number[] = [];

  beforeAll(async () => {
    baseline = await snapshotCounts();
    harness = await startHarness(); // `add()` gọi `joinRooms()` → cần Socket.IO thật
    bindPermissionPorts();
    // Memory DB không chạy `db push` → tạo unique index thật của membership để kiểm đường đua P2002.
    await prisma.$runCommandRaw({
      createIndexes: "WorkspaceMembership",
      indexes: [{ key: { workspaceId: 1, userId: 1 }, name: "WorkspaceMembership_workspaceId_userId_key", unique: true }],
    });
  });

  afterAll(async () => {
    await expectNoLeak(baseline);
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => installMocks());
  afterEach(async () => {
    await prisma.userBlock.deleteMany({ where: { blockerId: { in: fx.userIds } } });
    await kit.cleanup();
    redisStore.clear();
  });

  async function scenario() {
    const owner = await kit.seedUser("Chủ nhóm");
    const { workspaceId, defaultChannelId } = await kit.createWorkspace(owner);
    const admin = await kit.seedUser("Quản trị");
    await kit.addMembership(workspaceId, admin, "ADMIN");
    const member = await kit.seedUser("Thành viên");
    await kit.addMembership(workspaceId, member, "MEMBER");
    return { owner, admin, member, workspaceId, defaultChannelId };
  }

  /** Người ngoài nhóm có email + SĐT tự khai. */
  async function seedTarget(opts: { email?: string; phone?: string | null; name?: string } = {}) {
    const email = opts.email ?? `target-${newObjectId()}@example.com`;
    const id = await kit.seedUser(opts.name ?? "Lan Nguyễn", { email });
    if (opts.phone !== null) await prisma.user.update({ where: { id }, data: { phone: opts.phone ?? "+84912345678" } });
    return { id, email };
  }

  const lookup = (actor: string, workspaceId: string, q: string) =>
    request(app).get(`/api/v1/workspaces/${workspaceId}/member-lookup`).query({ q }).set(auth(actor));
  const add = (actor: string, workspaceId: string, userId: string) =>
    request(app).post(`/api/v1/workspaces/${workspaceId}/members`).set(auth(actor)).send({ userId });
  const memberCount = async (workspaceId: string) => (await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).memberCount;

  describe("GET member-lookup", () => {
    it("khớp email đầy đủ (không phân biệt hoa/thường); kết quả KHÔNG lộ email/SĐT đầy đủ, chỉ gợi ý che", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget({ email: "lan.nguyen@example.com" });

      const res = await lookup(admin, workspaceId, "  Lan.Nguyen@EXAMPLE.com ");

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        { userId: target.id, name: "Lan Nguyễn", avatarUrl: null, matchedBy: "EMAIL", hint: "+84 ****** 678", state: "AVAILABLE" },
      ]);
      expect(JSON.stringify(res.body)).not.toContain("+84912345678");
    });

    it.each(["0912345678", "0912 345 678", "091.234.5678", "+84912345678", "84912345678", "0084912345678"])(
      "khớp SĐT gõ kiểu %s → cùng một người, gợi ý là email che",
      async (q) => {
        const { admin, workspaceId } = await scenario();
        const target = await seedTarget({ email: "lan.nguyen@example.com" });

        const res = await lookup(admin, workspaceId, q);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
          { userId: target.id, name: "Lan Nguyễn", avatarUrl: null, matchedBy: "PHONE", hint: "l***@example.com", state: "AVAILABLE" },
        ]);
        expect(JSON.stringify(res.body)).not.toContain("lan.nguyen@example.com");
      }
    );

    it("SĐT dùng chung nhiều tài khoản (không unique) → trả đủ các tài khoản", async () => {
      const { admin, workspaceId } = await scenario();
      const a = await seedTarget({ name: "An" });
      const b = await seedTarget({ name: "Bình" });

      const res = await lookup(admin, workspaceId, "0912345678");

      expect((res.body.data as Array<{ userId: string }>).map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
    });

    it.each([["Lan Nguyễn"], ["0912"], ["lan@"], ["lan.nguyen"], ["0112345678"]])(
      "tên / chuỗi dở dang %j → 400, KHÔNG tra cứu theo tiền tố",
      async (q) => {
        const { admin, workspaceId } = await scenario();
        await seedTarget({ email: "lan.nguyen@example.com" });
        const res = await lookup(admin, workspaceId, q);
        expect(res.status).toBe(400);
      }
    );

    it("email/SĐT không có tài khoản → mảng rỗng", async () => {
      const { admin, workspaceId } = await scenario();
      expect((await lookup(admin, workspaceId, "khong.co@example.com")).body.data).toEqual([]);
      expect((await lookup(admin, workspaceId, "0987654321")).body.data).toEqual([]);
    });

    it("riêng tư: tắt findableByPhone → tra bằng SĐT không thấy, tra bằng email vẫn thấy nhưng KHÔNG có gợi ý SĐT", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget({ email: "an@example.com" });
      await prisma.user.update({
        where: { id: target.id },
        data: { privacy: { readReceipts: true, showPresence: true, findableByPhone: false } },
      });

      expect((await lookup(admin, workspaceId, "0912345678")).body.data).toEqual([]);
      const byEmail = await lookup(admin, workspaceId, "an@example.com");
      expect(byEmail.body.data).toHaveLength(1);
      expect(byEmail.body.data[0].hint).toBeNull();
    });

    it("riêng tư: tắt findableByEmail → tra bằng email không thấy, tra bằng SĐT vẫn thấy nhưng KHÔNG có gợi ý email", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget({ email: "an@example.com" });
      await prisma.user.update({
        where: { id: target.id },
        data: { privacy: { readReceipts: true, showPresence: true, findableByEmail: false } },
      });

      expect((await lookup(admin, workspaceId, "an@example.com")).body.data).toEqual([]);
      const byPhone = await lookup(admin, workspaceId, "0912345678");
      expect(byPhone.body.data).toHaveLength(1);
      expect(byPhone.body.data[0].hint).toBeNull();
    });

    it("tài khoản không ACTIVE (bị khoá / chờ xoá) và chính người tra → không thấy", async () => {
      const { admin, workspaceId } = await scenario();
      const locked = await seedTarget({ email: "locked@example.com" });
      await prisma.user.update({ where: { id: locked.id }, data: { status: "LOCKED" } });
      const self = await prisma.user.findUniqueOrThrow({ where: { id: admin } });
      await prisma.user.update({ where: { id: admin }, data: { phone: "+84912345678" } });

      expect((await lookup(admin, workspaceId, "locked@example.com")).body.data).toEqual([]);
      expect((await lookup(admin, workspaceId, self.email)).body.data).toEqual([]);
      expect((await lookup(admin, workspaceId, "0912345678")).body.data).toEqual([]);
    });

    it("người đã chặn / bị chặn với người tra → coi như không tồn tại", async () => {
      const { admin, workspaceId } = await scenario();
      const blockedByMe = await seedTarget({ email: "b1@example.com", phone: null });
      const blockedMe = await seedTarget({ email: "b2@example.com", phone: null });
      await prisma.userBlock.create({ data: { blockerId: admin, blockedId: blockedByMe.id } });
      await prisma.userBlock.create({ data: { blockerId: blockedMe.id, blockedId: admin } });

      expect((await lookup(admin, workspaceId, "b1@example.com")).body.data).toEqual([]);
      expect((await lookup(admin, workspaceId, "b2@example.com")).body.data).toEqual([]);
    });

    it("trạng thái: đang là thành viên → ALREADY_MEMBER; đang bị chặn khỏi nhóm → BANNED", async () => {
      const { admin, member, workspaceId } = await scenario();
      const banned = await seedTarget({ email: "banned@example.com", phone: null });
      await kit.addMembership(workspaceId, banned.id, "MEMBER", { status: "BANNED", banReason: "x" });
      const memberEmail = (await prisma.user.findUniqueOrThrow({ where: { id: member } })).email;

      expect((await lookup(admin, workspaceId, memberEmail)).body.data[0].state).toBe("ALREADY_MEMBER");
      expect((await lookup(admin, workspaceId, "banned@example.com")).body.data[0].state).toBe("BANNED");
    });

    it("phân quyền: OWNER/ADMIN được; MEMBER → 403; người ngoài nhóm → 404; chưa đăng nhập → 401", async () => {
      const { owner, admin, member, workspaceId } = await scenario();
      const outsider = await kit.seedUser("Người ngoài");
      await seedTarget({ email: "an@example.com" });

      expect((await lookup(owner, workspaceId, "an@example.com")).status).toBe(200);
      expect((await lookup(admin, workspaceId, "an@example.com")).status).toBe(200);
      expect((await lookup(member, workspaceId, "an@example.com")).status).toBe(403);
      expect((await lookup(outsider, workspaceId, "an@example.com")).status).toBe(404);
      expect((await request(app).get(`/api/v1/workspaces/${workspaceId}/member-lookup`).query({ q: "an@example.com" })).status).toBe(401);
    });

    it("chống dò danh bạ: vượt 30 lượt/10 phút của một người dùng → 429", async () => {
      const { admin, workspaceId } = await scenario();
      let last = 200;
      for (let i = 0; i < 31; i += 1) last = (await lookup(admin, workspaceId, `x${i}@example.com`)).status;
      expect(last).toBe(429);
    });
  });

  describe("POST members (thêm thẳng)", () => {
    it("ADMIN thêm → 201 ADDED: membership MEMBER ACTIVE + kênh mặc định + memberCount + thông báo hộp thư + outbox + audit", async () => {
      const { admin, workspaceId, defaultChannelId } = await scenario();
      const target = await seedTarget();
      const before = await memberCount(workspaceId);

      const res = await add(admin, workspaceId, target.id);

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ userId: target.id, state: "ADDED" });
      const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: target.id } } });
      expect(row).toMatchObject({ role: "MEMBER", status: "ACTIVE", invitedBy: admin, leftAt: null });
      expect(await memberCount(workspaceId)).toBe(before + 1);
      expect(await prisma.channelMembership.count({ where: { channelId: defaultChannelId, userId: target.id } })).toBe(1);

      const notification = await prisma.notification.findFirstOrThrow({ where: { workspaceId, type: "workspace.member-added" } });
      expect(notification.actorId).toBe(admin);
      expect(notification.refs).toMatchObject({ workspaceId, workspaceName: "Nhóm thử" });
      expect(await prisma.notificationRecipient.count({ where: { recipientId: target.id, notificationId: notification.id, inInbox: true } })).toBe(1);
      expect(await prisma.outboxEvent.count({ where: { type: "membership.joined", aggregateId: `${workspaceId}:${target.id}` } })).toBe(1);
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ actorId: admin, action: "member.add", workspaceId }));
    });

    it("thêm lần nữa → 200 ALREADY_MEMBER, không đổi memberCount/không thêm thông báo (idempotent)", async () => {
      const { owner, workspaceId } = await scenario();
      const target = await seedTarget();
      await add(owner, workspaceId, target.id);
      const count = await memberCount(workspaceId);
      const notifications = await prisma.notification.count({ where: { workspaceId, type: "workspace.member-added" } });

      const again = await add(owner, workspaceId, target.id);

      expect(again.status).toBe(200);
      expect(again.body.data).toEqual({ userId: target.id, state: "ALREADY_MEMBER" });
      expect(await memberCount(workspaceId)).toBe(count);
      expect(await prisma.notification.count({ where: { workspaceId, type: "workspace.member-added" } })).toBe(notifications);
    });

    it("người từng rời nhóm (LEFT) → thêm lại thành ACTIVE, xoá dấu vết rời", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget();
      await kit.addMembership(workspaceId, target.id, "MEMBER", { status: "LEFT", leftAt: new Date(), leftReason: "LEFT" });

      expect((await add(admin, workspaceId, target.id)).status).toBe(201);

      const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: target.id } } });
      expect(row).toMatchObject({ status: "ACTIVE", leftAt: null, leftReason: null });
    });

    it("đang chờ duyệt (PENDING) → thêm thẳng thành ACTIVE và xoá lời xin", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget();
      await kit.addMembership(workspaceId, target.id, "MEMBER", { status: "PENDING", requestedAt: new Date(), requestMessage: "cho mình vào" });

      expect((await add(admin, workspaceId, target.id)).status).toBe(201);

      const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: target.id } } });
      expect(row).toMatchObject({ status: "ACTIVE", requestMessage: null, decidedBy: admin });
    });

    it("khách đã hết hạn được thêm lại làm MEMBER: vai trò về MEMBER, không còn hạn", async () => {
      const { admin, workspaceId } = await scenario();
      const target = await seedTarget();
      await kit.addMembership(workspaceId, target.id, "GUEST", { status: "REMOVED", leftReason: "EXPIRED", expiresAt: new Date(Date.now() - 1000) });

      expect((await add(admin, workspaceId, target.id)).status).toBe(201);

      const row = await prisma.workspaceMembership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: target.id } } });
      expect(row).toMatchObject({ role: "MEMBER", status: "ACTIVE", expiresAt: null });
    });

    it("đang bị chặn khỏi nhóm → 403 INV_004; chặn nhau với người thêm → 403 BLOCK_003", async () => {
      const { admin, workspaceId } = await scenario();
      const banned = await seedTarget();
      await kit.addMembership(workspaceId, banned.id, "MEMBER", { status: "BANNED" });
      const blocked = await seedTarget({ phone: null });
      await prisma.userBlock.create({ data: { blockerId: blocked.id, blockedId: admin } });

      const a = await add(admin, workspaceId, banned.id);
      const b = await add(admin, workspaceId, blocked.id);

      expect([a.status, a.body.error.code]).toEqual([403, "INV_004"]);
      expect([b.status, b.body.error.code]).toEqual([403, "BLOCK_003"]);
    });

    it("tài khoản không tồn tại / không ACTIVE → 404; id sai định dạng hoặc field lạ → 400; nhóm lưu trữ → 409", async () => {
      const { admin, workspaceId } = await scenario();
      const locked = await seedTarget();
      await prisma.user.update({ where: { id: locked.id }, data: { status: "LOCKED" } });

      expect((await add(admin, workspaceId, newObjectId())).status).toBe(404);
      expect((await add(admin, workspaceId, locked.id)).status).toBe(404);
      expect((await add(admin, workspaceId, "khong-phai-objectid")).status).toBe(400);
      expect((await request(app).post(`/api/v1/workspaces/${workspaceId}/members`).set(auth(admin)).send({ userId: locked.id, role: "OWNER" })).status).toBe(400);

      await prisma.workspace.update({ where: { id: workspaceId }, data: { status: "ARCHIVED" } });
      const target = await seedTarget();
      expect((await add(admin, workspaceId, target.id)).status).toBe(409);
    });

    it("phân quyền: MEMBER → 403, người ngoài nhóm → 404, chưa đăng nhập → 401", async () => {
      const { member, workspaceId } = await scenario();
      const outsider = await kit.seedUser("Người ngoài");
      const target = await seedTarget();

      expect((await add(member, workspaceId, target.id)).status).toBe(403);
      expect((await add(outsider, workspaceId, target.id)).status).toBe(404);
      expect((await request(app).post(`/api/v1/workspaces/${workspaceId}/members`).send({ userId: target.id })).status).toBe(401);
      expect(await prisma.workspaceMembership.count({ where: { workspaceId, userId: target.id } })).toBe(0);
    });

    it("đua: hai lượt thêm CÙNG người đồng thời → đúng MỘT thành viên, memberCount +1, không 500", async () => {
      const { admin, owner, workspaceId } = await scenario();
      const target = await seedTarget();
      const before = await memberCount(workspaceId);

      const results = await Promise.all([add(admin, workspaceId, target.id), add(owner, workspaceId, target.id)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
      expect(await prisma.workspaceMembership.count({ where: { workspaceId, userId: target.id } })).toBe(1);
      // Lượt thua (kể cả khi `withTransaction` chạy lại sau write-conflict) KHÔNG được cộng đếm/ghi thông báo/outbox lần nữa.
      expect(await memberCount(workspaceId)).toBe(before + 1);
      expect(await prisma.notification.count({ where: { workspaceId, type: "workspace.member-added" } })).toBe(1);
      expect(await prisma.outboxEvent.count({ where: { type: "membership.joined", aggregateId: `${workspaceId}:${target.id}` } })).toBe(1);
    });
  });
});
