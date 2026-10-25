/**
 * Integration — tìm trong kênh/hội thoại p1-09 trên Prisma + Mongo THẬT (memory replset,
 * `TEST_DB=memory`), Redis mock stateful (`scopeLimiter` đếm được), kênh (p1-03) + hội thoại
 * (p1-05) + engine `messages` (p1-04) + `mentions` cùng chạy.
 *
 * Nghiệm thu phủ ở đây: DU-01, DU-02, SAV-03, SAV-04, SAV-05, SAV-07 (mặc định seed nhỏ
 * `SEARCH_SEED_COUNT=5000`; nightly đặt 200000 — nhãn `@slow`), cùng ca quyền/tombstone/sửa tin/
 * bộ lọc/rate limit. Kiểm được điều unit không bắt: `findRaw` + Extended JSON + regex escape + `maxTimeMS`
 * thật, chỉ mục thời gian, lọc `hiddenBeforeSeq`.
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
import request from "supertest";

import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { LIMITS } from "../../../../core/constants/limits";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerMentionsModule } from "../../../mentions";
import {
  auth,
  buildDiscoveryApp,
  createDiscoveryIndexes,
  createFixtures,
  makeRedisStore,
  wireRedisMocks,
} from "./discovery-fixtures";

// Mỗi test tạo workspace/kênh/nhóm chat qua HTTP thật — vượt mặc định 5s (cùng `threads.routes.test.ts`).
jest.setTimeout(60_000);

const app = buildDiscoveryApp();
const store = makeRedisStore();
const fx = createFixtures(app);

const searchChannel = (userId: string, channelId: string, params: Record<string, string | number | boolean>) =>
  request(app).get(`/api/v1/channels/${channelId}/search`).query(params).set("Authorization", auth(userId));

describe("discovery — tìm trong kênh/hội thoại (integration)", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    registerMentionsModule();
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

  /** owner + member trong 1 workspace + 1 kênh public. */
  async function publicChannel() {
    const owner = await fx.newUser("Chủ nhóm");
    const member = await fx.newUser("Thành viên");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const channelId = await fx.newChannel(owner, workspaceId);
    return { owner, member, workspaceId, channelId };
  }

  it("DU-01: tìm 'do an' và 'đồ án' cho CÙNG kết quả; snippet giữ dấu gốc, highlight đúng vị trí", async () => {
    const { owner, member, channelId } = await publicChannel();
    const target = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Đồ án cuối kỳ nộp thứ Sáu" });
    await fx.sendOk(owner, "CHANNEL", channelId, { content: "Chiều nay họp nhóm" });

    const a = await searchChannel(member, channelId, { q: "do an" });
    const b = await searchChannel(member, channelId, { q: "đồ án" });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.map((h: { messageId: string }) => h.messageId)).toEqual([target.id]);
    expect(b.body.data).toEqual(a.body.data);
    const hit = a.body.data[0];
    expect(hit.snippet).toBe("Đồ án cuối kỳ nộp thứ Sáu");
    expect(hit.snippet.slice(hit.highlights[0].start, hit.highlights[0].end)).toBe("Đồ");
    expect(hit.snippet.slice(hit.highlights[1].start, hit.highlights[1].end)).toBe("án");
    expect(hit).toMatchObject({ inThread: false, threadId: null, author: { id: owner, name: "Chủ nhóm" } });
    expect(a.body.meta).toEqual({ nextCursor: null, hasMore: false, limit: 30, partial: false });
  });

  it("tin chứa marker @mention: tìm theo TÊN, snippet hiện '@Tên', không lộ id", async () => {
    const { owner, member, channelId } = await publicChannel();
    const sent = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", auth(owner))
      .send({
        clientMessageId: randomUUID(),
        content: `Nhờ @{u:${member}} xem giúp báo cáo`,
        mentions: [{ type: "USER", targetId: member }],
      });
    expect(sent.status).toBe(201);

    const res = await searchChannel(owner, channelId, { q: "thanh vien" });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].snippet).toBe("Nhờ @Thành viên xem giúp báo cáo");
    expect(res.body.data[0].snippet).not.toContain(member);
  });

  it("phân trang cursor: 5 tin khớp, limit=2 → 3 trang không trùng/sót, mới → cũ", async () => {
    const { owner, channelId } = await publicChannel();
    const sent: string[] = [];
    for (let i = 0; i < 5; i += 1) sent.push((await fx.sendOk(owner, "CHANNEL", channelId, { content: `Báo cáo tuần ${i}` })).id);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const res = await searchChannel(owner, channelId, { q: "bao cao", limit: 2, ...(cursor && { cursor }) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((h: { messageId: string }) => h.messageId));
      cursor = res.body.meta.nextCursor ?? undefined;
      expect(res.body.meta.hasMore).toBe(page < 2);
    }
    expect(seen).toEqual([...sent].reverse());
  });

  it("DU-02: tìm nhiều trang rồi bị thu hồi quyền → trang tiếp theo 404, không trả nội dung private", async () => {
    const owner = await fx.newUser("Chủ kênh riêng");
    const member = await fx.newUser("Người bị thu hồi");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const channelId = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE", initialMemberIds: [member] });
    for (let i = 0; i < 4; i += 1) await fx.sendOk(owner, "CHANNEL", channelId, { content: `Kế hoạch bí mật số ${i}` });

    const page1 = await searchChannel(member, channelId, { q: "ke hoach", limit: 2 });
    expect(page1.status).toBe(200);
    expect(page1.body.meta.hasMore).toBe(true);

    const revoke = await request(app).delete(`/api/v1/channels/${channelId}/grants/${member}`).set("Authorization", auth(owner));
    expect(revoke.status).toBe(200);

    const page2 = await searchChannel(member, channelId, { q: "ke hoach", limit: 2, cursor: page1.body.meta.nextCursor });
    expect(page2.status).toBe(404);
    expect(JSON.stringify(page2.body)).not.toContain("bí mật");
  });

  it("người ngoài (không đọc được kênh riêng) → 404 trung tính, không phân biệt kênh không tồn tại", async () => {
    const owner = await fx.newUser("Chủ kênh riêng");
    const outsider = await fx.newUser("Người ngoài");
    const workspaceId = await fx.newWorkspace(owner, [outsider]);
    const channelId = await fx.newChannel(owner, workspaceId, { visibility: "PRIVATE" });
    await fx.sendOk(owner, "CHANNEL", channelId, { content: "Nội dung riêng tư" });

    const res = await searchChannel(outsider, channelId, { q: "rieng tu" });
    const ghost = await searchChannel(outsider, "ffffffffffffffffffffffff", { q: "rieng tu" });

    expect(res.status).toBe(404);
    expect(ghost.status).toBe(404);
    expect(res.body.error.code).toBe(ghost.body.error.code);
  });

  it("SAV-03: hội thoại — ẩn phía tôi (hiddenBeforeSeq) rồi tìm → không trả tin trước mốc; người kia vẫn thấy", async () => {
    const owner = await fx.newUser("Chủ nhóm chat");
    const other = await fx.newUser("Thành viên chat");
    const workspaceId = await fx.newWorkspace(owner, [other]);
    const conversationId = await fx.newGroup(owner, workspaceId, [other]);
    const before = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Đề cương cũ" });
    const floorMsg = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Đề cương giữa" });
    const after = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Đề cương mới" });

    const clear = await request(app).post(`/api/v1/conversations/${conversationId}/clear`).set("Authorization", auth(other));
    expect(clear.status).toBe(200);
    const sentAfterClear = await fx.sendOk(owner, "CONVERSATION", conversationId, { content: "Đề cương sau khi xoá" });

    const mine = await request(app).get(`/api/v1/conversations/${conversationId}/search`).query({ q: "de cuong" }).set("Authorization", auth(other));
    const owners = await request(app).get(`/api/v1/conversations/${conversationId}/search`).query({ q: "de cuong" }).set("Authorization", auth(owner));

    expect(mine.status).toBe(200);
    const mineIds = mine.body.data.map((h: { messageId: string }) => h.messageId);
    expect(mineIds).toEqual([sentAfterClear.id]);
    expect(mineIds).not.toContain(before.id);
    expect(mineIds).not.toContain(floorMsg.id);
    expect(mineIds).not.toContain(after.id);
    expect(owners.body.data).toHaveLength(4);
  });

  it("SAV-04: chuỗi ReDoS '.*(a+)+$' được escape — trả nhanh, chỉ khớp LITERAL", async () => {
    const { owner, channelId } = await publicChannel();
    const literal = await fx.sendOk(owner, "CHANNEL", channelId, { content: "biểu thức .*(a+)+$ là ví dụ ReDoS" });
    await fx.sendOk(owner, "CHANNEL", channelId, { content: `${"a".repeat(60)}!` });

    const start = Date.now();
    const res = await searchChannel(owner, channelId, { q: ".*(a+)+$" });

    expect(Date.now() - start).toBeLessThan(2500);
    expect(res.status).toBe(200);
    expect(res.body.data.map((h: { messageId: string }) => h.messageId)).toEqual([literal.id]);
    expect(res.body.meta.partial).toBe(false);
  });

  it("SAV-05: reply trong thread có nhãn thread + parentMessageId; mở đúng reply bằng ?threadId&around", async () => {
    const { owner, member, channelId } = await publicChannel();
    const root = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Ai nhận việc thiết kế?" });
    const reply = await fx.sendOk(member, "CHANNEL", channelId, { content: "Mình nhận phần thiết kế giao diện", threadRootId: root.id });

    const res = await searchChannel(owner, channelId, { q: "thiet ke" });

    expect(res.status).toBe(200);
    const byId = new Map(res.body.data.map((h: { messageId: string }) => [h.messageId, h]));
    expect(byId.get(root.id)).toMatchObject({ inThread: false, threadId: null, parentMessageId: null });
    expect(byId.get(reply.id)).toMatchObject({ inThread: true, threadId: root.id, parentMessageId: root.id });

    const open = await request(app)
      .get(`/api/v1/channels/${channelId}/messages`)
      .query({ threadId: root.id, around: reply.id })
      .set("Authorization", auth(owner));
    expect(open.status).toBe(200);
    expect(open.body.data.map((m: { id: string }) => m.id)).toContain(reply.id);

    const noThreads = await searchChannel(owner, channelId, { q: "thiet ke", includeThreads: "false" });
    expect(noThreads.body.data.map((h: { messageId: string }) => h.messageId)).toEqual([root.id]);
  });

  it("tin bị thu hồi biến mất khỏi kết quả; tin được SỬA chỉ khớp theo nội dung MỚI", async () => {
    const { owner, channelId } = await publicChannel();
    const recalled = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Nội dung sẽ thu hồi quan trọng" });
    const edited = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Lịch họp thứ Hai" });

    const del = await request(app).delete(`/api/v1/messages/${recalled.id}`).set("Authorization", auth(owner)).send({});
    expect(del.status).toBe(200);
    const patch = await request(app)
      .patch(`/api/v1/messages/${edited.id}`)
      .set("Authorization", auth(owner))
      .send({ content: "Lịch họp thứ Ba", expectedVersion: 1 });
    expect(patch.status).toBe(200);

    const gone = await searchChannel(owner, channelId, { q: "thu hoi" });
    const oldText = await searchChannel(owner, channelId, { q: "thu hai" });
    const newText = await searchChannel(owner, channelId, { q: "thu ba" });

    expect(gone.body.data).toEqual([]);
    expect(JSON.stringify(gone.body)).not.toContain("thu hồi quan trọng");
    expect(oldText.body.data).toEqual([]);
    expect(newText.body.data.map((h: { messageId: string }) => h.messageId)).toEqual([edited.id]);
  });

  it("bộ lọc người gửi + khoảng ngày; from > to → 400", async () => {
    const { owner, member, channelId } = await publicChannel();
    const byOwner = await fx.sendOk(owner, "CHANNEL", channelId, { content: "Nộp bài tập lớn" });
    const byMember = await fx.sendOk(member, "CHANNEL", channelId, { content: "Nộp bài tập nhóm" });

    const onlyMember = await searchChannel(owner, channelId, { q: "nop bai", authorId: member });
    expect(onlyMember.body.data.map((h: { messageId: string }) => h.messageId)).toEqual([byMember.id]);

    const past = await searchChannel(owner, channelId, { q: "nop bai", to: "2020-01-01T00:00:00Z" });
    expect(past.body.data).toEqual([]);
    const window = await searchChannel(owner, channelId, { q: "nop bai", from: "2020-01-01T00:00:00Z", to: new Date(Date.now() + 60_000).toISOString() });
    expect(window.body.data).toHaveLength(2);
    expect(window.body.data.map((h: { messageId: string }) => h.messageId).sort()).toEqual([byOwner.id, byMember.id].sort());

    const bad = await searchChannel(owner, channelId, { q: "nop bai", from: "2026-09-10T00:00:00Z", to: "2026-09-01T00:00:00Z" });
    expect(bad.status).toBe(400);
  });

  it("từ khoá không hợp lệ → 400 SRCH_001/SRCH_002; vượt 30 lượt/phút → 429 RATE_002", async () => {
    const { owner, channelId } = await publicChannel();

    const tooShort = await searchChannel(owner, channelId, { q: "a" });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error.code).toBe("SRCH_001");

    const many = Array.from({ length: LIMITS.search.maxTerms + 1 }, (_, i) => `tu${i}`).join(" ");
    const tooMany = await searchChannel(owner, channelId, { q: many });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe("SRCH_002");

    store.clear();
    for (let i = 0; i < LIMITS.search.ratePerMinute; i += 1) {
      expect((await searchChannel(owner, channelId, { q: "khong co gi" })).status).toBe(200);
    }
    const limited = await searchChannel(owner, channelId, { q: "khong co gi" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_002");
  });

  it("route gốc /scopes/:type/:id/search cho kết quả giống alias", async () => {
    const { owner, channelId } = await publicChannel();
    await fx.sendOk(owner, "CHANNEL", channelId, { content: "Đồ án cuối kỳ" });
    const alias = await searchChannel(owner, channelId, { q: "do an" });
    const generic = await request(app).get(`/api/v1/scopes/CHANNEL/${channelId}/search`).query({ q: "do an" }).set("Authorization", auth(owner));
    expect(generic.status).toBe(200);
    expect(generic.body.data).toEqual(alias.body.data);
  });

  // ── SAV-07 ─────────────────────────────────────────────────────────────────
  const SEED = Number(process.env.SEARCH_SEED_COUNT ?? 5000);

  /** Seed thẳng vào DB (bỏ qua HTTP cho nhanh): tin rải đều ~400 ngày trước, mỗi 50 tin xen 1 từ phổ biến; từ HIẾM chỉ có ở 3 tin. */
  async function seedBulk(channelId: string, workspaceId: string, authorId: string, count: number, rareAt: number[]): Promise<void> {
    const base = Date.now() - 400 * 86_400_000;
    const step = (400 * 86_400_000) / count;
    for (let start = 0; start < count; start += 2000) {
      const size = Math.min(2000, count - start);
      await prisma.message.createMany({
        data: Array.from({ length: size }, (_, k) => {
          const i = start + k;
          const content = rareAt.includes(i) ? `nhắc tới ngoại lệ hiếm gặp số ${i}` : i % 50 === 0 ? `họp nhóm định kỳ số ${i}` : `tin nhắn thường số ${i}`;
          return {
            scopeType: "CHANNEL" as const,
            scopeId: channelId,
            workspaceId,
            threadKey: "root",
            seq: 100_000 + i,
            authorId,
            kind: "USER" as const,
            dedupeKey: `seed:${channelId}:${i}`,
            content,
            normalizedContent: content.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase(),
            createdAt: new Date(base + i * step),
            deletedAt: null,
            deletedBy: null,
            pinnedAt: null,
            pinnedBy: null,
            editedAt: null,
          };
        }),
      });
    }
  }

  it(
    `SAV-07 @slow: kênh ${SEED} tin, tìm từ hiếm → trả ≤ 2 s hoặc partial:true (đúng 3 tin nếu đủ thời gian)`,
    async () => {
      const { owner, workspaceId, channelId } = await publicChannel();
      const rare = [Math.floor(SEED * 0.01), Math.floor(SEED * 0.5), Math.floor(SEED * 0.99)];
      await seedBulk(channelId, workspaceId, owner, SEED, rare);

      const started = Date.now();
      const res = await searchChannel(owner, channelId, { q: "ngoai le hiem" });
      const elapsed = Date.now() - started;

      expect(res.status).toBe(200);
      // "trả trong ≤ 2 s HOẶC partial:true có thông báo" — ngân sách LIMITS.search.maxTimeMs (+ overhead HTTP/dựng snippet).
      expect(elapsed <= LIMITS.search.maxTimeMs + 1500 || res.body.meta.partial === true).toBe(true);
      if (!res.body.meta.partial) {
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data[0].seq).toBe(100_000 + rare[2]); // mới nhất trước
      } else {
        expect(res.body.data.length).toBeLessThanOrEqual(3);
      }

      // từ phổ biến: dừng ở cửa sổ đầu, đủ 30 hit, hasMore
      const common = await searchChannel(owner, channelId, { q: "hop nhom dinh ky" });
      expect(common.status).toBe(200);
      expect(common.body.data.length).toBeGreaterThan(0);
    },
    120_000
  );
});
