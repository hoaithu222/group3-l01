import { prisma } from "../../../infrastructure/database";
import { ACTIVE_RECORDING_STATUSES, type ConsentEntry, type NewRecording, type RecordingEntity, type RecordingPatch, type RecordingStatusValue } from "../entities/meeting-recap.interface";
import type { IMeetingRecordingRepository, StuckThresholds } from "./meeting-recording.repository.interface";
import type { TxHandle } from "./tx";

type Row = Awaited<ReturnType<typeof prisma.meetingRecording.findFirstOrThrow>>;

const toEntity = (r: Row): RecordingEntity => ({
  id: r.id,
  meetingId: r.meetingId,
  workspaceId: r.workspaceId,
  callId: r.callId,
  requestId: r.requestId,
  egressId: r.egressId,
  layout: r.layout,
  status: r.status,
  storageKey: r.storageKey,
  assetId: r.assetId,
  fileSizeBytes: r.fileSizeBytes,
  startedBy: r.startedBy,
  consentSnapshot: r.consentSnapshot.map((c) => ({ userId: c.userId, at: c.at, lateJoin: c.lateJoin })),
  startedAt: r.startedAt,
  stoppedAt: r.stoppedAt,
  stoppedBy: r.stoppedBy,
  stopReason: r.stopReason,
  durationSec: r.durationSec,
  error: r.error,
  importAttempts: r.importAttempts,
  retentionExpiresAt: r.retentionExpiresAt,
  deletedAt: r.deletedAt,
  deletedBy: r.deletedBy,
  deleteReason: r.deleteReason,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const client = (tx?: TxHandle) => tx ?? prisma;
const active = [...ACTIVE_RECORDING_STATUSES];

export class PrismaMeetingRecordingRepository implements IMeetingRecordingRepository {
  async findById(id: string, tx?: TxHandle): Promise<RecordingEntity | null> {
    const r = await client(tx).meetingRecording.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async findByEgressId(egressId: string): Promise<RecordingEntity | null> {
    const r = await prisma.meetingRecording.findFirst({ where: { egressId } });
    return r ? toEntity(r) : null;
  }

  async findActiveByCall(callId: string, tx?: TxHandle): Promise<RecordingEntity | null> {
    const r = await client(tx).meetingRecording.findFirst({ where: { callId, status: { in: active }, deletedAt: null }, orderBy: { startedAt: "desc" } });
    return r ? toEntity(r) : null;
  }

  async listByMeeting(meetingId: string, opts: { readyOnly: boolean }): Promise<RecordingEntity[]> {
    const rows = await prisma.meetingRecording.findMany({
      where: { meetingId, deletedAt: null, ...(opts.readyOnly ? { status: "READY" as const } : {}) },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toEntity);
  }

  countActive(): Promise<number> {
    return prisma.meetingRecording.count({ where: { status: { in: active }, deletedAt: null } });
  }

  async readyCountsByMeeting(meetingIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (meetingIds.length === 0) return out;
    const rows = await prisma.meetingRecording.groupBy({ by: ["meetingId"], where: { meetingId: { in: meetingIds }, status: "READY", deletedAt: null }, _count: { _all: true } });
    for (const r of rows) out.set(r.meetingId, r._count._all);
    return out;
  }

  async sumReadyBytes(): Promise<number> {
    const agg = await prisma.meetingRecording.aggregate({ where: { status: "READY", deletedAt: null }, _sum: { fileSizeBytes: true } });
    return agg._sum.fileSizeBytes ?? 0;
  }

  async create(tx: TxHandle, r: NewRecording): Promise<RecordingEntity> {
    const created = await tx.meetingRecording.create({
      data: {
        id: r.id,
        meetingId: r.meetingId,
        workspaceId: r.workspaceId,
        callId: r.callId,
        requestId: r.requestId,
        layout: r.layout,
        status: "STARTING",
        storageKey: r.storageKey,
        startedBy: r.startedBy,
        consentSnapshot: r.consentSnapshot,
        startedAt: r.startedAt,
        egressId: null,
        assetId: null,
        fileSizeBytes: null,
        stoppedAt: null,
        stoppedBy: null,
        stopReason: null,
        durationSec: null,
        error: null,
        retentionExpiresAt: null,
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
      },
    });
    return toEntity(created);
  }

  async transition(tx: TxHandle | undefined, id: string, from: readonly RecordingStatusValue[], patch: RecordingPatch): Promise<RecordingEntity | null> {
    const c = client(tx);
    const res = await c.meetingRecording.updateMany({ where: { id, status: { in: [...from] }, deletedAt: null }, data: { ...patch, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const r = await c.meetingRecording.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async adoptEgress(id: string, egressId: string): Promise<boolean> {
    const res = await prisma.meetingRecording.updateMany({ where: { id, status: "STARTING", egressId: null, deletedAt: null }, data: { egressId } });
    return res.count > 0;
  }

  async pushConsent(id: string, entry: ConsentEntry): Promise<boolean> {
    const res = await prisma.meetingRecording.updateMany({
      where: { id, status: { in: active }, deletedAt: null, consentSnapshot: { none: { userId: entry.userId } } },
      data: { consentSnapshot: { push: entry } },
    });
    return res.count > 0;
  }

  async markDeleted(tx: TxHandle, id: string, at: Date, by: string | null, reason: string): Promise<RecordingEntity | null> {
    const res = await tx.meetingRecording.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: at, deletedBy: by, deleteReason: reason, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const r = await tx.meetingRecording.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async findExpired(now: Date, limit: number): Promise<RecordingEntity[]> {
    // `lt` trên trường nullable khớp cả `null` => luôn thêm `not: null`.
    const rows = await prisma.meetingRecording.findMany({
      where: { status: { in: ["READY", "FAILED"] }, deletedAt: null, retentionExpiresAt: { not: null, lt: now } },
      orderBy: { retentionExpiresAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async findStuck(t: StuckThresholds, limit: number): Promise<RecordingEntity[]> {
    const rows = await prisma.meetingRecording.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: "STARTING", updatedAt: { lt: t.startingBefore } },
          { status: "STOPPING", updatedAt: { lt: t.stoppingBefore } },
          { status: "PROCESSING", updatedAt: { lt: t.processingBefore } },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }
}
