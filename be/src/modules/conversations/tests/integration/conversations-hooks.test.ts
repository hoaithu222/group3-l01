/**
 * Integration — `ConversationHooks` (be.md §5.9): CV-16 (`onWorkspaceMemberRemoved`
 * — item 6 báo cáo: phiên điều phối đã nối outbox row
 * `conversations.workspace-member-removed` trong `revokeInTx()` của
 * `modules/members`, SAU KHI phiên thực thi tác vụ p1-05 kết thúc — mirror
 * đúng pattern `channel-membership-revoked.test.ts` của p1-03: đi HTTP thật
 * cho bước "loại khỏi workspace", sau đó gọi TRỰC TIẾP processor đã đăng ký
 * qua `registerJob` bị mock để không cần Redis/BullMQ thật), CV-17
 * (`ensureMeetingConversation`/`syncMeetingAttendees` — p2-04 chưa tồn tại,
 * gọi thẳng hàm qua `getConversationHooks()`).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
  };
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
import type { Job } from "bullmq";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { getConversationHooks, resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../../members/members.routes";
import conversationsRoutes from "../../conversations.routes";
import { registerConversationModule } from "../../index";
// Side-effect: đăng ký processor qua `registerJob` đã bị mock ở trên (capture
// vào mockRegistered) — mirror `channel-membership-revoked.test.ts`.
import "../../jobs/workspace-member-removed.job";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership, cleanupConversationsFixtures } from "./test-utils";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("conversations ConversationHooks — CV-16/17", () => {
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
    mockEnqueue.mockClear();
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

  async function seedWorkspace(ownerId: string, name = "Nhóm hooks"): Promise<string> {
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

  async function createGroup(creatorId: string, workspaceId: string, memberIds: string[], title: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", `Bearer ${tokenFor(creatorId)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title, memberIds });
    expect(res.status).toBe(201);
    createdConversationIds.push(res.body.data.id as string);
    return res.body.data.id as string;
  }

  it(
    "CV-16: U bị loại khỏi workspace lúc là OWNER của 2 nhóm (có/không ADMIN) + ADMIN 1 nhóm + có DM chỉ chung workspace này → xử lý đúng cho từng trường hợp",
    async () => {
      const platformOwner = await seedUser({ name: "Chủ workspace" });
      const u = await seedUser({ name: "U bị loại khỏi workspace" });
      const adminCandidate = await seedUser({ name: "Ứng viên ADMIN" });
      const memberCandidate1 = await seedUser({ name: "Thành viên sớm nhất" });
      const memberCandidate2 = await seedUser({ name: "Thành viên sau" });
      const dmPeer = await seedUser({ name: "Bạn DM chỉ chung workspace này" });
      createdUserIds.push(platformOwner.id, u.id, adminCandidate.id, memberCandidate1.id, memberCandidate2.id, dmPeer.id);
      const workspaceId = await seedWorkspace(platformOwner.id);
      for (const usr of [u, adminCandidate, memberCandidate1, memberCandidate2, dmPeer]) {
        await addMembership(workspaceId, usr.id, "MEMBER");
      }

      // group1 — U OWNER, có 1 ADMIN (adminCandidate) → chuyển chủ cho ADMIN.
      const group1 = await createGroup(u.id, workspaceId, [adminCandidate.id, memberCandidate1.id], "Nhóm 1 — có ADMIN");
      await request(app)
        .patch(`/api/v1/conversations/${group1}/members/${adminCandidate.id}`)
        .set("Authorization", `Bearer ${tokenFor(u.id)}`)
        .send({ role: "ADMIN" });

      // group2 — U OWNER, chỉ MEMBER (không ADMIN) → chuyển chủ cho MEMBER sớm nhất (memberCandidate1 join trước memberCandidate2).
      const group2 = await createGroup(u.id, workspaceId, [memberCandidate1.id], "Nhóm 2 — chỉ MEMBER");
      await request(app)
        .post(`/api/v1/conversations/${group2}/members`)
        .set("Authorization", `Bearer ${tokenFor(u.id)}`)
        .send({ userIds: [memberCandidate2.id] });

      // group3 — U OWNER một mình (temp rời trước) → DISSOLVED.
      const temp = await seedUser({ name: "Temp rời trước CV-16" });
      createdUserIds.push(temp.id);
      await addMembership(workspaceId, temp.id, "MEMBER");
      const group3 = await createGroup(u.id, workspaceId, [temp.id], "Nhóm 3 — sẽ giải tán");
      await request(app).post(`/api/v1/conversations/${group3}/leave`).set("Authorization", `Bearer ${tokenFor(temp.id)}`);

      // group4 — U chỉ ADMIN (platformOwner là OWNER thật) → không chuyển chủ, chỉ mất U.
      const group4 = await createGroup(platformOwner.id, workspaceId, [u.id, memberCandidate2.id], "Nhóm 4 — U chỉ ADMIN");
      await request(app)
        .patch(`/api/v1/conversations/${group4}/members/${u.id}`)
        .set("Authorization", `Bearer ${tokenFor(platformOwner.id)}`)
        .send({ role: "ADMIN" });

      // DM giữa U và dmPeer — CHỈ chung đúng workspace này.
      const dmRes = await request(app).post("/api/v1/conversations/direct").set("Authorization", `Bearer ${tokenFor(u.id)}`).send({ userId: dmPeer.id });
      expect(dmRes.status).toBe(201);
      const dmId = dmRes.body.data.id as string;
      createdConversationIds.push(dmId);

      // Loại U khỏi workspace — kích hoạt `revokeInTx()` (members), ghi outbox
      // `conversations.workspace-member-removed` (item 6 báo cáo).
      const removeRes = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${u.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(platformOwner.id)}`)
        .send({ reason: "Không còn hoạt động (CV-16)" });
      expect(removeRes.status).toBe(200);

      const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
        where: { type: "conversation.workspace-member-removed", aggregateId: `${workspaceId}:${u.id}` },
      });
      expect(outboxRow.payload).toMatchObject({ workspaceId, userId: u.id });

      const processor = getProcessor("notifications", "conversations.workspace-member-removed");
      await processor({ data: { workspaceId, userId: u.id } } as Job);

      // group1 → chủ chuyển cho adminCandidate (ADMIN sớm nhất).
      const conv1 = await prisma.conversation.findUniqueOrThrow({ where: { id: group1 } });
      expect(conv1.status).toBe("ACTIVE");
      expect(conv1.ownerId).toBe(adminCandidate.id);
      const admin1Member = await prisma.conversationMember.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: group1, userId: adminCandidate.id } },
      });
      expect(admin1Member.role).toBe("OWNER");
      const uInGroup1 = await prisma.conversationMember.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: group1, userId: u.id } },
      });
      expect(uInGroup1.status).toBe("REMOVED");

      // group2 → chủ chuyển cho memberCandidate1 (MEMBER sớm nhất, không có ADMIN).
      const conv2 = await prisma.conversation.findUniqueOrThrow({ where: { id: group2 } });
      expect(conv2.status).toBe("ACTIVE");
      expect(conv2.ownerId).toBe(memberCandidate1.id);

      // group3 → DISSOLVED (U là thành viên ACTIVE cuối cùng).
      const conv3 = await prisma.conversation.findUniqueOrThrow({ where: { id: group3 } });
      expect(conv3.status).toBe("DISSOLVED");

      // group4 → U bị REMOVED, KHÔNG đổi ownerId (platformOwner vẫn chủ).
      const conv4 = await prisma.conversation.findUniqueOrThrow({ where: { id: group4 } });
      expect(conv4.ownerId).toBe(platformOwner.id);
      const uInGroup4 = await prisma.conversationMember.findUniqueOrThrow({
        where: { conversationId_userId: { conversationId: group4, userId: u.id } },
      });
      expect(uInGroup4.status).toBe("REMOVED");

      // DM → cả 2 phía đọc được lịch sử nhưng readOnly NO_SHARED_WORKSPACE (hết chung workspace).
      const dmDetailForU = await request(app).get(`/api/v1/conversations/${dmId}`).set("Authorization", `Bearer ${tokenFor(u.id)}`);
      expect(dmDetailForU.status).toBe(200);
      expect(dmDetailForU.body.data.readOnly).toBe(true);
      expect(dmDetailForU.body.data.readOnlyReason).toBe("NO_SHARED_WORKSPACE");
    },
    30_000
  );

  it("CV-17: ensureMeetingConversation idempotent theo meetingKey + syncMeetingAttendees đồng bộ co-host/attendee đúng", async () => {
    const host = await seedUser({ name: "Host cuộc họp" });
    const attendee1 = await seedUser({ name: "Attendee 1" });
    const attendee2 = await seedUser({ name: "Attendee 2" });
    const attendee3 = await seedUser({ name: "Attendee 3 — thêm sau" });
    const notWorkspaceMember = await seedUser({ name: "Không thuộc workspace" });
    createdUserIds.push(host.id, attendee1.id, attendee2.id, attendee3.id, notWorkspaceMember.id);
    const workspaceId = await seedWorkspace(host.id);
    for (const usr of [attendee1, attendee2, attendee3]) await addMembership(workspaceId, usr.id, "MEMBER");

    const hooks = getConversationHooks();
    expect(hooks).not.toBeNull();
    const meetingId = newObjectId();

    const first = await hooks!.ensureMeetingConversation({
      meetingId,
      workspaceId,
      title: "Họp tuần CV-17",
      hostId: host.id,
      attendeeIds: [attendee1.id, attendee2.id, notWorkspaceMember.id],
    });
    createdConversationIds.push(first.conversationId);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conv.meetingId).toBe(meetingId);
    expect(conv.kind).toBe("GROUP");
    expect(conv.settings).toMatchObject({ membersCanAdd: false });
    const members = await prisma.conversationMember.findMany({ where: { conversationId: first.conversationId, status: "ACTIVE" } });
    const memberIds = members.map((m) => m.userId).sort();
    // notWorkspaceMember bị loại (không phải thành viên ACTIVE workspace).
    expect(memberIds).toEqual([attendee1.id, attendee2.id, host.id].sort());
    expect(members.find((m) => m.userId === host.id)?.role).toBe("OWNER");

    // Gọi lại CÙNG meetingId → idempotent, KHÔNG tạo hội thoại thứ 2.
    const second = await hooks!.ensureMeetingConversation({
      meetingId,
      workspaceId,
      title: "Họp tuần CV-17",
      hostId: host.id,
      attendeeIds: [attendee1.id, attendee2.id],
    });
    expect(second.conversationId).toBe(first.conversationId);
    const countConvs = await prisma.conversation.count({ where: { meetingId } });
    expect(countConvs).toBe(1);

    // Đồng bộ: attendee1 → co-host (ADMIN), attendee2 bị gỡ khỏi cuộc họp, attendee3 mới thêm.
    await hooks!.syncMeetingAttendees({
      meetingId,
      hostId: host.id,
      coHostIds: [attendee1.id],
      attendeeIds: [attendee3.id],
    });

    const afterSync = await prisma.conversationMember.findMany({ where: { conversationId: first.conversationId } });
    const byUser = new Map(afterSync.map((m) => [m.userId, m]));
    expect(byUser.get(attendee1.id)?.role).toBe("ADMIN");
    expect(byUser.get(attendee1.id)?.status).toBe("ACTIVE");
    expect(byUser.get(attendee2.id)?.status).toBe("REMOVED");
    expect(byUser.get(attendee3.id)?.status).toBe("ACTIVE");
    expect(byUser.get(attendee3.id)?.role).toBe("MEMBER");
    expect(byUser.get(host.id)?.role).toBe("OWNER");

    const convAfter = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(convAfter.memberCount).toBe(3); // host + attendee1(ADMIN) + attendee3

    const systemTypes = (
      await prisma.message.findMany({ where: { scopeId: first.conversationId, kind: "SYSTEM" }, select: { systemType: true } })
    ).map((m) => m.systemType);
    expect(systemTypes).toEqual(expect.arrayContaining(["CONVERSATION_CREATED", "MEMBER_ADDED", "MEMBER_REMOVED"]));
  }, 20_000);
});
