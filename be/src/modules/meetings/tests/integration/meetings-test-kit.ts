/**
 * Bộ dựng dùng chung cho test tích hợp `meetings` (Mongo in-memory replset thật): seed workspace/người dùng, dựng app Express, gắn
 * container (socket/push/job ghi lại) và "relay" outbox thủ công (không chạy BullMQ thật). KHÔNG phải test (không khớp `*.test.ts`).
 */
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { registerConversationModule } from "../../../conversations";
import "../../../conversations/conversations.routes"; // side-effect: đăng ký resolver CONVERSATION
import { registerWorkspacePermissionResolver } from "../../../workspaces/services/workspace-permission.resolver";
import { PrismaWorkspaceRepository } from "../../../workspaces/repositories";
import type { NotifyInput } from "../../../notifications/public";
import meetingsRoutes from "../../meetings.routes";
import { createMeetingsContainer, registerMeetingsModule, setMeetingsContainerForTests, type MeetingsContainer, type MeetingsContainerOverrides } from "../../index";
import type { MeetingEventPayload } from "../../services/meeting-events";
import type { IcsSendJob } from "../../services/meeting-jobs.port";
import type { MailPort } from "../../services/meeting-ics.service";

export interface MeetingsHarness {
  container: MeetingsContainer;
  emitted: Array<{ target: "users" | "room" | "leave"; to: string[] | string; event: string; payload: Record<string, unknown> }>;
  notified: NotifyInput[];
  reminders: { scheduled: Array<{ meetingId: string; minutes: number; startAt: Date }>; cancelled: Array<{ meetingId: string; minutes: number; startAt: Date }> };
  icsJobs: IcsSendJob[];
  syncJobs: Array<{ meetingId: string; version: number; archive?: boolean }>;
  mails: Array<Parameters<MailPort["sendRaw"]>[0]>;
  eventsTo(userId: string, event: string): MeetingsHarness["emitted"];
}

let appInstance: express.Express | null = null;

export function buildMeetingsApp(): express.Express {
  if (appInstance) return appInstance;
  registerWorkspacePermissionResolver(new PrismaWorkspaceRepository());
  registerConversationModule();
  registerMeetingsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", meetingsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  appInstance = app;
  return app;
}

export function installHarness(over: MeetingsContainerOverrides & { realNotify?: boolean } = {}): MeetingsHarness {
  const emitted: MeetingsHarness["emitted"] = [];
  const notified: NotifyInput[] = [];
  const reminders: MeetingsHarness["reminders"] = { scheduled: [], cancelled: [] };
  const icsJobs: IcsSendJob[] = [];
  const syncJobs: MeetingsHarness["syncJobs"] = [];
  const mails: MeetingsHarness["mails"] = [];
  const { realNotify, ...overrides } = over;
  const container = createMeetingsContainer({
    emitter: {
      toUsers: (to, event, payload) => emitted.push({ target: "users", to, event, payload: payload as Record<string, unknown> }),
      toRoom: (to, event, payload) => emitted.push({ target: "room", to, event, payload: payload as Record<string, unknown> }),
      leaveRooms: (to, rooms) => emitted.push({ target: "leave", to, event: "leave", payload: { rooms } }),
    },
    ...(realNotify
      ? {}
      : {
          notify: (input: NotifyInput) => {
            notified.push(input);
            return Promise.resolve();
          },
        }),
    jobs: {
      scheduleReminder: (i) => {
        reminders.scheduled.push(i);
        return Promise.resolve();
      },
      cancelReminder: (i) => {
        reminders.cancelled.push(i);
        return Promise.resolve();
      },
      enqueueIcsSend: (j) => {
        icsJobs.push(j);
        return Promise.resolve();
      },
      enqueueConversationSync: (j) => {
        syncJobs.push(j);
        return Promise.resolve();
      },
    },
    mail: {
      sendRaw: (o) => {
        mails.push(o);
        return Promise.resolve();
      },
    },
    ...overrides,
  });
  setMeetingsContainerForTests(container);
  return {
    container,
    emitted,
    notified,
    reminders,
    icsJobs,
    syncJobs,
    mails,
    eventsTo: (userId, event) => emitted.filter((e) => e.target === "users" && e.event === event && (e.to as string[]).includes(userId)),
  };
}

