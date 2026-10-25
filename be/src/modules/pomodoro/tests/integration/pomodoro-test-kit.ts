/**
 * Bộ dựng dùng chung cho test tích hợp PHÒNG POMODORO (Mongo in-memory replset thật): seed nhóm/người dùng/kênh, dựng app Express (routes Pomodoro + calls để thử
 * `POST /calls/:id/leave|token`), container `calls` THẬT với Redis in-memory + LiveKit giả (`InMemoryMediaServer`), container `pomodoro` dùng repo Prisma thật, đồng hồ
 * tua được, "relay" outbox thủ công (không chạy BullMQ thật). KHÔNG phải test. ⚠ Phải import SAU `pomodoro-test-mocks`.
 */
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { clearRevokeListeners, resetPermissionPorts, setPermissionPorts } from "../../../../core/permission";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { InMemoryMediaServer, dispatchLiveKitEvent, setMediaServerForTests, type NormalizedLiveKitEvent } from "../../../../infrastructure/media";
import "../../../workspaces/workspaces.routes"; // side-effect: đăng ký resolver scope WORKSPACE
import "../../../channels/channels.routes"; // side-effect: đăng ký resolver scope CHANNEL
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import callsRoutes from "../../../calls/calls.routes";
import { createCallsContainer, registerCallsModule, setCallsContainerForTests, type CallsContainer } from "../../../calls";
import { InMemoryCallRedisPort } from "../../../calls/services/call-redis.store";
import "../../../calls/jobs/call.jobs"; // side-effect: handler webhook LiveKit tiền tố `call_` (chạy TRƯỚC handler Pomodoro như ở worker)
import "../../jobs/pomodoro.jobs"; // side-effect: handler webhook LiveKit của Pomodoro
import { createPomodoroContainer, setPomodoroContainerForTests, type PomodoroContainer } from "../../pomodoro.container";
import pomodoroRoutes from "../../pomodoro.routes";
import { InMemoryPomodoroRedisPort } from "../../services/pomodoro-command.store";
import { installMocks } from "./pomodoro-test-mocks";

export interface Clock {
  offsetMs: number;
  now(): Date;
  advanceMs(ms: number): void;
  advanceMinutes(minutes: number): void;
}

export function makeClock(): Clock {
  const clock: Clock = {
    offsetMs: 0,
    now: () => new Date(Date.now() + clock.offsetMs),
    advanceMs: (ms) => {
      clock.offsetMs += ms;
    },
    advanceMinutes: (m) => {
      clock.offsetMs += m * 60_000;
    },
  };
  return clock;
}

let appInstance: express.Express | null = null;

export function buildApp(): express.Express {
  if (appInstance) return appInstance;
  registerConversationModule();
  registerChannelModule(); // sau khi `workspaces.routes` đã đăng ký resolver WORKSPACE; đăng ký luôn MessageScope CHANNEL (tin tóm tắt)
  registerCallsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", pomodoroRoutes);
  app.use("/api/v1", callsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  appInstance = app;
  return app;
}

export interface Emitted {
  room: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface RoomHarness {
  media: InMemoryMediaServer;
  callRedis: InMemoryCallRedisPort;
  pomoRedis: InMemoryPomodoroRedisPort;
  calls: CallsContainer;
  pomo: PomodoroContainer;
  clock: Clock;
  emitted: Emitted[];
  hostSyncs: Array<{ sessionId: string; delayMs: number }>;
  failovers: Array<{ callId: string; version: number; delayMs: number }>;
}

/** Gắn container test — gọi trong `beforeEach` (sau `installMocks()`). */
export function installHarness(): RoomHarness {
  installMocks();
  const clock = makeClock();
  const media = new InMemoryMediaServer();
  setMediaServerForTests(media);
  const callRedis = new InMemoryCallRedisPort(() => clock.now().getTime());
  const pomoRedis = new InMemoryPomodoroRedisPort(() => clock.now().getTime());
  const failovers: RoomHarness["failovers"] = [];
  const hostSyncs: RoomHarness["hostSyncs"] = [];
  const emitted: Emitted[] = [];

  const calls = createCallsContainer({
    redisPort: callRedis,
    now: () => clock.now(),
    emitter: { toUsers: () => undefined, toRoom: () => undefined },
    notify: () => Promise.resolve(),
    jobs: {
      scheduleReconcile: () => Promise.resolve(),
      scheduleHostFailover: (callId, version, delayMs) => {
        failovers.push({ callId, version, delayMs });
        return Promise.resolve();
      },
    },
  });
  setCallsContainerForTests(calls);

  const pomo = createPomodoroContainer({
    redisPort: pomoRedis,
    now: () => clock.now(),
    jobs: {
      scheduleHostSync: (sessionId, delayMs) => {
        hostSyncs.push({ sessionId, delayMs });
        return Promise.resolve();
      },
    },
    socket: { emit: (room, event, payload) => emitted.push({ room, event, payload: payload as Record<string, unknown> }) },
  });
  setPomodoroContainerForTests(pomo);
  return { media, callRedis, pomoRedis, calls, pomo, clock, emitted, hostSyncs, failovers };
}

export function tokenFor(userId: string): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });
}

