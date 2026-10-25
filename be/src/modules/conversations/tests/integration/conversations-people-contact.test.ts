/**
 * Integration — `GET /conversations/people` tìm theo email/SĐT ĐẦY ĐỦ (Mongo memory replset, `TEST_DB=memory`):
 *   - email / SĐT (mọi kiểu gõ → E.164) khớp CHÍNH XÁC người CHUNG NHÓM → `matchedBy` + `contactHint` che, không lộ liên hệ đầy đủ;
 *   - người KHÔNG chung nhóm không bao giờ lọt ra dù khớp đúng email/SĐT (không thành công cụ dò danh bạ);
 *   - chuỗi dở dang (`0912`, `lan@`) KHÔNG khớp tiền tố; tìm theo tên và q rỗng giữ nguyên hành vi cũ;
 *   - `findableByEmail/Phone=false` → như không tồn tại; khách (GUEST) không bao giờ là ứng viên.
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

jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: jest.fn().mockResolvedValue(undefined) })),
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
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import conversationsRoutes from "../../conversations.routes";
import { registerConversationModule } from "../../index";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1", conversationsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
const store = makeRedisStore();

interface PersonRow {
  userId: string;
  name: string;
  matchedBy?: "EMAIL" | "PHONE";
  contactHint?: string | null;
}

describe("GET /conversations/people — email/SĐT đầy đủ", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(() => {
    bindPermissionPorts();
    registerConversationModule();
  });
  afterAll(() => resetPermissionPorts());
  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });
  afterEach(async () => {
    await cleanupConversationsFixtures({ workspaceIds: workspaceIds.splice(0), userIds: userIds.splice(0) });
    store.clear();
  });

  /** `me` tạo nhóm; `friend` (có email `<id>@e.com` + SĐT) là thành viên; `stranger` KHÔNG chung nhóm nhưng cũng có SĐT. */
  async function scenario(opts: { friendPhone?: string; friendName?: string } = {}) {
    const me = await seedUser({ name: "Tôi" });
    const friend = await seedUser({ name: opts.friendName ?? "Lan Nguyễn" });
    const stranger = await seedUser({ name: "Người lạ" });
    userIds.push(me.id, friend.id, stranger.id);
    await prisma.user.update({ where: { id: friend.id }, data: { phone: opts.friendPhone ?? "+84912345678", normalizedName: "lan nguyen" } });
    await prisma.user.update({ where: { id: stranger.id }, data: { phone: "+84987654321", normalizedName: "nguoi la" } });

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(me.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm people" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, friend.id, "MEMBER");
    return { me, friend, stranger, workspaceId };
  }

  const people = async (actor: string, q: string, workspaceId?: string): Promise<PersonRow[]> => {
    const res = await request(app)
      .get("/api/v1/conversations/people")
      .query({ q, ...(workspaceId && { workspaceId }) })
      .set("Authorization", `Bearer ${tokenFor(actor)}`);
    expect(res.status).toBe(200);
    return res.body.data as PersonRow[];
  };

  it("email đầy đủ của người chung nhóm → đúng người đó, matchedBy EMAIL + gợi ý SĐT che", async () => {
    const { me, friend } = await scenario();
    const rows = await people(me.id, `${friend.id}@e.com`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: friend.id, name: "Lan Nguyễn", matchedBy: "EMAIL", contactHint: "+84 ****** 678" });
  });

  it.each(["0912345678", "0912 345 678", "+84 912 345 678", "84912345678"])(
    "SĐT %s của người chung nhóm → matchedBy PHONE + gợi ý email che, không lộ email/SĐT đầy đủ",
    async (q) => {
      const { me, friend } = await scenario();
      const res = await request(app).get("/api/v1/conversations/people").query({ q }).set("Authorization", `Bearer ${tokenFor(me.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ userId: friend.id, matchedBy: "PHONE" });
      expect(res.body.data[0].contactHint).toMatch(/^.\*\*\*@e\.com$/);
      expect(JSON.stringify(res.body)).not.toContain(`${friend.id}@e.com`);
      expect(JSON.stringify(res.body)).not.toContain("912345678");
    }
  );

  it("người KHÔNG chung nhóm không lọt ra dù khớp đúng email/SĐT", async () => {
    const { me, stranger } = await scenario();
    expect(await people(me.id, "0987654321")).toEqual([]);
    expect(await people(me.id, `${stranger.id}@e.com`)).toEqual([]);
  });

  it("chuỗi dở dang không khớp tiền tố: '0912', '09123456', 'lan@' → không ra ai", async () => {
    const { me } = await scenario();
    for (const q of ["0912", "09123456", "lan@"]) expect(await people(me.id, q)).toEqual([]);
  });

  it("tìm theo tên và q rỗng giữ nguyên hành vi cũ (không có matchedBy)", async () => {
    const { me, friend } = await scenario();
    const byName = await people(me.id, "lan");
    expect(byName.map((p) => p.userId)).toEqual([friend.id]);
    expect(byName[0].matchedBy).toBeUndefined();
    expect((await people(me.id, "")).map((p) => p.userId)).toEqual([friend.id]);
  });

  it("riêng tư: tắt findableByPhone → không tìm được bằng SĐT (vẫn tìm bằng email); tắt findableByEmail ngược lại", async () => {
    const { me, friend } = await scenario();
    await prisma.user.update({ where: { id: friend.id }, data: { privacy: { readReceipts: true, showPresence: true, findableByPhone: false } } });
    expect(await people(me.id, "0912345678")).toEqual([]);
    expect(await people(me.id, `${friend.id}@e.com`)).toHaveLength(1);

    await prisma.user.update({
      where: { id: friend.id },
      data: { privacy: { readReceipts: true, showPresence: true, findableByPhone: true, findableByEmail: false } },
    });
    expect(await people(me.id, `${friend.id}@e.com`)).toEqual([]);
    expect(await people(me.id, "0912345678")).toHaveLength(1);
  });

  it("khách (GUEST) và tài khoản không ACTIVE không bao giờ là ứng viên", async () => {
    const { me, friend, workspaceId } = await scenario();
    const guest = await seedUser({ name: "Khách" });
    userIds.push(guest.id);
    await prisma.user.update({ where: { id: guest.id }, data: { phone: "+84933333333" } });
    await addMembership(workspaceId, guest.id, "GUEST");
    expect(await people(me.id, "0933333333")).toEqual([]);

    await prisma.user.update({ where: { id: friend.id }, data: { status: "LOCKED" } });
    expect(await people(me.id, "0912345678")).toEqual([]);
  });

  it("lọc theo workspaceId: chỉ trong nhóm được chọn", async () => {
    const { me, friend, workspaceId } = await scenario();
    expect((await people(me.id, "0912345678", workspaceId)).map((p) => p.userId)).toEqual([friend.id]);
    expect(await people(me.id, "0912345678", "ff".repeat(12))).toEqual([]);
  });
});
