/**
 * Helper DÙNG CHUNG cho các test tích hợp của `discovery` (p1-09) — KHÔNG phải file test
 * (không khớp `testMatch` `*.test.ts`). Mỗi file test vẫn tự `jest.mock(...)` (Jest hoist
 * `jest.mock`) rồi gọi `buildDiscoveryApp()`/`createFixtures(app)` ở đây — cùng cách
 * `conversations/tests/integration/test-utils.ts`.
 */
import { randomUUID } from "crypto";
import express, { type Express } from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import savedRoutes from "../../saved.routes";
import scopeSearchRoutes, { createScopedSearchRouter } from "../../scope-search.routes";
import { tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";

export { tokenFor, makeRedisStore, wireRedisMocks } from "../../../conversations/tests/integration/test-utils";

/** Mount đúng như `router.ts`: route gốc + alias `/channels|/conversations/:id/{messages,pins,search}`. */
export function buildDiscoveryApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", savedRoutes);
  app.use("/api/v1", scopeSearchRoutes);
  app.use("/api/v1/channels", createScopedSearchRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedSearchRouter("CONVERSATION"));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** `MongoMemoryReplSet` KHÔNG tự áp index từ schema.prisma — tạo các index mà nghiệp vụ dựa vào. */
export async function createDiscoveryIndexes(): Promise<void> {
  await prisma.$runCommandRaw({
    createIndexes: "Message",
    indexes: [
      { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
      { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      { key: { scopeType: 1, scopeId: 1, createdAt: 1 }, name: "Message_scopeType_scopeId_createdAt_idx" },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: "MessageHide",
    indexes: [{ key: { userId: 1, messageId: 1 }, name: "MessageHide_userId_messageId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "SavedMessage",
    indexes: [{ key: { userId: 1, messageId: 1 }, name: "SavedMessage_userId_messageId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "Channel",
    indexes: [{ key: { workspaceId: 1, normalizedName: 1 }, name: "Channel_workspaceId_normalizedName_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "Conversation",
    indexes: [
      { key: { directKey: 1 }, name: "Conversation_directKey_key", unique: true },
      { key: { meetingKey: 1 }, name: "Conversation_meetingKey_key", unique: true },
    ],
  });
}

export const auth = (userId: string): string => `Bearer ${tokenFor(userId)}`;

export function createFixtures(app: Express) {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  async function newUser(name: string): Promise<string> {
    const u = await seedUser({ name });
    userIds.push(u.id);
    return u.id;
  }

  async function newWorkspace(ownerId: string, memberIds: string[] = []): Promise<string> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(ownerId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm discovery" });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    for (const id of memberIds) await addMembership(workspaceId, id, "MEMBER");
    return workspaceId;
  }

  async function newChannel(
    ownerId: string,
    workspaceId: string,
    body: { visibility?: "PUBLIC" | "PRIVATE"; initialMemberIds?: string[] } = {}
  ): Promise<string> {
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(ownerId))
      .send({ name: `Kênh ${randomUUID().slice(0, 8)}`, visibility: "PUBLIC", ...body });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function newGroup(ownerId: string, workspaceId: string, memberIds: string[]): Promise<string> {
    const res = await request(app)
      .post("/api/v1/conversations")
      .set("Authorization", auth(ownerId))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ workspaceId, title: "Nhóm chat discovery", memberIds });
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    conversationIds.push(id);
    return id;
  }

  function send(
    userId: string,
    scopeType: "CHANNEL" | "CONVERSATION",
    scopeId: string,
    body: { content?: string; threadRootId?: string } = {}
  ) {
    return request(app)
      .post(`/api/v1/scopes/${scopeType}/${scopeId}/messages`)
      .set("Authorization", auth(userId))
      .send({ clientMessageId: randomUUID(), content: "Nội dung thử", ...body });
  }

  async function sendOk(...args: Parameters<typeof send>): Promise<{ id: string; seq: number }> {
    const res = await send(...args);
    expect(res.status).toBe(201);
    return res.body.data as { id: string; seq: number };
  }

  async function cleanup(): Promise<void> {
    const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
    const scopeIds = [...channelIds, ...conversationIds];
    if (scopeIds.length > 0) {
      await prisma.message.deleteMany({ where: { scopeId: { in: scopeIds } } });
      await prisma.messageHide.deleteMany({ where: { scopeId: { in: scopeIds } } });
      await prisma.savedMessage.deleteMany({ where: { scopeId: { in: scopeIds } } });
    }
    await prisma.savedMessage.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Message", "Channel", "Conversation"] } } });
    await prisma.outboxEvent.deleteMany({ where: { OR: workspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) } });
    await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    workspaceIds.length = 0;
    userIds.length = 0;
    conversationIds.length = 0;
  }

  return { newUser, newWorkspace, newChannel, newGroup, send, sendOk, cleanup, workspaceIds, userIds, conversationIds };
}

export type Fixtures = ReturnType<typeof createFixtures>;