export type Method = "get" | "post" | "patch" | "put";
export type Api = (method: Method, path: string, userId: string, body?: unknown) => request.Test;

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
  channelIds: string[];
}

/** Workspace ACTIVE + người dùng đặt tên (đều MEMBER ACTIVE; `A` là OWNER). */
export async function seedWorld(names: string[] = ["A", "B", "C", "D", "E", "F"]): Promise<World> {
  const workspaceId = newObjectId();
  const u: Record<string, string> = {};
  for (const name of names) {
    const id = newObjectId();
    u[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role: name === "A" ? "OWNER" : "MEMBER", status: "ACTIVE" } });
  }
  await prisma.workspace.create({ data: { id: workspaceId, name: `Nhóm ${workspaceId.slice(-6)}`, normalizedName: `nhom ${workspaceId.slice(-6)}`, ownerId: u.A, status: "ACTIVE" } });
  return { workspaceId, u, channelIds: [] };
}

export interface SeedChannelOptions {
  name?: string;
  type?: "TEXT" | "VOICE" | "POMODORO";
  visibility?: "PUBLIC" | "PRIVATE";
  status?: "ACTIVE" | "ARCHIVED";
  /** Kênh riêng tư: những người có grant DIRECT (MEMBER). */
  grantTo?: string[];
  settings?: Record<string, unknown>;
}

export async function seedChannel(w: World, opts: SeedChannelOptions = {}): Promise<string> {
  const id = newObjectId();
  const name = opts.name ?? `hoc-${id.slice(-5)}`;
  await prisma.channel.create({
    data: {
      id,
      workspaceId: w.workspaceId,
      name,
      normalizedName: normalizeSearch(name),
      type: opts.type ?? "POMODORO",
      visibility: opts.visibility ?? "PUBLIC",
      postingPolicy: "MEMBERS",
      status: opts.status ?? "ACTIVE",
      isDefault: false,
      position: 0,
      lastSeq: 0,
      memberCount: opts.grantTo?.length ?? 0,
      createdBy: w.u.A,
      version: 1,
      ...(opts.settings ? { settings: opts.settings as never } : {}),
    },
  });
  for (const userId of opts.grantTo ?? []) {
    await prisma.channelGrant.create({ data: { channelId: id, workspaceId: w.workspaceId, userId, level: "MEMBER", source: "DIRECT", roleRef: null, subjectKey: userId, grantedBy: w.u.A } });
  }
  w.channelIds.push(id);
  return id;
}

/** Mongo in-memory không chạy `db push` ⇒ không có unique index — tạo tay đúng index mà schema khai để kiểm đường P2002 (nhánh thua cuộc của hai người vào cùng lúc). */
export async function ensureIndexes(): Promise<void> {
  await prisma.$runCommandRaw({ createIndexes: "PomodoroSession", indexes: [{ key: { activeKey: 1 }, name: "PomodoroSession_activeKey_key", unique: true }] });
  await prisma.$runCommandRaw({ createIndexes: "PomodoroPresence", indexes: [{ key: { sessionId: 1, userId: 1 }, name: "PomodoroPresence_sessionId_userId_key", unique: true }] });
  await prisma.$runCommandRaw({
    createIndexes: "Call",
    indexes: [
      { key: { activeKey: 1 }, name: "Call_activeKey_key", unique: true },
      { key: { livekitRoom: 1 }, name: "Call_livekitRoom_key", unique: true },
      { key: { initiatorId: 1, clientCallId: 1 }, name: "Call_initiatorId_clientCallId_key", unique: true },
    ],
  });
  await prisma.$runCommandRaw({ createIndexes: "CallParticipant", indexes: [{ key: { callId: 1, userId: 1 }, name: "CallParticipant_callId_userId_key", unique: true }] });
}

/** Xoá mọi dữ liệu do test tạo (phiên, hiện diện, phòng, tin tóm tắt, kênh, nhóm, người dùng). */
export async function cleanupWorlds(worlds: World[]): Promise<void> {
  if (worlds.length === 0) return;
  const userIds = worlds.flatMap((w) => Object.values(w.u));
  const workspaceIds = worlds.map((w) => w.workspaceId);
  const channelIds = worlds.flatMap((w) => w.channelIds);
  const sessions = await prisma.pomodoroSession.findMany({ where: { channelId: { in: channelIds } }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  const calls = await prisma.call.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  const callIds = calls.map((c) => c.id);
  const messageIds = (await prisma.message.findMany({ where: { scopeType: "CHANNEL", scopeId: { in: channelIds } }, select: { id: true } })).map((m) => m.id);
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: "PomodoroSession", aggregateId: { in: sessionIds } }, { aggregateType: "Call", aggregateId: { in: callIds } }, { aggregateType: "Message", aggregateId: { in: messageIds } }] } });
  await prisma.pomodoroPresence.deleteMany({ where: { sessionId: { in: sessionIds } } });
  await prisma.pomodoroSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
  await prisma.call.deleteMany({ where: { id: { in: callIds } } });
  await prisma.message.deleteMany({ where: { scopeType: "CHANNEL", scopeId: { in: channelIds } } });
  await prisma.channelGrant.deleteMany({ where: { channelId: { in: channelIds } } });
  await prisma.channelMembership.deleteMany({ where: { channelId: { in: channelIds } } });
  await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

