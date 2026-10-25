/**
 * Bộ dựng dùng chung cho test tích hợp `admin-media-ops` (Mongo in-memory replset thật): seed người dùng/workspace/cuộc họp/cuộc gọi/participant/bản ghi hình
 * TRỰC TIẾP bằng Prisma (module này chỉ ĐỌC dữ liệu của module khác nên không cần đi qua nghiệp vụ của họ), dựng app Express và dọn dẹp. KHÔNG phải test.
 */
import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import adminMeetingsRoutes from "../../../meetings/admin-meetings.routes";
import adminMediaOpsRoutes from "../../admin-media-ops.routes";

export const SECRET_AGENDA = "BÍ-MẬT-AGENDA-XYZ";
export const SECRET_PLACE = "Phòng-kín-tầng-99";
export const SECRET_URL = "https://zoom.us/j/123456789?pwd=MAT-KHAU-BI-MAT";

export type Role = "admin" | "manager" | "user";

const letters = (n: number): string => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

export function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", adminMediaOpsRoutes);
  app.use("/api/v1", adminMeetingsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const tokenFor = (role: Role, userId = newObjectId()): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "Admin", role, sv: 1 });

export type Call = (method: "get" | "post" | "delete", path: string, role?: Role | null, body?: unknown) => request.Test;

export function makeCall(app: express.Express): Call {
  return (method, path, role = "admin", body) => {
    let req = request(app)[method](`/api/v1${path}`);
    if (role) req = req.set("Authorization", `Bearer ${tokenFor(role)}`);
    return body === undefined ? req : req.send(body as object);
  };
}

export interface Ids {
  users: string[];
  workspaces: string[];
  meetings: string[];
  calls: string[];
  recordings: string[];
  conversations: string[];
  channels: string[];
}

export const newIds = (): Ids => ({ users: [], workspaces: [], meetings: [], calls: [], recordings: [], conversations: [], channels: [] });

