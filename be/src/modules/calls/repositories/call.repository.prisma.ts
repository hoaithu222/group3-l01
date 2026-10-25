import { Prisma, type Call, type CallParticipant } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  CallEntity,
  CallHistoryFilter,
  CallParticipantEntity,
  CallPatch,
  CallScopeTypeValue,
  NewCall,
  NewParticipant,
  ParticipantPatch,
} from "../entities/call.interface";
import {
  CallActiveConflictError,
  type CallCas,
  type ICallRepository,
  type ParticipantCas,
} from "./call.repository.interface";
import type { TxHandle } from "./tx";

const OPEN_PARTICIPANT_STATES = ["INVITED", "RINGING", "JOINING", "CONNECTED", "RECONNECTING"] as const;

function toCall(row: Call): CallEntity {
  return row as unknown as CallEntity;
}

function toParticipant(row: CallParticipant): CallParticipantEntity {
  return {
    ...(row as unknown as CallParticipantEntity),
    publishPermissions: { audio: row.publishPermissions.audio, video: row.publishPermissions.video, screen: row.publishPermissions.screen },
  };
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function conflictField(err: Prisma.PrismaClientKnownRequestError): "activeKey" | "clientCallId" | "other" {
  const target = JSON.stringify(err.meta?.target ?? "");
  if (target.includes("activeKey")) return "activeKey";
  if (target.includes("clientCallId") || target.includes("initiatorId")) return "clientCallId";
  return "other";
}

export class PrismaCallRepository implements ICallRepository {
  private db(tx?: TxHandle): TxHandle | typeof prisma {
    return tx ?? prisma;
  }

  async findById(id: string, tx?: TxHandle): Promise<CallEntity | null> {
    const row = await this.db(tx).call.findUnique({ where: { id } });
    return row ? toCall(row) : null;
  }

  async findByIds(ids: string[]): Promise<CallEntity[]> {
    if (ids.length === 0) return [];
    return (await prisma.call.findMany({ where: { id: { in: ids } } })).map(toCall);
  }

  async findByInitiatorClientId(initiatorId: string, clientCallId: string): Promise<CallEntity | null> {
    const row = await prisma.call.findFirst({ where: { initiatorId, clientCallId } });
    return row ? toCall(row) : null;
  }

  async findParticipants(callId: string, tx?: TxHandle): Promise<CallParticipantEntity[]> {
    return (await this.db(tx).callParticipant.findMany({ where: { callId }, orderBy: { createdAt: "asc" } })).map(toParticipant);
  }

  async findParticipantsOf(callIds: string[]): Promise<CallParticipantEntity[]> {
    if (callIds.length === 0) return [];
    return (await prisma.callParticipant.findMany({ where: { callId: { in: callIds } }, orderBy: { createdAt: "asc" } })).map(toParticipant);
  }

  async findParticipant(callId: string, userId: string, tx?: TxHandle): Promise<CallParticipantEntity | null> {
    const row = await this.db(tx).callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
    return row ? toParticipant(row) : null;
  }

  async findOpenParticipations(userId: string): Promise<Array<{ call: CallEntity; participant: CallParticipantEntity }>> {
    const rows = await prisma.callParticipant.findMany({
      where: { userId, state: { in: [...OPEN_PARTICIPANT_STATES] }, call: { status: { not: "ENDED" } } },
      include: { call: true },
      orderBy: { callStartedAt: "desc" },
    });
    return rows.map(({ call, ...participant }) => ({ call: toCall(call), participant: toParticipant(participant as CallParticipant) }));
  }

  async listHistory(userId: string, f: CallHistoryFilter): Promise<CallParticipantEntity[]> {
    const and: Prisma.CallParticipantWhereInput[] = [{ userId }, { outcome: { not: null } }];
    if (f.filter === "missed") and.push({ outcome: { in: ["MISSED", "BUSY"] } });
    if (f.scopeType) and.push({ scopeType: f.scopeType });
    if (f.scopeId) and.push({ scopeId: f.scopeId });
    if (f.cursor) {
      and.push({
        OR: [{ callStartedAt: { lt: f.cursor.at } }, { callStartedAt: f.cursor.at, id: { lt: f.cursor.id } }],
      });
    }
    const rows = await prisma.callParticipant.findMany({
      where: { AND: and },
      orderBy: [{ callStartedAt: "desc" }, { id: "desc" }],
      take: f.limit + 1,
    });
    return rows.map(toParticipant);
  }

  async findRingingStartedBefore(cutoff: Date, limit: number): Promise<CallEntity[]> {
    return (await prisma.call.findMany({ where: { status: "RINGING", startedAt: { lt: cutoff } }, take: limit })).map(toCall);
  }

  async findActiveNotReconciledSince(cutoff: Date, limit: number): Promise<CallEntity[]> {
    return (
      await prisma.call.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastReconciledAt: { lt: cutoff, not: null } },
            { lastReconciledAt: null, OR: [{ answeredAt: { lt: cutoff } }, { startedAt: { lt: cutoff } }] },
            { lastReconciledAt: { isSet: false }, OR: [{ answeredAt: { lt: cutoff } }, { startedAt: { lt: cutoff } }] },
          ],
        },
        take: limit,
      })
    ).map(toCall);
  }

  async findOpenByScope(scopeType: CallScopeTypeValue, scopeIds: string[]): Promise<CallEntity[]> {
    if (scopeIds.length === 0) return [];
    return (await prisma.call.findMany({ where: { scopeType, scopeId: { in: scopeIds }, status: { not: "ENDED" } } })).map(toCall);
  }

  async findOpenByWorkspace(workspaceId: string): Promise<CallEntity[]> {
    return (await prisma.call.findMany({ where: { workspaceId, status: { not: "ENDED" } } })).map(toCall);
  }

  async findOpenCallsOfUser(userId: string): Promise<CallEntity[]> {
    const rows = await prisma.callParticipant.findMany({
      where: { userId, state: { in: [...OPEN_PARTICIPANT_STATES] }, call: { status: { not: "ENDED" } } },
      select: { callId: true },
    });
    return this.findByIds([...new Set(rows.map((r) => r.callId))]);
  }

  async countOpenByMode(): Promise<{ RING: number; ROOM: number }> {
    const [ring, room] = await Promise.all([
      prisma.call.count({ where: { status: { not: "ENDED" }, mode: "RING" } }),
      prisma.call.count({ where: { status: { not: "ENDED" }, mode: "ROOM" } }),
    ]);
    return { RING: ring, ROOM: room };
  }

  async createCall(tx: TxHandle, call: NewCall): Promise<CallEntity> {
    try {
      const row = await tx.call.create({
        data: {
          id: call.id,
          scopeType: call.scopeType,
          scopeId: call.scopeId,
          workspaceId: call.workspaceId,
          mode: call.mode,
          mediaKind: call.mediaKind,
          status: call.status,
          endReason: null,
          initiatorId: call.initiatorId,
          hostId: call.hostId,
          livekitRoom: call.livekitRoom,
          clientCallId: call.clientCallId,
          activeKey: call.activeKey,
          invitedCount: call.invitedCount,
          peakParticipants: call.peakParticipants ?? 0,
          startedAt: call.startedAt,
          answeredAt: call.answeredAt,
          endedAt: null,
          durationSec: null,
          endedBy: null,
          lastReconciledAt: null,
        },
      });
      return toCall(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new CallActiveConflictError(conflictField(err));
      throw err;
    }
  }

  async createParticipants(tx: TxHandle, list: NewParticipant[]): Promise<void> {
    if (list.length === 0) return;
    await tx.callParticipant.createMany({
      data: list.map((p) => ({
        callId: p.callId,
        userId: p.userId,
        role: p.role,
        state: p.state,
        invitedAt: p.invitedAt ?? null,
        invitedBy: p.invitedBy ?? null,
        joiningAt: p.joiningAt ?? null,
        respondedAt: p.respondedAt ?? null,
        respondedDeviceId: p.respondedDeviceId ?? null,
        firstJoinedAt: p.firstJoinedAt ?? null,
        lastJoinedAt: p.lastJoinedAt ?? null,
        lastLeftAt: null,
        connectedSeconds: 0,
        publishPermissions: p.publishPermissions,
        handRaisedAt: null,
        mutedByHost: false,
        removedBy: null,
        lastRingAckAt: null,
        ringAckDeviceIds: [],
        callStartedAt: p.callStartedAt,
        scopeType: p.scopeType,
        scopeId: p.scopeId,
        mediaKind: p.mediaKind,
        mode: p.mode,
        outcome: p.outcome ?? null,
      })),
    });
  }

  async updateCall(tx: TxHandle | undefined, id: string, cas: CallCas, patch: CallPatch): Promise<CallEntity | null> {
    const db = this.db(tx);
    const where: Prisma.CallWhereInput = { id };
    if (cas.version !== undefined) where.version = cas.version;
    if (cas.status) where.status = { in: cas.status };
    if (cas.statusNot) where.status = { not: cas.statusNot };
    if (cas.hostId !== undefined) where.hostId = cas.hostId;
    const res = await db.call.updateMany({ where, data: { ...patch, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const row = await db.call.findUnique({ where: { id } });
    return row ? toCall(row) : null;
  }

  async touchCall(id: string, patch: Pick<CallPatch, "lastReconciledAt" | "peakParticipants">): Promise<void> {
    await prisma.call.updateMany({ where: { id, status: { not: "ENDED" } }, data: { ...patch } });
  }

  async updateParticipant(
    tx: TxHandle | undefined,
    callId: string,
    userId: string,
    cas: ParticipantCas,
    patch: ParticipantPatch
  ): Promise<CallParticipantEntity | null> {
    const db = this.db(tx);
    const where: Prisma.CallParticipantWhereInput = { callId, userId };
    if (cas.version !== undefined) where.version = cas.version;
    if (cas.stateIn) where.state = { in: cas.stateIn };
    const { publishPermissions, ...rest } = patch;
    const res = await db.callParticipant.updateMany({
      where,
      data: { ...rest, ...(publishPermissions ? { publishPermissions: { set: publishPermissions } } : {}), version: { increment: 1 } },
    });
    if (res.count === 0) return null;
    const row = await db.callParticipant.findUnique({ where: { callId_userId: { callId, userId } } });
    return row ? toParticipant(row) : null;
  }
}