// ── mô phỏng LiveKit ───────────────────────────────────────────────────────────

export const roomOf = (callId: string): string => `call_${callId}`;

export function lkEvent(type: string, room: string, identity?: string): NormalizedLiveKitEvent {
  return {
    id: `evt-${randomUUID()}`,
    type: type,
    roomName: room,
    createdAt: new Date().toISOString(),
    room: null,
    participant: identity ? { identity, sid: `PA_${identity.slice(-4)}`, state: "ACTIVE", joinedAt: null } : null,
    track: null,
    egress: null,
  };
}

/** Máy khách kết nối LiveKit thành công: có trong `listParticipants` + webhook `participant_joined` (handler `calls` rồi handler Pomodoro, như ở worker). */
export async function connect(h: RoomHarness, callId: string, userId: string): Promise<void> {
  h.media.join(roomOf(callId), { identity: userId });
  await dispatchLiveKitEvent(lkEvent("participant_joined", roomOf(callId), userId));
}

/** Máy khách mất kết nối: rời `listParticipants` + webhook `participant_left`. */
export async function disconnect(h: RoomHarness, callId: string, userId: string): Promise<void> {
  h.media.leave(roomOf(callId), userId);
  await dispatchLiveKitEvent(lkEvent("participant_left", roomOf(callId), userId));
}

/** Giải mã phần `video` (grant LiveKit) của JWT token — kiểm nguồn được phát ở phía SERVER cấp. */
export function grantOf(token: string): { canPublish?: boolean; canPublishSources?: string[]; roomAdmin?: boolean; room?: string } {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { video?: Record<string, unknown> };
  return (payload.video ?? {}) as { canPublish?: boolean; canPublishSources?: string[]; roomAdmin?: boolean; room?: string };
}

/** Nguồn được phát ghi trong token (LiveKit JWT dùng chữ thường: `microphone`, `screen_share`…) — chuẩn hoá về UPPER_SNAKE như cổng `IMediaServer`. */
export function sourcesOf(token: string): string[] {
  return (grantOf(token).canPublishSources ?? []).map((s) => s.toUpperCase());
}

/** Cổng permission giả (không Socket.IO/BullMQ thật) để `revokeScope`/host action chạy trong test. */
export function installPermissionPorts(): void {
  setPermissionPorts({
    realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() },
    outbox: { enqueueNow: () => Promise.resolve() },
  });
}

export function resetPermissionSpy(): void {
  clearRevokeListeners();
  resetPermissionPorts();
}

/**
 * "Relay" outbox thủ công: chạy MỘT lượt các dòng `pomodoro.*` PENDING đang có (theo thứ tự tạo) như processor thật (`deadline`, `empty-room`, `media-sync`). Bỏ qua độ
 * trễ `delayMs` — test tua đồng hồ trước; processor tự kiểm CAS/version/NOT_DUE nên chạy sớm chỉ no-op. Dòng do chính lượt chạy này sinh ra (vd deadline của phase kế
 * tiếp) để lại cho lượt sau (sau khi test tua đồng hồ tiếp). Trả tên job đã chạy.
 */
export async function drainPomodoroOutbox(h: RoomHarness): Promise<string[]> {
  const ran: string[] = [];
  const rows = await prisma.outboxEvent.findMany({ where: { queue: "calls", status: "PENDING", jobName: { startsWith: "pomodoro." } }, orderBy: { createdAt: "asc" } });
  for (const row of rows) {
    const payload = row.payload as { sessionId: string; version: number; phase: string };
    await prisma.outboxEvent.update({ where: { id: row.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
    ran.push(row.jobName);
    if (row.jobName === "pomodoro.deadline") await h.pomo.runner.onDeadline(payload);
    else if (row.jobName === "pomodoro.empty-room") await h.pomo.runner.onEmptyRoomExpired(payload);
    else if (row.jobName === "pomodoro.media-sync") await h.pomo.runner.onMediaSync(payload.sessionId);
  }
  return ran;
}

export const deviceId = (label = "dev"): string => `${label}-${newObjectId().slice(0, 10)}`;
export const commandId = (): string => randomUUID();
