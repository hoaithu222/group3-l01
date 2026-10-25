/**
 * Helper DÙNG CHUNG cho các test tích hợp của p5-04 (`workspace-search`, `workspace-templates`, `announcements`) — KHÔNG phải file
 * test. Mỗi file `*.test.ts` vẫn tự `jest.mock(...)` (Jest hoist) rồi dùng lại bộ này, dựng thêm trên fixture của `discovery` (p1-09):
 * tạo workspace/kênh/nhóm chat qua HTTP thật, chèn thẳng tin/cuộc họp/tài liệu bằng Prisma khi cần dữ liệu khó tạo qua API.
 */
import { randomUUID } from "crypto";
import express, { type Express } from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { newObjectId } from "../../../../core/utils/object-id";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { prisma } from "../../../../infrastructure/database";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import channelsRoutes from "../../../channels/channels.routes";
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import conversationsRoutes from "../../../conversations/conversations.routes";
import messagesRoutes, { createScopedMessageRouter } from "../../../messages/messages.routes";
import workspaceSearchRoutes from "../../workspace-search.routes";
import workspaceTemplatesRoutes from "../../../workspace-templates/workspace-templates.routes";
import announcementsRoutes from "../../../announcements/announcements.routes";
import { createDiscoveryIndexes, createFixtures, auth, type Fixtures } from "../../../discovery/tests/integration/discovery-fixtures";
import { addMembership, tokenFor } from "../../../conversations/tests/integration/test-utils";

export { auth, tokenFor, addMembership, createFixtures, type Fixtures };
export { makeRedisStore, wireRedisMocks } from "../../../discovery/tests/integration/discovery-fixtures";

