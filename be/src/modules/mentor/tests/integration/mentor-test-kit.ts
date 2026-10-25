/**
 * Bộ dựng test tích hợp Mentor Connect (Mongo in-memory replset thật, `TEST_DB=memory`): app Express đủ router (workspaces, members,
 * kênh, hội thoại, tin nhắn, kiểm duyệt, mentor), seed người dùng/nhóm/kênh qua HTTP, dọn dữ liệu. `mentor-test-mocks` PHẢI import trước.
 * KHÔNG phải test (không khớp `*.test.ts`).
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
import membersRoutes from "../../../members/members.routes";
import channelsRoutes from "../../../channels/channels.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import reportsRoutes from "../../../moderation/reports.routes";
import adminModerationRoutes from "../../../moderation/admin-moderation.routes";
import mentorRoutes from "../../mentor.routes";
import adminMentorRoutes from "../../mentor.admin.routes";
import { registerMentorModule } from "../..";

export function buildMentorApp() {
  registerChannelModule();
  registerConversationModule();
  registerMentionsModule();
  registerMentorModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", reportsRoutes);
  app.use("/api/v1", adminModerationRoutes);
  app.use("/api/v1", mentorRoutes);
  app.use("/api/v1", adminMentorRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export type App = ReturnType<typeof buildMentorApp>;

export const tokenFor = (userId: string, role = "user"): string =>
  JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });

export function makeKit(app: App) {
  const userIds: string[] = [];
  const workspaceIds: string[] = [];
  const auth = (userId: string, role = "user") => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });
  const call = (method: "get" | "post" | "patch", userId: string, path: string, body?: object, role = "user") => {
    const req = request(app)[method](`/api/v1${path}`).set(auth(userId, role)).set("Idempotency-Key", `idem-${newObjectId()}`);
    return body === undefined ? req : req.send(body);
  };

  async function seedUser(name: string): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: name.toLowerCase(), emailVerified: true } });
    userIds.push(id);
    return id;
  }

  /** OWNER tạo nhóm qua HTTP (kèm kênh mặc định "Chung"). */
  async function createWorkspace(ownerId: string): Promise<{ workspaceId: string; defaultChannelId: string }> {
    const res = await call("post", ownerId, "/workspaces", { name: "Nhóm đồ án" });
    expect(res.status).toBe(201);
    workspaceIds.push(res.body.data.workspace.id);
    return { workspaceId: res.body.data.workspace.id, defaultChannelId: res.body.data.workspace.defaultChannelId };
  }

  async function addMember(workspaceId: string, userId: string, role: "ADMIN" | "MEMBER") {
    await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
  }

  async function createChannel(ownerId: string, workspaceId: string, name: string, visibility: "PUBLIC" | "PRIVATE"): Promise<string> {
    const res = await call("post", ownerId, `/workspaces/${workspaceId}/channels`, { name, visibility });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  const POST_BODY = {
    title: "Cần cố vấn kiến trúc backend",
    description: "Nhóm đang làm đồ án quản lý kho và cần người review thiết kế cơ sở dữ liệu.",
    skills: ["Node.js", "MongoDB"],
    commitmentHoursPerWeek: 3,
    mentorsNeeded: 1,
    expiresInDays: 14,
  };

  async function createPost(ownerId: string, workspaceId: string, over: object = {}) {
    const res = await call("post", ownerId, `/workspaces/${workspaceId}/mentor/posts`, { ...POST_BODY, ...over });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; version: number };
  }

  const apply = (userId: string, postId: string) =>
    call("post", userId, `/mentor/posts/${postId}/applications`, { message: "Tôi có 5 năm kinh nghiệm backend, sẵn sàng review hàng tuần." });

  async function cleanup(): Promise<void> {
    const wsIds = workspaceIds.splice(0);
    const uIds = userIds.splice(0);
    if (wsIds.length === 0 && uIds.length === 0) return;
    const posts = (await prisma.mentorPost.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((p) => p.id);
    const engagements = (await prisma.mentorEngagement.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((e) => e.id);
    const reports = (await prisma.report.findMany({ where: { targetId: { in: posts } }, select: { id: true } })).map((r) => r.id);
    const channels = (await prisma.channel.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((c) => c.id);
    const convs = (await prisma.conversation.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((c) => c.id);
    const notifs = (await prisma.notification.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((n) => n.id);
    const messages = (await prisma.message.findMany({ where: { scopeId: { in: [...channels, ...convs] } }, select: { id: true } })).map((m) => m.id);
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { aggregateId: { in: [...posts, ...engagements, ...reports, ...channels, ...convs, ...messages, ...wsIds] } },
          ...wsIds.map((id) => ({ aggregateId: { startsWith: id } })),
          ...notifs.map((id) => ({ aggregateId: { startsWith: id } })),
        ],
      },
    });
    await prisma.report.deleteMany({ where: { id: { in: reports } } });
    await prisma.mentorEngagement.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.mentorApplication.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.mentorPost.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notificationRecipient.deleteMany({ where: { notificationId: { in: notifs } } });
    await prisma.notification.deleteMany({ where: { id: { in: notifs } } });
    await prisma.message.deleteMany({ where: { id: { in: messages } } });
    await prisma.counter.deleteMany({ where: { key: { in: channels.map((id) => `ch:${id}`) } } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: convs } } });
    await prisma.conversation.deleteMany({ where: { id: { in: convs } } });
    await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.channel.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
    await prisma.user.deleteMany({ where: { id: { in: uIds } } });
  }

  return { auth, call, seedUser, createWorkspace, addMember, createChannel, createPost, apply, cleanup };
}
