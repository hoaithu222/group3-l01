/**
 * Integration — danh sách/cá nhân/media (Mongo memory replset): CV-10 (xoá
 * phía tôi + tự hiện lại khi có tin mới — CŨNG là bài test hồi quy cho lỗi
 * "Prisma Mongo không khớp `{field: null}` với field bị bỏ trống lúc tạo",
 * item 4 báo cáo tác vụ — `onMessageCommitted()`'s `OR: [{mutedUntil:null},…]`
 * CHỈ đúng nếu `mutedUntil` được ghi `null` tường minh lúc tạo member), CV-11
 * (ghim hội thoại thứ 21 → `CONV_009`), CV-12 (đánh dấu chưa đọc), CV-15
 * (lọc + tìm không dấu), CV-19 (thư viện media loại tin thu hồi/tin bị ẩn),
 * CV-22 (phân trang ổn định khi có hoạt động mới).
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

import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import conversationsRoutes from "../../conversations.routes";
import { createScopedMessageRouter } from "../../../messages/messages.routes";
import { registerConversationModule } from "../../index";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("conversations danh sách/media — CV-10/11/12/15/19/22", () => {
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerConversationModule();
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
    await cleanupConversationsFixtures({
      conversationIds: createdConversationIds,
      workspaceIds: createdWorkspaceIds,
      userIds: createdUserIds,
    });
    createdWorkspaceIds.length = 0;
    createdUserIds.length = 0;
    createdConversationIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  async function seedWorkspace(ownerId: string, name = "Nhóm danh sách hội thoại"): Promise<string> {
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return workspaceId;
  }

  async function createDirect(a: string, b: string): Promise<string> {
    const res = await request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(a)}`).send({ userId: b });
    expect([200, 201]).toContain(res.status);
    const id = res.body.data.id as string;
    createdConversationIds.push(id);
    return id;
  }

  async function sendMessage(conversationId: string, userId: string, content: string) {
    return request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(userId)}`)
      .send({ clientMessageId: randomUUID(), content });
  }

  it("CV-10 (+ hồi quy field-null): xoá phía tôi ẩn lịch sử cũ; tin mới của người kia tự BỎ lưu trữ (không cần muted)", async () => {
    const a = await seedUser({ name: "A xoá phía tôi" });
    const b = await seedUser({ name: "B gửi tin mới" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");
    const conversationId = await createDirect(a.id, b.id);

    const first = await sendMessage(conversationId, a.id, "Tin nhắn cũ trước khi xoá");
    expect(first.status).toBe(201);

    const clear = await request(app).post(`/api/v1/conversations/${conversationId}/clear`).set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(clear.status).toBe(200);
    expect(clear.body.data.hiddenBeforeSeq).toBeGreaterThanOrEqual(1);

    const memberAfterClear = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b.id } },
    });
    expect(memberAfterClear.archivedAt).not.toBeNull();
    expect(memberAfterClear.hiddenBeforeSeq).toBe(memberAfterClear.lastReadSeq);

    // Danh sách mặc định (archivedAt=null) KHÔNG còn thấy; filter=archived thì thấy.
    const listDefault = await request(app).get("/api/v1/conversations").set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(listDefault.body.data.map((c: { id: string }) => c.id)).not.toContain(conversationId);
    const listArchived = await request(app).get("/api/v1/conversations?filter=archived").set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(listArchived.body.data.map((c: { id: string }) => c.id)).toContain(conversationId);

    // Lịch sử cũ không còn thấy qua alias messages.
    const historyAfterClear = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(historyAfterClear.body.data.some((m: { content?: string }) => m.content === "Tin nhắn cũ trước khi xoá")).toBe(false);

    // Tin MỚI của A → `onMessageCommitted()` bỏ lưu trữ cho B (không muted) —
    // updateMany filter `OR:[{mutedUntil:null},...]` CHỈ khớp nếu `mutedUntil`
    // được ghi null tường minh lúc tạo `ConversationMember` (item 4 báo cáo).
    const second = await sendMessage(conversationId, a.id, "Tin nhắn MỚI sau khi B đã xoá phía B");
    expect(second.status).toBe(201);

    const memberAfterNewMsg = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b.id } },
    });
    expect(memberAfterNewMsg.archivedAt).toBeNull();

    const listAfterNewMsg = await request(app).get("/api/v1/conversations").set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(listAfterNewMsg.body.data.map((c: { id: string }) => c.id)).toContain(conversationId);

    // Mở lại chỉ thấy tin MỚI, không thấy tin cũ đã xoá phía tôi.
    const historyAfterNewMsg = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`);
    const contents = historyAfterNewMsg.body.data.map((m: { content?: string }) => m.content);
    expect(contents).toContain("Tin nhắn MỚI sau khi B đã xoá phía B");
    expect(contents).not.toContain("Tin nhắn cũ trước khi xoá");
  }, 20_000);

  it("CV-10b (hồi quy field-null độc lập): archive qua PATCH .../me {archived:true} rồi có tin mới → cũng tự bỏ lưu trữ", async () => {
    const a = await seedUser({ name: "A archived-via-me" });
    const b = await seedUser({ name: "B archived-via-me" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");
    const conversationId = await createDirect(a.id, b.id);

    const archive = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/me`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .send({ archived: true });
    expect(archive.status).toBe(200);
    expect(archive.body.data.archivedAt).not.toBeNull();
    // Xác nhận đã LƯU THẬT trong DB (không chỉ HTTP 200) — đúng yêu cầu item 4.
    const persisted = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b.id } },
    });
    expect(persisted.archivedAt).not.toBeNull();

    const msg = await sendMessage(conversationId, a.id, "Tin mới → tự bỏ lưu trữ (archived-via-me)");
    expect(msg.status).toBe(201);
    const afterMsg = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b.id } },
    });
    expect(afterMsg.archivedAt).toBeNull();
  });

  it("CV-10c: đang TẮT TIẾNG (muted) khi có tin mới → KHÔNG tự bỏ lưu trữ", async () => {
    const a = await seedUser({ name: "A muted test" });
    const b = await seedUser({ name: "B muted test" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");
    const conversationId = await createDirect(a.id, b.id);

    await request(app)
      .patch(`/api/v1/conversations/${conversationId}/me`)
      .set("Authorization", `Bearer ${tokenFor(b.id)}`)
      .send({ archived: true, notifyMode: "MUTED" });

    const msg = await sendMessage(conversationId, a.id, "Tin mới nhưng B đang tắt tiếng");
    expect(msg.status).toBe(201);
    const afterMsg = await prisma.conversationMember.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: b.id } },
    });
    expect(afterMsg.archivedAt).not.toBeNull(); // vẫn lưu trữ vì đang MUTED
  });

  it("CV-11: ghim hội thoại thứ 21 → 409 CONV_009 (tối đa 20/người)", async () => {
    const a = await seedUser({ name: "A ghim nhiều" });
    createdUserIds.push(a.id);
    const workspaceId = await seedWorkspace(a.id);
    const peers = await Promise.all(Array.from({ length: 21 }, (_, i) => seedUser({ name: `Peer ghim ${i}` })));
    for (const p of peers) {
      createdUserIds.push(p.id);
      await addMembership(workspaceId, p.id, "MEMBER");
    }

    const conversationIds: string[] = [];
    for (const p of peers) {
      conversationIds.push(await createDirect(a.id, p.id));
    }

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .patch(`/api/v1/conversations/${conversationIds[i]}/me`)
        .set("Authorization", `Bearer ${tokenFor(a.id)}`)
        .send({ pinned: true });
      expect(res.status).toBe(200);
    }

    const overLimit = await request(app)
      .patch(`/api/v1/conversations/${conversationIds[20]}/me`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ pinned: true });
    expect(overLimit.status).toBe(409);
    expect(overLimit.body.error.code).toBe("CONV_009");

    const pinnedCount = await prisma.conversationMember.count({ where: { userId: a.id, status: "ACTIVE", pinnedAt: { not: null } } });
    expect(pinnedCount).toBe(20);
  }, 30_000);

  it("CV-12: đánh dấu chưa đọc bật/tắt qua PATCH .../me, phản ánh đúng ở filter=unread", async () => {
    const a = await seedUser({ name: "A đánh dấu chưa đọc" });
    const b = await seedUser({ name: "B đánh dấu chưa đọc" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");
    const conversationId = await createDirect(a.id, b.id);

    const markUnread = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/me`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ markedUnread: true });
    expect(markUnread.status).toBe(200);
    expect(markUnread.body.data.markedUnread).toBe(true);

    const unreadList = await request(app).get("/api/v1/conversations?filter=unread").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(unreadList.body.data.map((c: { id: string }) => c.id)).toContain(conversationId);

    const markRead = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/me`)
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .send({ markedUnread: false });
    expect(markRead.status).toBe(200);
    const unreadListAfter = await request(app).get("/api/v1/conversations?filter=unread").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(unreadListAfter.body.data.map((c: { id: string }) => c.id)).not.toContain(conversationId);
  });

  it("CV-15: tìm không dấu khớp tên peer (DIRECT) và tên nhóm (GROUP); filter direct/group/pinned/archived đúng", async () => {
    const a = await seedUser({ name: "A tìm kiếm" });
    const peer = await seedUser({ name: "Nguyễn Văn B" });
    const other = await seedUser({ name: "Trần Thị C" });
    createdUserIds.push(a.id, peer.id, other.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, peer.id, "MEMBER");
    await addMembership(workspaceId, other.id, "MEMBER");

    const directId = await createDirect(a.id, peer.id);
    const otherDirectId = await createDirect(a.id, other.id);

    const groupRes = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(a.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Đồ án nhóm 1", memberIds: [peer.id] });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.data.id as string;
    createdConversationIds.push(groupId);

    const searchPeer = await request(app).get("/api/v1/conversations?q=nguyen%20van").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    const peerIds = searchPeer.body.data.map((c: { id: string }) => c.id);
    expect(peerIds).toContain(directId);
    expect(peerIds).not.toContain(otherDirectId);
    expect(peerIds).not.toContain(groupId);

    const searchGroup = await request(app).get("/api/v1/conversations?q=do%20an").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    const groupIds = searchGroup.body.data.map((c: { id: string }) => c.id);
    expect(groupIds).toContain(groupId);
    expect(groupIds).not.toContain(directId);

    const onlyDirect = await request(app).get("/api/v1/conversations?filter=direct").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    for (const c of onlyDirect.body.data) expect(c.kind).toBe("DIRECT");
    expect(onlyDirect.body.data.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([directId, otherDirectId]));

    const onlyGroup = await request(app).get("/api/v1/conversations?filter=group").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    for (const c of onlyGroup.body.data) expect(c.kind).toBe("GROUP");
    expect(onlyGroup.body.data.map((c: { id: string }) => c.id)).toContain(groupId);

    await request(app).patch(`/api/v1/conversations/${directId}/me`).set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ pinned: true });
    const pinnedList = await request(app).get("/api/v1/conversations?filter=pinned").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(pinnedList.body.data.map((c: { id: string }) => c.id)).toEqual([directId]);

    await request(app).patch(`/api/v1/conversations/${otherDirectId}/me`).set("Authorization", `Bearer ${tokenFor(a.id)}`).send({ archived: true });
    const archivedList = await request(app).get("/api/v1/conversations?filter=archived").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(archivedList.body.data.map((c: { id: string }) => c.id)).toEqual([otherDirectId]);
  }, 20_000);

  it("CV-19: thư viện media loại tin đã thu hồi (deletedAt) và tin bị người xem ẩn (MessageHide)", async () => {
    const a = await seedUser({ name: "A media" });
    const b = await seedUser({ name: "B media" });
    createdUserIds.push(a.id, b.id);
    const workspaceId = await seedWorkspace(a.id);
    await addMembership(workspaceId, b.id, "MEMBER");
    const conversationId = await createDirect(a.id, b.id);

    function attachment(assetId: string) {
      return {
        assetId,
        kind: "IMAGE" as const,
        name: "photo.jpg",
        mime: "image/jpeg",
        size: 1024,
        waveform: [] as number[],
      };
    }

    // item 4 báo cáo tác vụ / `message.repository.prisma.ts` dòng ~194-205 —
    // Prisma+Mongo KHÔNG khớp `{field: null}` với field bị BỎ TRỐNG lúc
    // `create()` (chỉ khớp field thật sự lưu giá trị null) — seed trực tiếp ở
    // đây PHẢI tự ghi `deletedAt/deletedBy/pinnedAt/pinnedBy/editedAt: null`
    // tường minh như service thật làm, nếu không `ConversationMediaService`'s
    // `where: {deletedAt: null, ...}` sẽ không khớp được gì cả (tự bắt được
    // lỗi này khi viết test — xác nhận: bỏ trống 3 dòng dưới → 0 kết quả).
    const visible = await prisma.message.create({
      data: {
        scopeType: "CONVERSATION",
        scopeId: conversationId,
        seq: 1,
        authorId: a.id,
        dedupeKey: `s:cv19-visible-${conversationId}`,
        content: "Ảnh còn thấy",
        attachments: [attachment("507f1f77bcf86cd799439011")],
        deletedAt: null,
        deletedBy: null,
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
      },
    });
    const recalled = await prisma.message.create({
      data: {
        scopeType: "CONVERSATION",
        scopeId: conversationId,
        seq: 2,
        authorId: a.id,
        dedupeKey: `s:cv19-recalled-${conversationId}`,
        content: "Ảnh đã thu hồi",
        attachments: [attachment("507f1f77bcf86cd799439012")],
        deletedAt: new Date(),
        deletedBy: a.id,
        deleteMode: "AUTHOR_RECALL",
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
      },
    });
    const hiddenForB = await prisma.message.create({
      data: {
        scopeType: "CONVERSATION",
        scopeId: conversationId,
        seq: 3,
        authorId: a.id,
        dedupeKey: `s:cv19-hidden-${conversationId}`,
        content: "Ảnh B đã ẩn",
        attachments: [attachment("507f1f77bcf86cd799439013")],
        deletedAt: null,
        deletedBy: null,
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
      },
    });
    await prisma.messageHide.create({
      data: { userId: b.id, messageId: hiddenForB.id, scopeType: "CONVERSATION", scopeId: conversationId, seq: 3 },
    });
    void recalled;

    const media = await request(app).get(`/api/v1/conversations/${conversationId}/media?kind=MEDIA`).set("Authorization", `Bearer ${tokenFor(b.id)}`);
    expect(media.status).toBe(200);
    const messageIds = media.body.data.map((m: { messageId: string }) => m.messageId);
    expect(messageIds).toEqual([visible.id]);
  });

  it("CV-22: phân trang ổn định — hoạt động mới đẩy 1 hội thoại lên đầu KHÔNG gây trùng mục giữa các trang đã đi qua bằng cursor", async () => {
    const a = await seedUser({ name: "A phân trang" });
    createdUserIds.push(a.id);
    const workspaceId = await seedWorkspace(a.id);
    const peers = await Promise.all(Array.from({ length: 6 }, (_, i) => seedUser({ name: `Peer trang ${i}` })));
    for (const p of peers) {
      createdUserIds.push(p.id);
      await addMembership(workspaceId, p.id, "MEMBER");
    }
    const conversationIds: string[] = [];
    const peerByConversationId = new Map<string, string>();
    for (const p of peers) {
      const id = await createDirect(a.id, p.id);
      conversationIds.push(id);
      peerByConversationId.set(id, p.id);
    }

    const page1 = await request(app).get("/api/v1/conversations?limit=2").set("Authorization", `Bearer ${tokenFor(a.id)}`);
    expect(page1.body.data).toHaveLength(2);
    const page1Ids: string[] = page1.body.data.map((c: { id: string }) => c.id);
    const cursor1 = page1.body.meta.nextCursor as string;
    expect(cursor1).toBeTruthy();

    // Đẩy 1 hội thoại CHƯA từng được trả về (chọn động, không giả định thứ tự
    // tie-break `id desc` — tránh chọn nhầm 1 hội thoại đã nằm sẵn trong
    // page1) lên đầu bằng hoạt động mới (tin nhắn mới → `activityAt` mới nhất).
    const notYetReturnedId = conversationIds.find((id) => !page1Ids.includes(id));
    expect(notYetReturnedId).toBeDefined();
    const bumpedConversationId = notYetReturnedId as string;
    const bumpMsg = await sendMessage(bumpedConversationId, peerByConversationId.get(bumpedConversationId) as string, "Đẩy lên đầu danh sách");
    expect(bumpMsg.status).toBe(201);

    const allPageIds: string[] = [...page1Ids];
    let cursor: string | null = cursor1;
    let guard = 0;
    while (cursor && guard < 10) {
      guard += 1;
      const page: { body: { data: Array<{ id: string }>; meta: { nextCursor: string | null } } } = await request(app)
        .get(`/api/v1/conversations?limit=2&cursor=${encodeURIComponent(cursor)}`)
        .set("Authorization", `Bearer ${tokenFor(a.id)}`);
      for (const item of page.body.data) allPageIds.push(item.id);
      cursor = page.body.meta.nextCursor;
    }

    // Không trùng lặp giữa các trang (yêu cầu cứng của CV-22) — hội thoại vừa
    // bị đẩy lên đầu SAU KHI cursor trang 1 đã phát ra không được xuất hiện
    // LẦN THỨ HAI dù `activityAt` của nó giờ mới nhất hệ thống.
    expect(new Set(allPageIds).size).toBe(allPageIds.length);
    // Không mất mục: mọi hội thoại KHÔNG bị đụng tới (5 cái không phải hội
    // thoại vừa bump) đều xuất hiện đúng 1 lần trong lượt đi cursor.
    const untouchedIds = conversationIds.filter((id) => id !== bumpedConversationId);
    for (const id of untouchedIds) expect(allPageIds).toContain(id);
    expect(allPageIds.filter((id) => untouchedIds.includes(id))).toHaveLength(untouchedIds.length);
  }, 20_000);
});
