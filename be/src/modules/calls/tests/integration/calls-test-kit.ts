/**
 * Bộ dựng dùng chung cho test tích hợp `calls` (Mongo in-memory replset thật): seed workspace/user/hội thoại, dựng app Express,
 * gắn container với Redis in-memory + bộ ghi socket/push, và "relay" outbox thủ công (không chạy BullMQ thật).
 * KHÔNG phải test (không khớp `*.test.ts`).
 */
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { InMemoryMediaServer, setMediaServerForTests } from "../../../../infrastructure/media";
import "../../../conversations/conversations.routes"; // side-effect: đăng ký resolver scope CONVERSATION
import { registerConversationModule } from "../../../conversations";
import callsRoutes from "../../calls.routes";
import { createCallsContainer, registerCallsModule, setCallsContainerForTests, type CallsContainer } from "../../index";
import { InMemoryCallRedisPort } from "../../services/call-redis.store";
import type { CallSignalPayload } from "../../events/call-outbox.events";
import type { NotifyInput } from "../../../notifications/public";

export interface Emitted {
  target: "users" | "room";
  to: string[] | string;
  event: string;
  payload: Record<string, unknown>;
}

export interface CallsHarness {
  container: CallsContainer;
  media: InMemoryMediaServer;
  redis: InMemoryCallRedisPort;
  emitted: Emitted[];
  notified: NotifyInput[];
  reconcileScheduled: Array<{ callId: string; delayMs: number }>;
  /** (p2-03) Lời gọi xếp job failover chủ phòng — test chạy `container.host.failover(callId)` thủ công thay cho BullMQ. */
  failoverScheduled: Array<{ callId: string; version: number; delayMs: number }>;
  /** Số sự kiện `event` đã phát tới `userId` (qua `user:{id}`). */
  eventsTo(userId: string, event: string): Emitted[];
}

let appInstance: express.Express | null = null;

export function buildCallsApp(): express.Express {
  if (appInstance) return appInstance;
  registerConversationModule();
  registerCallsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", callsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  appInstance = app;
  return app;
}

/** Gắn container test (Redis in-memory, socket/push/reconcile ghi lại) — gọi trong `beforeEach`. */
export function installHarness(over: { now?: () => Date; channelAudience?: (channelId: string) => Promise<string[]> } = {}): CallsHarness {
  const media = new InMemoryMediaServer();
  setMediaServerForTests(media);
  const port = new InMemoryCallRedisPort();
  const emitted: Emitted[] = [];
  const notified: NotifyInput[] = [];
  const reconcileScheduled: CallsHarness["reconcileScheduled"] = [];
  const failoverScheduled: CallsHarness["failoverScheduled"] = [];
  const container = createCallsContainer({
    redisPort: port,
    now: over.now,
    channelAudience: over.channelAudience,
    emitter: {
      toUsers: (to, event, payload) => emitted.push({ target: "users", to, event, payload: payload as Record<string, unknown> }),
      toRoom: (to, event, payload) => emitted.push({ target: "room", to, event, payload: payload as Record<string, unknown> }),
    },
    notify: (input) => {
      notified.push(input);
      return Promise.resolve();
    },
    jobs: {
      scheduleReconcile: (callId, delayMs) => {
        reconcileScheduled.push({ callId, delayMs });
        return Promise.resolve();
      },
      scheduleHostFailover: (callId, version, delayMs) => {
        failoverScheduled.push({ callId, version, delayMs });
        return Promise.resolve();
      },
    },
  });
  setCallsContainerForTests(container);
  return {
    container,
    media,
    redis: port,
    emitted,
    notified,
    reconcileScheduled,
    failoverScheduled,
    eventsTo: (userId, event) => emitted.filter((e) => e.target === "users" && e.event === event && (e.to as string[]).includes(userId)),
  };
}

export function tokenFor(userId: string): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });
}

export type Api = (method: "get" | "post", path: string, userId: string, body?: unknown) => request.Test;

