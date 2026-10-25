/**
 * Integration — tin đã lưu + danh sách ghim p1-09 trên Prisma + Mongo THẬT (memory replset,
 * `TEST_DB=memory`), Redis mock stateful, socket thật (`saved:updated` đa thiết bị).
 *
 * Nghiệm thu phủ ở đây: SAV-01 (kể cả 2 request SONG SONG → unique index), SAV-02, DU-03, DU-04,
 * cùng giới hạn `SRCH_004`, quyền, lọc, cursor ghim, ghim hội thoại lọc tin bị ẩn (D-23).
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
import type { Socket as ClientSocket } from "socket.io-client";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { LIMITS } from "../../../../core/constants/limits";
import { newObjectId } from "../../../../core/utils/object-id";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { auth, buildDiscoveryApp, createDiscoveryIndexes, createFixtures, makeRedisStore, wireRedisMocks } from "./discovery-fixtures";

// Mỗi test tạo workspace/kênh/nhóm chat qua HTTP thật — vượt mặc định 5s (cùng `threads.routes.test.ts`).
jest.setTimeout(60_000);

const app = buildDiscoveryApp();
const store = makeRedisStore();
const fx = createFixtures(app);
/** DU-04 kiểm giới hạn GHIM, không kiểm burst gửi tin (5 tin/5 giây, `rl:msg:*` → RATE_002): xoá bộ đếm đó trước mỗi lượt seed để nhiều tin liên tiếp không bị chặn. */
const sendSeed = (...args: Parameters<typeof fx.sendOk>) => {
  store.dropPrefix("rl:msg:");
  return fx.sendOk(...args);
};

const save = (userId: string, messageId: string) => request(app).post(`/api/v1/messages/${messageId}/save`).set("Authorization", auth(userId));
const unsave = (userId: string, messageId: string) => request(app).delete(`/api/v1/messages/${messageId}/save`).set("Authorization", auth(userId));
const listSaved = (userId: string, query: Record<string, string | number> = {}) =>
  request(app).get("/api/v1/me/saved").query(query).set("Authorization", auth(userId));
const waitForEvent = <T>(client: ClientSocket, event: string): Promise<T> => new Promise((resolve) => client.once(event, resolve));

