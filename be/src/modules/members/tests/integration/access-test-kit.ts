/**
 * Bộ dựng dùng chung cho test tích hợp p3-04b (Mongo in-memory replset thật, `TEST_DB=memory`): dựng app Express đủ router
 * (workspaces, members, link mời, lời mời email, khách/duyệt, kênh, tin nhắn, nhắc tên, hội thoại), seed user/workspace/kênh/grant,
 * gọi API, dọn dữ liệu. KHÔNG phải test (không khớp `*.test.ts`). `access-test-mocks` PHẢI được import trước file này.
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { registerMentionsModule } from "../../../mentions";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../members.routes";
import invitesRoutes from "../../invites.routes";
import invitationsRoutes from "../../invitations.routes";
import accessRoutes from "../../access.routes";
import adminMembersRoutes from "../../admin-members.routes";
import channelsRoutes from "../../../channels/channels.routes";
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import mentionsRoutes from "../../../mentions/mentions.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export function buildAccessApp() {
  registerChannelModule();
  registerConversationModule();
  registerMentionsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", invitesRoutes);
  app.use("/api/v1", invitationsRoutes);
  app.use("/api/v1", accessRoutes);
  app.use("/api/v1/admin/workspaces", adminMembersRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", mentionsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export type App = ReturnType<typeof buildAccessApp>;

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

export interface Fixture {
  workspaceIds: string[];
  userIds: string[];
}

export const newFixture = (): Fixture => ({ workspaceIds: [], userIds: [] });

export function makeKit(app: App, fx: Fixture) {
  const auth = (userId: string, role = "user") => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });

  async function seedUser(name = "Người dùng", opts: { email?: string; emailVerified?: boolean } = {}): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({
      data: {
        id,
        email: opts.email ?? `${id}@e.com`,
        name,
        normalizedName: name.toLowerCase(),
        emailVerified: opts.emailVerified ?? true,
      },
    });
    fx.userIds.push(id);
    return id;
  }

  /** OWNER tạo nhóm qua HTTP (tạo cả kênh mặc định "Chung"). */
  async function createWorkspace(ownerId: string, name = "Nhóm thử") {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set(auth(ownerId))
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    fx.workspaceIds.push(workspaceId);
    return { workspaceId, defaultChannelId: res.body.data.workspace.defaultChannelId as string };
  }

  async function addMembership(workspaceId: string, userId: string, role: Role, extra: Record<string, unknown> = {}) {
    return prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE", ...extra } });
  }

  async function createChannel(actorId: string, workspaceId: string, visibility: "PUBLIC" | "PRIVATE", name: string): Promise<string> {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set(auth(actorId))
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name, visibility });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  /** Bật mời khách cho nhóm (mặc định nền tảng TẮT). */
  async function enableGuests(workspaceId: string, extra: Record<string, unknown> = {}) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: false, ...extra } },
    });
  }

  /** Khách + grant DIRECT MEMBER trên các kênh chỉ định (bỏ qua luồng mời — dùng khi test tập trung vào phạm vi khách). */
  async function seedGuest(workspaceId: string, channelIds: string[], opts: { name?: string; expiresAt?: Date } = {}) {
    const guestId = await seedUser(opts.name ?? "Khách");
    const membership = await addMembership(workspaceId, guestId, "GUEST", {
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 10 * 24 * 3600_000),
      expiryVersion: 1,
    });
    for (const channelId of channelIds) {
      await prisma.channelGrant.create({
        data: { channelId, workspaceId, userId: guestId, subjectKey: guestId, level: "MEMBER", source: "DIRECT", grantedBy: guestId },
      });
      await prisma.channelMembership.create({ data: { channelId, workspaceId, userId: guestId } });
      await prisma.channel.update({ where: { id: channelId }, data: { memberCount: { increment: 1 } } });
    }
    return { guestId, membershipId: membership.id };
  }

  async function cleanup(): Promise<void> {
    const wsIds = fx.workspaceIds.splice(0);
    const userIds = fx.userIds.splice(0);
    if (wsIds.length > 0) {
      const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((c) => c.id);
      const conversationIds = (await prisma.conversation.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((c) => c.id);
      // `notify()` ghi outbox `deliver:<notificationId>:<userId>` (aggregateId `<notificationId>:<userId>`) — dọn để KHÔNG rò sang test khác đếm toàn cục.
      const notificationIds = (await prisma.notification.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((n) => n.id);
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
      const messageIds = (await prisma.message.findMany({ where: { scopeId: { in: [...channelIds, ...conversationIds] } }, select: { id: true } })).map((m) => m.id);
      const inviteLinkIds = (await prisma.inviteLink.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((l) => l.id);
      const invitationIds = (await prisma.workspaceInvitation.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((i) => i.id);
      const membershipIds = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((m) => m.id);
      await prisma.outboxEvent.deleteMany({
        where: {
          OR: [
            { aggregateId: { in: [...invitationIds, ...inviteLinkIds, ...membershipIds, ...channelIds, ...conversationIds, ...messageIds, ...wsIds] } },
            ...wsIds.map((id) => ({ aggregateId: { startsWith: id } })),
            ...notificationIds.map((id) => ({ aggregateId: { startsWith: id } })),
          ],
        },
      });
      await prisma.message.deleteMany({ where: { scopeId: { in: [...channelIds, ...conversationIds] } } });
      await prisma.counter.deleteMany({ where: { key: { in: channelIds.map((id) => `ch:${id}`) } } });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.workspaceInvitation.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.inviteLink.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
    }
    if (conversationsCleanupIds.length > 0 || userIds.length > 0) {
      const memberOf = await prisma.conversationMember.findMany({ where: { userId: { in: userIds } }, select: { conversationId: true } });
      const ids = [...new Set([...conversationsCleanupIds.splice(0), ...memberOf.map((m) => m.conversationId)])];
      await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
      await prisma.conversationMember.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.message.deleteMany({ where: { scopeId: { in: ids } } });
      await prisma.conversation.deleteMany({ where: { id: { in: ids } } });
    }
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  const conversationsCleanupIds: string[] = [];

  return { auth, seedUser, createWorkspace, addMembership, createChannel, enableGuests, seedGuest, cleanup, conversationsCleanupIds };
}

export type Kit = ReturnType<typeof makeKit>;

/**
 * Chống RÒ dữ liệu sang test khác trong cùng lượt chạy (memory DB dùng chung): ghi số hàng OutboxEvent/Notification/NotificationRecipient
 * trước suite, rồi khẳng định KHÔNG đổi sau khi dọn — vd `notify-extension` đếm `deliver.recipient` TOÀN CỤC nên hàng thừa làm nó đỏ.
 */
export async function snapshotCounts(): Promise<number[]> {
  return Promise.all([prisma.outboxEvent.count(), prisma.notification.count(), prisma.notificationRecipient.count()]);
}

export async function expectNoLeak(before: number[]): Promise<void> {
  const after = await snapshotCounts();
  if (after.join() !== before.join()) {
    const rows = await prisma.outboxEvent.findMany({ orderBy: { createdAt: "desc" }, take: Math.max(after[0] - before[0], 0), select: { type: true, aggregateType: true, jobName: true } });
    throw new Error(`Suite làm rò dữ liệu (outbox/notification/recipient trước ${before.join("/")} sau ${after.join("/")}): ${JSON.stringify(rows)}`);
  }
}