export async function seedWorkspace(ids: Ids, name = `Nhóm ${randomUUID().slice(0, 6)}`): Promise<{ workspaceId: string; ownerId: string; ownerName: string }> {
  const ownerId = newObjectId();
  const workspaceId = newObjectId();
  const ownerName = `Chủ ${name}`;
  await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@e.com`, name: ownerName, normalizedName: normalizeSearch(ownerName) } });
  await prisma.workspace.create({ data: { id: workspaceId, name, normalizedName: normalizeSearch(name), ownerId, status: "ACTIVE" } });
  ids.users.push(ownerId);
  ids.workspaces.push(workspaceId);
  return { workspaceId, ownerId, ownerName };
}

type MeetingOver = Partial<{
  title: string; code: string; status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED"; platform: "INTERNAL" | "ZOOM" | "TEAMS" | "GOOGLE_MEET" | "OTHER";
  startAt: Date; endAt: Date; attendeeCount: number; currentCallId: string | null; lockedAt: Date | null; endReason: "HOST_ENDED" | "EMPTY" | "MAX_DURATION" | "FORCE_ENDED" | null; deleted: boolean;
}>;

export async function seedMeeting(ids: Ids, w: { workspaceId: string; ownerId: string }, over: MeetingOver = {}): Promise<{ id: string; code: string }> {
  const id = newObjectId();
  const title = over.title ?? "Họp tuần";
  const code = over.code ?? `${letters(3)}-${letters(4)}-${letters(3)}`;
  const startAt = over.startAt ?? new Date(Date.now() + 3_600_000);
  await prisma.meeting.create({
    data: {
      id, workspaceId: w.workspaceId, code, title, normalizedTitle: normalizeSearch(title), agenda: SECRET_AGENDA, location: SECRET_PLACE, externalUrl: SECRET_URL,
      platform: over.platform ?? "INTERNAL", startAt, endAt: over.endAt ?? new Date(startAt.getTime() + 3_600_000), timezone: "Asia/Ho_Chi_Minh", status: over.status ?? "SCHEDULED",
      hostId: w.ownerId, createdBy: w.ownerId, attendeeCount: over.attendeeCount ?? 3, currentCallId: over.currentCallId ?? null, lockedAt: over.lockedAt ?? null,
      endReason: over.endReason ?? null, deletedAt: over.deleted ? new Date() : null, cancelledAt: over.status === "CANCELLED" ? new Date() : null,
    },
  });
  ids.meetings.push(id);
  return { id, code };
}

type CallOver = Partial<{
  id: string; scopeType: "CONVERSATION" | "CHANNEL" | "MEETING"; scopeId: string; workspaceId: string | null; mode: "RING" | "ROOM"; mediaKind: "AUDIO" | "VIDEO";
  status: "RINGING" | "ACTIVE" | "ENDED"; endReason: "COMPLETED" | "CANCELLED" | "NO_ANSWER" | "DECLINED" | "BUSY" | "FAILED" | "REVOKED" | "ARCHIVED" | "HOST_ENDED" | "FORCE_ENDED" | "EMPTY" | "MAX_DURATION" | null;
  startedAt: Date; answeredAt: Date | null; endedAt: Date | null; durationSec: number | null; peakParticipants: number; invitedCount: number; initiatorId: string;
}>;

export async function seedCall(ids: Ids, over: CallOver = {}): Promise<{ id: string; initiatorId: string; scopeId: string }> {
  const id = over.id ?? newObjectId();
  const scopeId = over.scopeId ?? newObjectId();
  const initiatorId = over.initiatorId ?? newObjectId();
  const status = over.status ?? "ENDED";
  await prisma.call.create({
    data: {
      id, scopeType: over.scopeType ?? "CONVERSATION", scopeId, workspaceId: over.workspaceId ?? null, mode: over.mode ?? "RING", mediaKind: over.mediaKind ?? "AUDIO", status,
      endReason: over.endReason ?? (status === "ENDED" ? "COMPLETED" : null), initiatorId, hostId: over.mode === "ROOM" ? initiatorId : null, livekitRoom: `call_${id}`, clientCallId: randomUUID(),
      activeKey: status === "ENDED" ? `ended:${id}` : `${over.scopeType ?? "CONVERSATION"}:${scopeId}`, invitedCount: over.invitedCount ?? 1, peakParticipants: over.peakParticipants ?? 2,
      startedAt: over.startedAt ?? new Date(), answeredAt: over.answeredAt ?? null, endedAt: "endedAt" in over ? (over.endedAt ?? null) : status === "ENDED" ? new Date() : null,
      durationSec: "durationSec" in over ? (over.durationSec ?? null) : status === "ENDED" ? 60 : null,
    },
  });
  ids.calls.push(id);
  return { id, initiatorId, scopeId };
}

type PartOver = Partial<{ state: "INVITED" | "RINGING" | "DECLINED" | "MISSED" | "BUSY" | "JOINING" | "CONNECTED" | "RECONNECTING" | "LEFT" | "REMOVED"; role: "INITIATOR" | "HOST" | "CO_HOST" | "MEMBER"; joiningAt: Date | null; firstJoinedAt: Date | null }>;

export async function seedParticipant(call: { id: string }, callInfo: { scopeType: "CONVERSATION" | "CHANNEL" | "MEETING"; scopeId: string; startedAt: Date; mode?: "RING" | "ROOM" }, over: PartOver = {}): Promise<string> {
  const userId = newObjectId();
  await prisma.callParticipant.create({
    data: {
      callId: call.id, userId, role: over.role ?? "MEMBER", state: over.state ?? "LEFT", joiningAt: over.joiningAt ?? null, firstJoinedAt: over.firstJoinedAt ?? null,
      publishPermissions: { audio: true, video: true, screen: false }, callStartedAt: callInfo.startedAt, scopeType: callInfo.scopeType, scopeId: callInfo.scopeId, mediaKind: "AUDIO", mode: callInfo.mode ?? "RING",
    },
  });
  return userId;
}

export async function seedRecording(ids: Ids, meeting: { id: string }, w: { workspaceId: string; ownerId: string }, callId: string, over: Partial<{ status: "READY" | "FAILED" | "RECORDING"; fileSizeBytes: number; deleted: boolean; startedAt: Date }> = {}): Promise<string> {
  const id = newObjectId();
  await prisma.meetingRecording.create({
    data: {
      id, meetingId: meeting.id, workspaceId: w.workspaceId, callId, requestId: randomUUID(), status: over.status ?? "READY", storageKey: `recordings/${w.workspaceId}/${meeting.id}/${id}.mp4`,
      fileSizeBytes: over.fileSizeBytes ?? 1000, startedBy: w.ownerId, startedAt: over.startedAt ?? new Date(), deletedAt: over.deleted ? new Date() : null,
    },
  });
  ids.recordings.push(id);
  return id;
}

export async function cleanup(ids: Ids): Promise<void> {
  await prisma.meetingRecording.deleteMany({ where: { id: { in: ids.recordings } } });
  await prisma.callParticipant.deleteMany({ where: { callId: { in: ids.calls } } });
  await prisma.call.deleteMany({ where: { id: { in: ids.calls } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...ids.meetings, ...ids.calls] } } });
  await prisma.auditLog.deleteMany({ where: { targetId: { in: [...ids.meetings, ...ids.calls, ...ids.recordings] } } });
  await prisma.meeting.deleteMany({ where: { id: { in: ids.meetings } } });
  await prisma.workspace.deleteMany({ where: { id: { in: ids.workspaces } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
}

/** Mongo in-memory không chạy `db push` ⇒ không có unique index — tạo tay `OutboxEvent.dedupeKey` để test đường P2002 khi bấm force-end đồng thời. */
export async function ensureOutboxIndex(): Promise<void> {
  await prisma.$runCommandRaw({ createIndexes: "OutboxEvent", indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }] });
}
