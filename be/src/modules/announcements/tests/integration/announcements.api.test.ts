/**
 * Integration — xác nhận đã đọc thông báo p5-04 trên Prisma + Mongo THẬT (memory replset). Phủ RC-01 (xác nhận hai lần = một biên nhận),
 * RC-02 (đọc tin không tạo biên nhận), RC-03 (mất quyền kênh không nằm trong pending), quyền tạo/huỷ/xem, ANN_001/002/003, cờ phụ,
 * outbox + fan-out thông báo (idempotent) và audience `channelReaderIds` so với quyền đọc kênh thật.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setNx: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import request from "supertest";

import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { LIMITS } from "../../../../core/constants/limits";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { PrismaAnnouncementLookupRepository, PrismaAnnouncementRepository } from "../../repositories/announcement.repository.prisma";
import { AnnouncementNotifyService } from "../../services/announcement-notify.service";
import {
  addMembership,
  auth,
  buildP504App,
  cleanupP504,
  createFixtures,
  createP504Indexes,
  makeRedisStore,
  seedMessage,
  wireRedisMocks,
} from "../../../workspace-search/tests/integration/search-fixtures";

jest.setTimeout(90_000);

const app = buildP504App();
const store = makeRedisStore();
const fx = createFixtures(app);

interface ReceiptRow {
  userId: string;
  name: string | null;
  confirmedAt?: string;
}

describe("announcements (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    await createP504Indexes();
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    resetRuntimeConfig();
    await cleanupP504([...fx.workspaceIds], [...fx.userIds]);
    await fx.cleanup();
    store.clear();
    mockAuditRecord.mockClear();
  });

  async function createChannel(owner: string, workspaceId: string, body: Record<string, unknown>): Promise<string> {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner))
      .send({ name: `Kênh ${Math.random().toString(36).slice(2, 8)}`, visibility: "PUBLIC", ...body });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  /** owner (OWNER) + 2 thành viên; kênh thông báo ADMINS_ONLY công khai; một tin của chủ nhóm. */
  async function scenario(channelBody: Record<string, unknown> = {}) {
    const owner = await fx.newUser("Chủ nhóm");
    const alice = await fx.newUser("An");
    const bob = await fx.newUser("Bình");
    const workspaceId = await fx.newWorkspace(owner, [alice, bob]);
    const channelId = await createChannel(owner, workspaceId, { name: "Thông báo", postingPolicy: "ADMINS_ONLY", ...channelBody });
    const message = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Nộp học phí trước thứ Sáu" });
    return { owner, alice, bob, workspaceId, channelId, messageId: message.id };
  }

  const announce = (user: string, messageId: string, body: Record<string, unknown> = {}) =>
    request(app).post(`/api/v1/messages/${messageId}/announcement`).set("Authorization", auth(user)).send(body);
  const confirm = (user: string, messageId: string) =>
    request(app).post(`/api/v1/messages/${messageId}/announcement/confirm`).set("Authorization", auth(user)).send({});
  const receipts = (user: string, messageId: string, params: Record<string, string | number> = {}) =>
    request(app).get(`/api/v1/messages/${messageId}/announcement/receipts`).query(params).set("Authorization", auth(user));

  it("tạo yêu cầu (201) rồi bấm lại → 200 idempotent; ghi outbox announcement.notify; người thường không tạo được (403)", async () => {
    const s = await scenario();
    const denied = await announce(s.alice, s.messageId);
    expect(denied.status).toBe(403);

    const first = await announce(s.owner, s.messageId);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ messageId: s.messageId, channelId: s.channelId, requestedBy: s.owner, expired: false, canViewReceipts: true, confirmedCount: 0 });
    const request1 = await prisma.announcementRequest.findUniqueOrThrow({ where: { messageId: s.messageId } });
    expect(request1.cancelledAt).toBeNull();
    expect(request1.deadlineAt).toBeNull();
    expect(await prisma.outboxEvent.count({ where: { dedupeKey: `announcement.notify:msg:${s.messageId}` } })).toBe(1);

    const second = await announce(s.owner, s.messageId);
    expect(second.status).toBe(200);
    expect(await prisma.announcementRequest.count({ where: { channelId: s.channelId } })).toBe(1);
  });

  it("ANN_001: kênh không phải ADMINS_ONLY → 400; tin thuộc thread hoặc không tồn tại → lỗi; hạn không hợp lệ → 400", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const workspaceId = await fx.newWorkspace(owner);
    const openChannel = await createChannel(owner, workspaceId, { postingPolicy: "MEMBERS" });
    const msg = await fx.sendOk(owner, "CHANNEL", openChannel, { content: "Tin thường" });
    const res = await announce(owner, msg.id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ANN_001");

    const s = await scenario();
    expect((await announce(s.owner, s.messageId, { deadlineAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    const far = new Date(Date.now() + (LIMITS.announcement.deadlineMaxDays + 2) * 86400_000).toISOString();
    expect((await announce(s.owner, s.messageId, { deadlineAt: far })).status).toBe(400);
    expect((await announce(s.owner, "a".repeat(24))).status).toBe(404);
  });

  it("RC-01: người nhận bấm xác nhận hai lần → MỘT biên nhận, confirmedCount = 1; người ngoài nhóm → 404", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId);
    const first = await confirm(s.alice, s.messageId);
    const second = await confirm(s.alice, s.messageId);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.confirmedAt).toBe(first.body.data.confirmedAt);

    const requestRow = await prisma.announcementRequest.findUniqueOrThrow({ where: { messageId: s.messageId } });
    expect(requestRow.confirmedCount).toBe(1);
    expect(await prisma.announcementReceipt.count({ where: { requestId: requestRow.id } })).toBe(1);

    const outsider = await fx.newUser("Người ngoài");
    expect((await confirm(outsider, s.messageId)).status).toBe(404);
  });

  it("RC-01 (song song): hai lượt xác nhận đồng thời của cùng một người vẫn chỉ một biên nhận", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId);
    const results = await Promise.all([confirm(s.bob, s.messageId), confirm(s.bob, s.messageId), confirm(s.bob, s.messageId)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const requestRow = await prisma.announcementRequest.findUniqueOrThrow({ where: { messageId: s.messageId } });
    expect(await prisma.announcementReceipt.count({ where: { requestId: requestRow.id } })).toBe(1);
    expect(requestRow.confirmedCount).toBe(1);
  });

  it("RC-02: đọc tin (danh sách tin của kênh) không tạo biên nhận — người đọc vẫn nằm trong pending", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId);
    const list = await request(app).get(`/api/v1/channels/${s.channelId}/messages`).set("Authorization", auth(s.alice));
    expect(list.status).toBe(200);

    const requestRow = await prisma.announcementRequest.findUniqueOrThrow({ where: { messageId: s.messageId } });
    expect(await prisma.announcementReceipt.count({ where: { requestId: requestRow.id } })).toBe(0);
    const pending = await receipts(s.owner, s.messageId, { status: "pending" });
    expect(pending.status).toBe(200);
    expect((pending.body.data as ReceiptRow[]).map((r) => r.userId).sort()).toEqual([s.alice, s.bob].sort());
    expect(pending.body.meta).toMatchObject({ confirmedCount: 0, audienceCount: 2 });
  });

  it("RC-03: người mất quyền kênh (riêng tư) không nằm trong pending và không tính vào audienceCount", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const alice = await fx.newUser("An");
    const bob = await fx.newUser("Bình");
    const workspaceId = await fx.newWorkspace(owner, [alice, bob]);
    const channelId = await createChannel(owner, workspaceId, { visibility: "PRIVATE", postingPolicy: "ADMINS_ONLY", initialMemberIds: [alice, bob] });
    const message = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Thông báo kín" });
    await announce(owner, message.id);

    const before = await receipts(owner, message.id, { status: "pending" });
    expect((before.body.data as ReceiptRow[]).map((r) => r.userId).sort()).toEqual([alice, bob].sort());

    await prisma.channelGrant.deleteMany({ where: { channelId, userId: bob } });
    const after = await receipts(owner, message.id, { status: "pending" });
    expect((after.body.data as ReceiptRow[]).map((r) => r.userId)).toEqual([alice]);
    expect(after.body.meta.audienceCount).toBe(1);
    // bob không còn đọc được kênh nên xác nhận bị từ chối
    expect((await confirm(bob, message.id)).status).toBe(404);
  });

  it("danh sách đã/chưa xác nhận: chỉ người yêu cầu/quản trị kênh; confirmed có confirmedAt và tên", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId);
    await confirm(s.alice, s.messageId);

    expect((await receipts(s.bob, s.messageId)).status).toBe(403);
    const confirmed = await receipts(s.owner, s.messageId, { status: "confirmed" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data).toEqual([expect.objectContaining({ userId: s.alice, name: "An", confirmedAt: expect.any(String) })]);
    expect(confirmed.body.meta).toMatchObject({ confirmedCount: 1, audienceCount: 2, hasMore: false });
    const pending = await receipts(s.owner, s.messageId, { status: "pending" });
    expect((pending.body.data as ReceiptRow[]).map((r) => r.userId)).toEqual([s.bob]);
  });

  it("huỷ (204, idempotent) → xác nhận 410 ANN_003, GET 404; khôi phục lại được; quá 10 yêu cầu còn hiệu lực → 409 ANN_002", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId);
    const memberCancel = await request(app).delete(`/api/v1/messages/${s.messageId}/announcement`).set("Authorization", auth(s.alice));
    expect(memberCancel.status).toBe(403);
    const cancel = await request(app).delete(`/api/v1/messages/${s.messageId}/announcement`).set("Authorization", auth(s.owner));
    expect(cancel.status).toBe(204);
    expect((await request(app).delete(`/api/v1/messages/${s.messageId}/announcement`).set("Authorization", auth(s.owner))).status).toBe(204);

    const gone = await confirm(s.alice, s.messageId);
    expect(gone.status).toBe(410);
    expect(gone.body.error.code).toBe("ANN_003");
    expect((await request(app).get(`/api/v1/messages/${s.messageId}/announcement`).set("Authorization", auth(s.alice))).status).toBe(404);

    expect((await announce(s.owner, s.messageId)).status).toBe(201); // khôi phục cùng yêu cầu
    expect(await prisma.announcementRequest.count({ where: { channelId: s.channelId } })).toBe(1);
    expect((await confirm(s.alice, s.messageId)).status).toBe(200);

    // Chèn thẳng tin (không qua engine) để không chạm hạn mức gửi tin 5 tin/5 giây.
    const seed = (content: string) =>
      seedMessage({ scopeType: "CHANNEL", scopeId: s.channelId, workspaceId: s.workspaceId, authorId: s.owner, content });
    for (let i = 1; i < LIMITS.announcement.perChannelActiveMax; i += 1) {
      expect((await announce(s.owner, await seed(`Thông báo số ${i}`))).status).toBe(201);
    }
    const over = await announce(s.owner, await seed("Thông báo thừa"));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("ANN_002");
  });

  it("GET /channels/:id/announcements: huy hiệu theo góc nhìn từng người (confirmedByMe; số liệu chỉ cho người yêu cầu)", async () => {
    const s = await scenario();
    await announce(s.owner, s.messageId, { deadlineAt: new Date(Date.now() + 3 * 86400_000).toISOString() });
    await confirm(s.alice, s.messageId);

    const asAlice = await request(app).get(`/api/v1/channels/${s.channelId}/announcements`).set("Authorization", auth(s.alice));
    expect(asAlice.status).toBe(200);
    expect(asAlice.body.data).toEqual([expect.objectContaining({ messageId: s.messageId, confirmedByMe: true, canViewReceipts: false, expired: false })]);
    expect(asAlice.body.data[0]).not.toHaveProperty("confirmedCount");
    const asBob = await request(app).get(`/api/v1/channels/${s.channelId}/announcements`).set("Authorization", auth(s.bob));
    expect(asBob.body.data[0].confirmedByMe).toBe(false);
    const asOwner = await request(app).get(`/api/v1/channels/${s.channelId}/announcements`).set("Authorization", auth(s.owner));
    expect(asOwner.body.data[0]).toMatchObject({ canViewReceipts: true, confirmedCount: 1 });
  });

  it("cờ phụ readConfirm tắt → 404 CFG_005", async () => {
    const s = await scenario();
    store.redisStore.set("cfg:features", { value: { readConfirm: false }, version: 1 });
    resetRuntimeConfig();
    const res = await announce(s.owner, s.messageId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CFG_005");
  });

  describe("fan-out thông báo (job announcement.notify / deadline-remind)", () => {
    const service = () => {
      const lookup = new PrismaAnnouncementLookupRepository();
      return new AnnouncementNotifyService(new PrismaAnnouncementRepository(), lookup, (id) => lookup.channelReaderIds(id));
    };
    // Chỉ đếm mục hộp thư của yêu cầu xác nhận (kênh riêng tư tạo trong test cũng gửi `channel.private-added`).
    const inboxOf = (userId: string) => prisma.notificationRecipient.count({ where: { recipientId: userId, dedupeKey: { startsWith: "announcement." } } });

    it("gửi người đọc được kênh (trừ người yêu cầu), chạy lại không nhân đôi; nhắc hạn chỉ người chưa xác nhận", async () => {
      const s = await scenario();
      await announce(s.owner, s.messageId, { deadlineAt: new Date(Date.now() + 3 * 86400_000).toISOString() });
      expect(await prisma.outboxEvent.count({ where: { jobName: "announcement.deadline-remind", aggregateId: s.messageId } })).toBe(1);

      const stats = await service().notifyRequired(s.messageId);
      expect(stats).toMatchObject({ candidates: 2, notified: 2 });
      expect([await inboxOf(s.alice), await inboxOf(s.bob), await inboxOf(s.owner)]).toEqual([1, 1, 0]);
      await service().notifyRequired(s.messageId); // retry job
      expect([await inboxOf(s.alice), await inboxOf(s.bob)]).toEqual([1, 1]);

      await confirm(s.alice, s.messageId);
      const deadline = (await prisma.announcementRequest.findUniqueOrThrow({ where: { messageId: s.messageId } })).deadlineAt!;
      // giả lập "sắp tới hạn": nhắc chỉ người chưa xác nhận (Bình)
      const remind = await service().remind(s.messageId, deadline.toISOString());
      expect(remind).toMatchObject({ candidates: 1, notified: 1 });
      expect([await inboxOf(s.alice), await inboxOf(s.bob)]).toEqual([1, 2]);
      await service().remind(s.messageId, deadline.toISOString());
      expect(await inboxOf(s.bob)).toBe(2);
    });

    it("yêu cầu đã huỷ → không gửi; audience channelReaderIds khớp quyền đọc: khách không grant bị loại, khách chỉ định + vai trò MEMBER được tính", async () => {
      const s = await scenario();
      const guestDesignated = await fx.newUser("Khách chỉ định");
      const guestOther = await fx.newUser("Khách khác");
      await addMembership(s.workspaceId, guestDesignated, "GUEST");
      await addMembership(s.workspaceId, guestOther, "GUEST");
      await prisma.channelGrant.create({
        data: { channelId: s.channelId, workspaceId: s.workspaceId, userId: guestDesignated, subjectKey: guestDesignated, level: "MEMBER", source: "DIRECT", grantedBy: s.owner },
      });
      const lookup = new PrismaAnnouncementLookupRepository();
      const publicReaders = (await lookup.channelReaderIds(s.channelId)).sort();
      expect(publicReaders).toEqual([s.owner, s.alice, s.bob, guestDesignated].sort());

      const privateChannel = await createChannel(s.owner, s.workspaceId, { visibility: "PRIVATE", initialMemberIds: [s.alice] });
      expect((await lookup.channelReaderIds(privateChannel)).sort()).toEqual([s.owner, s.alice].sort());
      await prisma.channelGrant.create({
        data: { channelId: privateChannel, workspaceId: s.workspaceId, userId: null, subjectKey: "role:MEMBER", level: "MEMBER", source: "ROLE", roleRef: "MEMBER", grantedBy: s.owner },
      });
      const viaRole = (await lookup.channelReaderIds(privateChannel)).sort();
      expect(viaRole).toEqual([s.owner, s.alice, s.bob].sort()); // vai trò MEMBER phủ OWNER+ADMIN+MEMBER, không phủ khách
      expect(viaRole).not.toContain(guestOther);

      await announce(s.owner, s.messageId);
      await request(app).delete(`/api/v1/messages/${s.messageId}/announcement`).set("Authorization", auth(s.owner));
      const cancelled = await service().notifyRequired(s.messageId);
      expect(cancelled.skipped).toBe("cancelled");
      expect(await inboxOf(s.alice)).toBe(0);
    });
  });
});
