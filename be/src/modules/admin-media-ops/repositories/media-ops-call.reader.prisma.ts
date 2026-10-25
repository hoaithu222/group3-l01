import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { CallContext, CallRecord, ParticipantCounts, SetupCounts } from "../entities/admin-media.types";
import type { CallListFilter, IMediaOpsCallReader } from "./media-ops-read.repository.interface";
import { CALL_SELECT, byIdMap } from "./media-ops-select";

const ORDER: Record<CallListFilter["sort"], Prisma.CallOrderByWithRelationInput[]> = {
  "-startedAt": [{ startedAt: "desc" }, { id: "desc" }],
  startedAt: [{ startedAt: "asc" }, { id: "asc" }],
  "-durationSec": [{ durationSec: "desc" }, { startedAt: "desc" }, { id: "desc" }],
  "-peakParticipants": [{ peakParticipants: "desc" }, { startedAt: "desc" }, { id: "desc" }],
};

const ids = (calls: CallRecord[], scope: CallRecord["scopeType"]): string[] => [...new Set(calls.filter((c) => c.scopeType === scope).map((c) => c.scopeId))];

/**
 * Đọc cuộc gọi cho admin. KHÔNG có hàm nhận `userId`/`conversationId`: bảng `CallParticipant` chỉ được ĐẾM (`groupBy state|outcome`, `count`), không bao giờ liệt kê người.
 */
export class PrismaMediaOpsCallReader implements IMediaOpsCallReader {
  async listCalls(f: CallListFilter): Promise<{ rows: CallRecord[]; total: number }> {
    const where: Prisma.CallWhereInput = {
      ...(f.workspaceId ? { workspaceId: f.workspaceId } : {}),
      // `meetingId` ⇒ đúng `scopeType=MEETING` + `scopeId`; `scopeType` riêng lẻ lọc theo loại.
      ...(f.meetingId ? { scopeType: "MEETING" as const, scopeId: f.meetingId } : f.scopeType ? { scopeType: f.scopeType } : {}),
      ...(f.mode ? { mode: f.mode } : {}),
      ...(f.mediaKind ? { mediaKind: f.mediaKind } : {}),
      ...(f.statuses && f.statuses.length > 0 ? { status: { in: f.statuses } } : {}),
      ...(f.endReasons && f.endReasons.length > 0 ? { endReason: { in: f.endReasons } } : {}),
      ...(f.from || f.to ? { startedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.call.findMany({ where, select: CALL_SELECT, orderBy: ORDER[f.sort], skip: (f.page - 1) * f.limit, take: f.limit }),
      prisma.call.count({ where }),
    ]);
    return { rows, total };
  }

  findCall(id: string): Promise<CallRecord | null> {
    return prisma.call.findUnique({ where: { id }, select: CALL_SELECT });
  }

  async context(calls: CallRecord[]): Promise<CallContext> {
    const wsIds = [...new Set(calls.flatMap((c) => (c.workspaceId ? [c.workspaceId] : [])))];
    const [workspaces, conversations, channels, meetings] = await Promise.all([
      wsIds.length ? prisma.workspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true } }) : [],
      ids(calls, "CONVERSATION").length ? prisma.conversation.findMany({ where: { id: { in: ids(calls, "CONVERSATION") } }, select: { id: true, kind: true } }) : [],
      ids(calls, "CHANNEL").length ? prisma.channel.findMany({ where: { id: { in: ids(calls, "CHANNEL") } }, select: { id: true, name: true, visibility: true } }) : [],
      ids(calls, "MEETING").length ? prisma.meeting.findMany({ where: { id: { in: ids(calls, "MEETING") } }, select: { id: true, code: true, title: true } }) : [],
    ]);
    return {
      workspaceNames: byIdMap(workspaces, (w) => w.name),
      conversationKinds: byIdMap(conversations, (c) => c.kind),
      channels: byIdMap(channels, (c) => ({ name: c.name, visibility: c.visibility })),
      meetings: byIdMap(meetings, (m) => ({ code: m.code, title: m.title })),
    };
  }

  async participantCounts(callId: string): Promise<ParticipantCounts> {
    const groups = await prisma.callParticipant.groupBy({ by: ["state"], where: { callId }, _count: { _all: true } });
    return Object.fromEntries(groups.map((g) => [g.state, g._count._all]));
  }

  async setupCounts(callId: string, withinMs: number): Promise<SetupCounts> {
    // ≤ `LIMITS.call.maxParticipants`/`meeting.maxParticipants` hàng — tính hiệu `firstJoinedAt − joiningAt` trong bộ nhớ (Prisma không lọc theo hiệu hai cột).
    const rows = await prisma.callParticipant.findMany({ where: { callId, joiningAt: { not: null } }, select: { joiningAt: true, firstJoinedAt: true } });
    const success = rows.filter((r) => r.joiningAt && r.firstJoinedAt && r.firstJoinedAt.getTime() - r.joiningAt.getTime() <= withinMs).length;
    return { attempts: rows.length, successWithin: success };
  }
}