/** Mount đúng như `router.ts` cho các route p5-04 + route nền cần để tạo dữ liệu. */
export function buildP504App(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", conversationsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use("/api/v1/channels", createScopedMessageRouter("CHANNEL"));
  app.use("/api/v1/conversations", createScopedMessageRouter("CONVERSATION"));
  app.use("/api/v1", workspaceSearchRoutes);
  app.use("/api/v1", workspaceTemplatesRoutes);
  app.use("/api/v1", announcementsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** `MongoMemoryReplSet` không áp index từ schema.prisma — tạo các index mà nghiệp vụ p5-04 dựa vào. */
export async function createP504Indexes(): Promise<void> {
  await createDiscoveryIndexes();
  await prisma.$runCommandRaw({
    createIndexes: "WorkspaceTemplate",
    indexes: [{ key: { code: 1 }, name: "WorkspaceTemplate_code_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "WorkspaceTemplateApplication",
    indexes: [{ key: { appliedBy: 1, idempotencyKey: 1 }, name: "WorkspaceTemplateApplication_appliedBy_idempotencyKey_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "AnnouncementRequest",
    indexes: [{ key: { messageId: 1 }, name: "AnnouncementRequest_messageId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "AnnouncementReceipt",
    indexes: [{ key: { requestId: 1, userId: 1 }, name: "AnnouncementReceipt_requestId_userId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "OutboxEvent",
    indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }],
  });
}

let seedSeq = 1_000_000;

export interface SeedMessageInput {
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  workspaceId: string | null;
  authorId: string;
  content: string;
  createdAt?: Date;
  threadId?: string;
  attachments?: { name: string; mime?: string; size?: number; kind?: "IMAGE" | "FILE" }[];
}

/** Chèn thẳng một `Message` (không qua engine) — dùng cho tệp đính kèm, lùi thời gian, dữ liệu lớn. Trả `id`. */
export async function seedMessage(input: SeedMessageInput): Promise<string> {
  seedSeq += 1;
  const message = await prisma.message.create({
    data: {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      threadKey: input.threadId ?? "root",
      seq: seedSeq,
      authorId: input.authorId,
      kind: "USER",
      dedupeKey: `s:seed:${randomUUID()}`,
      content: input.content,
      normalizedContent: normalizeSearch(input.content),
      mentions: [],
      links: [],
      reactionsSummary: [],
      attachments: (input.attachments ?? []).map((a) => ({
        assetId: newObjectId(),
        kind: a.kind ?? "FILE",
        name: a.name,
        mime: a.mime ?? "application/pdf",
        size: a.size ?? 1024,
        waveform: [],
      })),
      deletedAt: null,
      createdAt: input.createdAt ?? new Date(),
    },
  });
  return message.id;
}

/** Đặt `normalizedName` cho user (fixture `seedUser` để rỗng) — tìm người theo tên tài khoản cần trường này. */
export async function normalizeUserName(userId: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { name, normalizedName: normalizeSearch(name) } });
}

export interface SeedMeetingInput {
  workspaceId: string;
  hostId: string;
  title: string;
  visibility: "ATTENDEES" | "WORKSPACE";
  attendeeIds?: string[];
  startAt?: Date;
}

export async function seedMeeting(input: SeedMeetingInput): Promise<string> {
  const startAt = input.startAt ?? new Date(Date.now() + 3600_000);
  const endAt = new Date(startAt.getTime() + 3600_000);
  const meeting = await prisma.meeting.create({
    data: {
      workspaceId: input.workspaceId,
      code: `m-${randomUUID().slice(0, 8)}`,
      title: input.title,
      normalizedTitle: normalizeSearch(input.title),
      startAt,
      endAt,
      timezone: "Asia/Ho_Chi_Minh",
      hostId: input.hostId,
      visibility: input.visibility,
      reminderMinutes: [],
      createdBy: input.hostId,
      deletedAt: null,
    },
  });
  for (const userId of [input.hostId, ...(input.attendeeIds ?? [])]) {
    await prisma.meetingAttendee.create({
      data: {
        meetingId: meeting.id,
        workspaceId: input.workspaceId,
        userId,
        role: userId === input.hostId ? "HOST" : "ATTENDEE",
        meetingStartAt: startAt,
        meetingEndAt: endAt,
        meetingStatus: "SCHEDULED",
        removedAt: null,
      },
    });
  }
  return meeting.id;
}

export async function seedResource(input: { workspaceId: string; uploadedBy: string; name: string }): Promise<string> {
  const resource = await prisma.resource.create({
    data: {
      workspaceId: input.workspaceId,
      folderKey: "root",
      assetId: newObjectId(),
      name: input.name,
      normalizedName: normalizeSearch(input.name),
      type: "PDF",
      mime: "application/pdf",
      size: 2048,
      tags: [],
      uploadedBy: input.uploadedBy,
      deletedAt: null,
    },
  });
  return resource.id;
}

/** Dọn dữ liệu p5-04 theo workspace — gọi TRƯỚC `fx.cleanup()` (cần workspaceIds còn nguyên). */
export async function cleanupP504(workspaceIds: string[], userIds: string[]): Promise<void> {
  if (workspaceIds.length > 0) {
    const requests = await prisma.announcementRequest.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
    await prisma.announcementReceipt.deleteMany({ where: { requestId: { in: requests.map((r) => r.id) } } });
    await prisma.announcementRequest.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Announcement" } });
    await prisma.meetingAttendee.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.meeting.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.resource.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceTemplateApplication.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  }
  if (userIds.length > 0) await prisma.workspaceTemplateApplication.deleteMany({ where: { appliedBy: { in: userIds } } });
}

/** Tạo nhanh: chủ nhóm + nhóm; thêm thành viên/khách bằng `addMembership`. */
export async function newWorkspaceWithOwner(fx: Fixtures, ownerName = "Chủ nhóm"): Promise<{ owner: string; workspaceId: string }> {
  const owner = await fx.newUser(ownerName);
  const workspaceId = await fx.newWorkspace(owner);
  return { owner, workspaceId };
}

export function searchWorkspace(app: Express, userId: string, workspaceId: string, params: Record<string, string | number | boolean>) {
  return request(app).get(`/api/v1/workspaces/${workspaceId}/search`).query(params).set("Authorization", auth(userId));
}