describe("discovery — tin đã lưu & danh sách ghim (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    await createDiscoveryIndexes();
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
    await fx.cleanup();
    store.clear();
    mockAuditRecord.mockClear();
  });

  async function publicChannel() {
    const owner = await fx.newUser("Chủ nhóm");
    const member = await fx.newUser("Thành viên");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const channelId = await fx.newChannel(owner, workspaceId);
    return { owner, member, workspaceId, channelId };
  }

  it("SAV-01: lưu cùng tin 2 lần → 200 idempotent, đúng 1 bản ghi; 2 request SONG SONG cũng không 500", async () => {
    const { owner, member, channelId } = await publicChannel();
    const msg = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Tài liệu ôn thi cuối kỳ" });

    const first = await save(member, msg.id);
    const second = await save(member, msg.id);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
    expect(first.body.data).toMatchObject({ messageId: msg.id, savedAt: expect.any(String) });

    const other = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Đua lưu" });
    const [r1, r2] = await Promise.all([save(member, other.id), save(member, other.id)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);

    expect(await prisma.savedMessage.count({ where: { userId: member, messageId: msg.id } })).toBe(1);
    expect(await prisma.savedMessage.count({ where: { userId: member, messageId: other.id } })).toBe(1);
    // Không báo tác giả: người lưu là riêng tư, tác giả không thấy gì
    expect((await listSaved(owner)).body.data).toEqual([]);
  });

  it("danh sách đã lưu: SavedItem đầy đủ, mới lưu → cũ, lọc scopeType, cursor", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const member = await fx.newUser("Thành viên");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const channelId = await fx.newChannel(owner, workspaceId);
    const conversationId = await fx.newGroup(owner, workspaceId, [member]);
    const inChannel = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Tin trong kênh" });
    const inConversation = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Tin trong nhóm chat" });
    await save(member, inChannel.id);
    await save(member, inConversation.id);

    const all = await listSaved(member);
    expect(all.status).toBe(200);
    expect(all.body.data.map((i: { messageId: string }) => i.messageId)).toEqual([inConversation.id, inChannel.id]);
    const [convItem, chanItem] = all.body.data;
    expect(chanItem).toMatchObject({
      available: true,
      scopeType: "CHANNEL",
      scopeId: channelId,
      workspaceId,
      message: { id: inChannel.id, authorId: owner, authorName: "Chủ nhóm", excerpt: "Tin trong kênh", attachmentsSummary: { count: 0, kinds: [] } },
      scope: { type: "CHANNEL", id: channelId, isPrivate: false },
    });
    expect(convItem).toMatchObject({
      scopeType: "CONVERSATION",
      scope: { type: "CONVERSATION", id: conversationId, name: "Nhóm chat discovery", kind: "GROUP", isPrivate: true },
    });
    expect(all.body.meta).toEqual({ nextCursor: null, hasMore: false, limit: 30 });

    const onlyChannel = await listSaved(member, { scopeType: "CHANNEL" });
    expect(onlyChannel.body.data.map((i: { messageId: string }) => i.messageId)).toEqual([inChannel.id]);

    const page1 = await listSaved(member, { limit: 1 });
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await listSaved(member, { limit: 1, cursor: page1.body.meta.nextCursor });
    expect(page2.body.data.map((i: { messageId: string }) => i.messageId)).toEqual([inChannel.id]);
    expect(page2.body.meta.hasMore).toBe(false);
  });

  it("DU-03: tác giả thu hồi tin đã lưu → mục 'không còn khả dụng', không lộ nội dung/thumbnail/tên phạm vi", async () => {
    const { owner, member, channelId } = await publicChannel();
    const msg = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Nội dung bí mật sẽ thu hồi" });
    await save(member, msg.id);

    const recall = await request(app).delete(`/api/v1/messages/${msg.id}`).set("Authorization", auth(owner)).send({});
    expect(recall.status).toBe(200);

    const res = await listSaved(member);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({ savedAt: expect.any(String), messageId: msg.id, available: false });
    expect(JSON.stringify(res.body)).not.toContain("bí mật");

    // lưu lại tin đã thu hồi → 409 MSG_006; bỏ lưu vẫn được
    const again = await save(member, msg.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("MSG_006");
    expect((await unsave(member, msg.id)).status).toBe(200);
    expect((await listSaved(member)).body.data).toEqual([]);
  });

  it("SAV-02: rời nhóm chat có tin đã lưu → mục thành unavailable (không có scope.name)", async () => {
    const owner = await fx.newUser("Chủ nhóm chat");
    const member = await fx.newUser("Người sẽ rời");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const conversationId = await fx.newGroup(owner, workspaceId, [member]);
    const msg = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Tin trong nhóm sẽ rời" });
    await save(member, msg.id);
    expect((await listSaved(member)).body.data[0]).toMatchObject({ available: true });

    const leave = await request(app).post(`/api/v1/conversations/${conversationId}/leave`).set("Authorization", auth(member));
    expect(leave.status).toBe(200);

    const res = await listSaved(member);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ savedAt: expect.any(String), messageId: msg.id, available: false });
    expect(JSON.stringify(res.body)).not.toContain("Nhóm chat discovery");
    // không lưu được thêm tin của nhóm đã rời
    const fresh = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Tin sau khi rời" });
    expect((await save(member, fresh.id)).status).toBe(404);
  });

  it("không đọc được tin → 404 khi lưu (không phân biệt tin không tồn tại); bỏ lưu tin lạ vẫn 200", async () => {
    const owner = await fx.newUser("Chủ kênh riêng");
    const outsider = await fx.newUser("Người ngoài");
    const workspaceId = await fx.newWorkspace(owner, [outsider]);
    const channelId = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE" });
    const msg = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Chỉ thành viên kênh riêng đọc được" });

    const res = await save(outsider, msg.id);
    const ghost = await save(outsider, newObjectId());
    expect(res.status).toBe(404);
    expect(ghost.status).toBe(404);
    expect(res.body.error.code).toBe(ghost.body.error.code);
    expect((await unsave(outsider, newObjectId())).status).toBe(200);
  });

  it("đã lưu đủ LIMITS.saved.max → 409 SRCH_004; lưu lại tin đã lưu vẫn 200; bỏ lưu 1 tin thì lưu được lại", async () => {
    const { owner, member, channelId } = await publicChannel();
    const kept = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Tin đã lưu từ trước" });
    const fresh = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Tin mới muốn lưu" });
    expect((await save(member, kept.id)).status).toBe(200);
    await prisma.savedMessage.createMany({
      data: Array.from({ length: LIMITS.saved.max - 1 }, () => ({
        userId: member,
        messageId: newObjectId(),
        scopeType: "CHANNEL" as const,
        scopeId: channelId,
      })),
    });

    const over = await save(member, fresh.id);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("SRCH_004");
    expect((await save(member, kept.id)).status).toBe(200);

    expect((await unsave(member, kept.id)).status).toBe(200);
    expect((await save(member, fresh.id)).status).toBe(200);
  });

  it("saved:updated tới MỌI thiết bị của người lưu (không tới người khác), chỉ khi trạng thái đổi", async () => {
    const { owner, member, channelId } = await publicChannel();
    const msg = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Tin để lưu đa thiết bị" });
    const deviceA = await connectClient(harness.port, { token: socketTokenFor(member, `${member}@e.com`), deviceId: "device-A" });
    const deviceB = await connectClient(harness.port, { token: socketTokenFor(member, `${member}@e.com`), deviceId: "device-B" });
    const stranger = await connectClient(harness.port, { token: socketTokenFor(owner, `${owner}@e.com`), deviceId: "device-owner" });
    const received: unknown[] = [];
    stranger.on("saved:updated", (p) => received.push(p));

    const savedOnB = waitForEvent<Record<string, unknown>>(deviceB, "saved:updated");
    expect((await save(member, msg.id)).status).toBe(200);
    expect(await savedOnB).toMatchObject({ v: 1, messageId: msg.id, saved: true, serverNow: expect.any(String) });

    const removedOnA = waitForEvent<Record<string, unknown>>(deviceA, "saved:updated");
    expect((await unsave(member, msg.id)).status).toBe(200);
    expect(await removedOnA).toMatchObject({ messageId: msg.id, saved: false });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toEqual([]);
    deviceA.disconnect();
    deviceB.disconnect();
    stranger.disconnect();
  }, 20_000);

  it("DU-04 (kênh): ghim tin thứ 21 → 409 MSG_010; danh sách ghim đủ 20, meta.total/max, pinnedByUser, cursor", async () => {
    const { owner, member, channelId } = await publicChannel();
    const ids: string[] = [];
    for (let i = 0; i < LIMITS.channel.pinMax + 1; i += 1) ids.push((await sendSeed(owner, "CHANNEL", channelId, { content: `Ghim số ${i}` })).id);
    const base = Date.now() - 3_600_000;
    for (let i = 0; i < LIMITS.channel.pinMax; i += 1) {
      await prisma.message.update({ where: { id: ids[i] }, data: { pinnedAt: new Date(base + i * 1000), pinnedBy: owner } });
    }

    const over = await request(app).post(`/api/v1/messages/${ids[LIMITS.channel.pinMax]}/pin`).set("Authorization", auth(owner));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("MSG_010");

    const list = await request(app).get(`/api/v1/channels/${channelId}/pins`).set("Authorization", auth(member));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(LIMITS.channel.pinMax);
    expect(list.body.meta).toEqual({ nextCursor: null, hasMore: false, limit: 30, total: LIMITS.channel.pinMax, max: LIMITS.channel.pinMax });
    // pinnedAt giảm dần (mới ghim trước); giữ nguyên hình MessageView p1-04 + pinnedByUser
    expect(list.body.data[0]).toMatchObject({ id: ids[LIMITS.channel.pinMax - 1], content: `Ghim số ${LIMITS.channel.pinMax - 1}`, pinnedBy: owner, pinnedByUser: { id: owner, name: "Chủ nhóm" } });
    const times = list.body.data.map((m: { pinnedAt: string }) => Date.parse(m.pinnedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // route gốc trả cùng dữ liệu; cursor limit=8 → 3 trang không trùng/sót
    const generic = await request(app).get(`/api/v1/scopes/CHANNEL/${channelId}/pins`).set("Authorization", auth(member));
    expect(generic.body.data).toEqual(list.body.data);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const res = await request(app).get(`/api/v1/channels/${channelId}/pins`).query({ limit: 8, ...(cursor && { cursor }) }).set("Authorization", auth(member));
      seen.push(...res.body.data.map((m: { id: string }) => m.id));
      cursor = res.body.meta.nextCursor ?? undefined;
      expect(res.body.meta.total).toBe(LIMITS.channel.pinMax);
    }
    expect(seen).toEqual(list.body.data.map((m: { id: string }) => m.id));
    expect(cursor).toBeUndefined();
  }, 60_000);

  it("DU-04 (hội thoại): ghim tin thứ 11 → 409 MSG_010; đủ 10; người xoá lịch sử phía mình không thấy tin ghim trước mốc", async () => {
    const owner = await fx.newUser("Chủ nhóm chat");
    const other = await fx.newUser("Thành viên chat");
    const workspaceId = await fx.newWorkspace(owner, [other]);
    const conversationId = await fx.newGroup(owner, workspaceId, [other]);
    const ids: string[] = [];
    for (let i = 0; i < LIMITS.conversation.pinMax + 1; i += 1) ids.push((await sendSeed(owner, "CONVERSATION", conversationId, { content: `Ghim chat ${i}` })).id);
    for (let i = 0; i < LIMITS.conversation.pinMax; i += 1) {
      const res = await request(app).post(`/api/v1/messages/${ids[i]}/pin`).set("Authorization", auth(owner));
      expect(res.status).toBe(200);
    }
    const over = await request(app).post(`/api/v1/messages/${ids[LIMITS.conversation.pinMax]}/pin`).set("Authorization", auth(owner));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("MSG_010");

    const list = await request(app).get(`/api/v1/conversations/${conversationId}/pins`).set("Authorization", auth(other));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(LIMITS.conversation.pinMax);
    expect(list.body.meta).toMatchObject({ total: LIMITS.conversation.pinMax, max: LIMITS.conversation.pinMax, hasMore: false });

    const clear = await request(app).post(`/api/v1/conversations/${conversationId}/clear`).set("Authorization", auth(other));
    expect(clear.status).toBe(200);
    const afterClear = await request(app).get(`/api/v1/conversations/${conversationId}/pins`).set("Authorization", auth(other));
    expect(afterClear.body.data).toEqual([]);
    expect(afterClear.body.meta).toMatchObject({ total: 0, max: LIMITS.conversation.pinMax });
    const ownerView = await request(app).get(`/api/v1/conversations/${conversationId}/pins`).set("Authorization", auth(owner));
    expect(ownerView.body.data).toHaveLength(LIMITS.conversation.pinMax);
  }, 90_000);

  it("ghim: người không đọc được phạm vi → 404; query limit sai → 400", async () => {
    const owner = await fx.newUser("Chủ kênh riêng");
    const outsider = await fx.newUser("Người ngoài");
    const workspaceId = await fx.newWorkspace(owner, [outsider]);
    const channelId = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE" });

    const denied = await request(app).get(`/api/v1/channels/${channelId}/pins`).set("Authorization", auth(outsider));
    expect(denied.status).toBe(404);
    const bad = await request(app).get(`/api/v1/channels/${channelId}/pins`).query({ limit: 0 }).set("Authorization", auth(owner));
    expect(bad.status).toBe(400);
  });
});