export function makeApi(app: express.Express): Api {
  return (method, path, userId, body) => {
    const req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${tokenFor(userId)}`);
    return body === undefined ? req : req.send(body as object);
  };
}

export interface World {
  workspaceId: string;
  /** Tên → userId. */
  u: Record<string, string>;
  /** DIRECT giữa `A` và `B`. */
  direct: string;
  /** GROUP có `A` (OWNER), `B` (MEMBER), `C` (MEMBER), `D` (ADMIN). */
  group: string;
  /** Mọi hội thoại đã tạo (để dọn). */
  conversationIds: string[];
  meetingIds: string[];
}

const settings = { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" };

async function createConversation(
  world: Pick<World, "workspaceId" | "conversationIds">,
  kind: "DIRECT" | "GROUP",
  members: Array<{ userId: string; role: "OWNER" | "ADMIN" | "MEMBER" }>,
  extra: { meetingId?: string; title?: string } = {}
): Promise<string> {
  const id = newObjectId();
  const [first, second] = members;
  await prisma.conversation.create({
    data: {
      id,
      kind,
      workspaceId: kind === "GROUP" ? world.workspaceId : null,
      meetingId: extra.meetingId ?? null,
      meetingKey: extra.meetingId ? `m:${extra.meetingId}` : `none:${id}`,
      directKey: kind === "DIRECT" && first && second ? [first.userId, second.userId].sort().join(":") : `g:${id}`,
      title: kind === "GROUP" ? (extra.title ?? "Nhóm học tập") : null,
      normalizedTitle: kind === "GROUP" ? normalizeSearch(extra.title ?? "Nhóm học tập") : null,
      ownerId: kind === "GROUP" ? (members.find((m) => m.role === "OWNER")?.userId ?? null) : null,
      createdBy: first!.userId,
      status: "ACTIVE",
      settings,
      memberCount: members.length,
      archivedAt: null,
      dissolvedAt: null,
      dissolvedBy: null,
      dissolveReason: null,
    },
  });
  for (const m of members) {
    await prisma.conversationMember.create({
      data: {
        conversationId: id,
        userId: m.userId,
        kind,
        workspaceId: kind === "GROUP" ? world.workspaceId : null,
        role: m.role,
        status: "ACTIVE",
        peerUserId: kind === "DIRECT" ? (members.find((o) => o.userId !== m.userId)?.userId ?? null) : null,
        leftAt: null,
        addedBy: null,
        lastReadAt: null,
        notifyMode: "INHERIT",
        mutedUntil: null,
        pinnedAt: null,
        archivedAt: null,
        hiddenBeforeSeq: 0,
        searchText: "",
      },
    });
  }
  world.conversationIds.push(id);
  return id;
}

/** Workspace ACTIVE + 6 người (A..F, đều MEMBER workspace) + DIRECT(A,B) + GROUP(A owner, B, C, D admin). */
export async function seedWorld(): Promise<World> {
  const workspaceId = newObjectId();
  const u: Record<string, string> = {};
  for (const name of ["A", "B", "C", "D", "E", "F"]) {
    const id = newObjectId();
    u[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role: name === "A" ? "OWNER" : "MEMBER", status: "ACTIVE" } });
  }
  await prisma.workspace.create({
    data: { id: workspaceId, name: `Nhóm ${workspaceId.slice(-6)}`, normalizedName: `nhom ${workspaceId.slice(-6)}`, ownerId: u.A!, status: "ACTIVE" },
  });
  const world: World = { workspaceId, u, direct: "", group: "", conversationIds: [], meetingIds: [] };
  world.direct = await createConversation(world, "DIRECT", [
    { userId: u.A!, role: "MEMBER" },
    { userId: u.B!, role: "MEMBER" },
  ]);
  world.group = await createConversation(world, "GROUP", [
    { userId: u.A!, role: "OWNER" },
    { userId: u.B!, role: "MEMBER" },
    { userId: u.C!, role: "MEMBER" },
    { userId: u.D!, role: "ADMIN" },
  ]);
  return world;
}

/** Nhóm chat của 1 cuộc họp đang `status` (CL-13). */
export async function seedMeetingGroup(world: World, status: "LIVE" | "SCHEDULED"): Promise<string> {
  const meetingId = newObjectId();
  const now = new Date();
  await prisma.meeting.create({
    data: {
      id: meetingId,
      workspaceId: world.workspaceId,
      code: `abc-${meetingId.slice(-4).replace(/[0-9]/g, "x")}-hij${meetingId.slice(-2)}`,
      title: "Họp tuần",
      normalizedTitle: "hop tuan",
      startAt: now,
      endAt: new Date(now.getTime() + 3_600_000),
      timezone: "Asia/Ho_Chi_Minh",
      status,
      hostId: world.u.A!,
      reminderMinutes: [],
      createdBy: world.u.A!,
      agenda: null,
      location: null,
      externalUrl: null,
      conversationId: null,
      currentCallId: null,
      lockedAt: null,
      startedAt: null,
      endedAt: null,
      endReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      deletedAt: null,
      deletedBy: null,
      seriesId: null,
      occurrenceIndex: null,
    },
  });
  world.meetingIds.push(meetingId);
  return createConversation(world, "GROUP", [{ userId: world.u.A!, role: "OWNER" }, { userId: world.u.B!, role: "MEMBER" }], { meetingId, title: "Nhóm họp" });
}

/**
 * Mongo in-memory không chạy `prisma db push` nên KHÔNG có unique index — tạo tay đúng index mà schema khai để kiểm
 * đường P2002 (`Call.activeKey`, `livekitRoom`, `(initiatorId, clientCallId)`, `CallParticipant (callId, userId)`).
 */
export async function ensureCallIndexes(): Promise<void> {
  await prisma.$runCommandRaw({
    createIndexes: "Call",
    indexes: [
      { key: { activeKey: 1 }, name: "Call_activeKey_key", unique: true },
      { key: { livekitRoom: 1 }, name: "Call_livekitRoom_key", unique: true },
      { key: { initiatorId: 1, clientCallId: 1 }, name: "Call_initiatorId_clientCallId_key", unique: true },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: "CallParticipant",
    indexes: [{ key: { callId: 1, userId: 1 }, name: "CallParticipant_callId_userId_key", unique: true }],
  });
}

/**
 * "Relay" outbox thủ công: chạy các dòng `calls` PENDING theo thứ tự tạo. `includeFuture` chạy cả dòng hẹn giờ
 * (`availableAt` tương lai, vd `call.ring-timeout`). Trả tên job đã chạy.
 */
export async function drainOutbox(h: CallsHarness, opts: { includeFuture?: boolean } = {}): Promise<string[]> {
  const ran: string[] = [];
  for (let round = 0; round < 5; round += 1) {
    const rows = await prisma.outboxEvent.findMany({ where: { queue: "calls", status: "PENDING" }, orderBy: { createdAt: "asc" } });
    const due = rows.filter((r) => opts.includeFuture || r.availableAt.getTime() <= Date.now());
    if (due.length === 0) break;
    for (const row of due) {
      const payload = row.payload as Record<string, unknown>;
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      ran.push(row.jobName);
      if (row.jobName === "call.signal-dispatch") await h.container.dispatcher.dispatch(payload as unknown as CallSignalPayload);
      else if (row.jobName === "call.ring-timeout") await h.container.recovery.ringTimeout(String(payload.callId));
      else if (row.jobName === "call.summary") await h.container.summary.post(String(payload.callId));
    }
  }
  return ran;
}

/** Xoá mọi dữ liệu do test tạo. */
export async function cleanupWorld(worlds: World[]): Promise<void> {
  if (worlds.length === 0) return;
  const userIds = worlds.flatMap((w) => Object.values(w.u));
  const workspaceIds = worlds.map((w) => w.workspaceId);
  const conversationIds = worlds.flatMap((w) => w.conversationIds);
  const calls = await prisma.call.findMany({ where: { OR: [{ workspaceId: { in: workspaceIds } }, { scopeId: { in: conversationIds } }] }, select: { id: true } });
  const callIds = calls.map((c) => c.id);
  await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Call", aggregateId: { in: callIds } } });
  const messageIds = (await prisma.message.findMany({ where: { scopeType: "CONVERSATION", scopeId: { in: conversationIds } }, select: { id: true } })).map((m) => m.id);
  await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Message", aggregateId: { in: messageIds } } });
  await prisma.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
  await prisma.call.deleteMany({ where: { id: { in: callIds } } });
  await prisma.message.deleteMany({ where: { scopeType: "CONVERSATION", scopeId: { in: conversationIds } } });
  await prisma.conversationMember.deleteMany({ where: { conversationId: { in: conversationIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.meeting.deleteMany({ where: { id: { in: worlds.flatMap((w) => w.meetingIds) } } });
  await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export const clientCallId = (): string => randomUUID();
export const deviceId = (label = "dev"): string => `${label}-${newObjectId().slice(0, 10)}`;