export const tokenFor = (userId: string): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, userId: string, body?: unknown, headers?: Record<string, string>) => request.Test;

export function makeApi(app: express.Express): Api {
  return (method, path, userId, body, headers) => {
    let req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`);
    for (const [k, v] of Object.entries(headers ?? {})) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  };
}

export interface World {
  workspaceId: string;
  /** A=OWNER, B=ADMIN, C/D/E=MEMBER, G=GUEST, X=không thuộc workspace. */
  u: Record<string, string>;
  conversationIds: string[];
}

export async function seedWorld(status: "ACTIVE" | "ARCHIVED" = "ACTIVE"): Promise<World> {
  const workspaceId = newObjectId();
  const u: Record<string, string> = {};
  const roles: Record<string, "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | null> = { A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", E: "MEMBER", G: "GUEST", X: null };
  for (const [name, role] of Object.entries(roles)) {
    const id = newObjectId();
    u[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    if (role) await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role, status: "ACTIVE" } });
  }
  await prisma.workspace.create({ data: { id: workspaceId, name: `Nhóm ${workspaceId.slice(-6)}`, normalizedName: `nhom ${workspaceId.slice(-6)}`, ownerId: u.A!, status } });
  return { workspaceId, u, conversationIds: [] };
}

/** Giờ bắt đầu tương lai (mặc định +2 giờ) và kết thúc +1 giờ sau đó. */
export function slot(startInMinutes = 120, durationMinutes = 60): { startAt: string; endAt: string } {
  const start = Date.now() + startInMinutes * 60_000;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + durationMinutes * 60_000).toISOString() };
}

export function meetingBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Họp tuần", timezone: "Asia/Ho_Chi_Minh", ...slot(), ...over };
}

export const idemKey = (): Record<string, string> => ({ "Idempotency-Key": randomUUID() });

/** "Relay" outbox thủ công: chạy các dòng `meeting.events` PENDING theo thứ tự tạo. */
export async function drainMeetingOutbox(h: MeetingsHarness): Promise<number> {
  let ran = 0;
  for (let round = 0; round < 5; round += 1) {
    const rows = await prisma.outboxEvent.findMany({ where: { queue: "notifications", jobName: "meeting.events", status: "PENDING" }, orderBy: { createdAt: "asc" } });
    if (rows.length === 0) break;
    for (const row of rows) {
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      await h.container.events.handle(row.payload as unknown as MeetingEventPayload);
      ran += 1;
    }
  }
  return ran;
}

export async function cleanupWorld(worlds: World[]): Promise<void> {
  if (worlds.length === 0) return;
  const workspaceIds = worlds.map((w) => w.workspaceId);
  const userIds = worlds.flatMap((w) => Object.values(w.u));
  const meetings = await prisma.meeting.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  const meetingIds = meetings.map((m) => m.id);
  const conversations = await prisma.conversation.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  const conversationIds = conversations.map((c) => c.id);
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: "Meeting", aggregateId: { in: meetingIds } }, { aggregateType: "Conversation", aggregateId: { in: conversationIds } }] } });
  await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.message.deleteMany({ where: { scopeType: "CONVERSATION", scopeId: { in: conversationIds } } });
  await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.meetingAttendee.deleteMany({ where: { meetingId: { in: meetingIds } } });
  await prisma.meeting.deleteMany({ where: { id: { in: meetingIds } } });
  await prisma.auditLog.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/** Mongo in-memory không chạy `db push` ⇒ không có unique index — tạo tay `Meeting.code` và `(meetingId, userId)`. */
export async function ensureMeetingIndexes(): Promise<void> {
  await prisma.$runCommandRaw({ createIndexes: "Meeting", indexes: [{ key: { code: 1 }, name: "Meeting_code_key", unique: true }] });
  await prisma.$runCommandRaw({ createIndexes: "MeetingAttendee", indexes: [{ key: { meetingId: 1, userId: 1 }, name: "MeetingAttendee_meetingId_userId_key", unique: true }] });
}
