import type { FingerprintKind, FingerprintStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { num, oid } from "./raw";

export interface FingerprintRow {
  id: string;
  workspaceId: string;
  resourceId: string;
  resourceVersion: number;
  assetId: string;
  kind: FingerprintKind | null;
  language: string | null;
  status: FingerprintStatus;
  algoVersion: number;
  tokenCount: number;
  hashCount: number;
  hashes: number[];
  truncated: boolean;
  derivedKey: string | null;
  errorCode: string | null;
  resourceDeleted: boolean;
  indexedAt: Date | null;
}

export interface UpsertPendingInput {
  resourceId: string;
  workspaceId: string;
  resourceVersion: number;
  assetId: string;
  algoVersion: number;
}

export interface MarkReadyInput {
  algoVersion: number;
  kind: FingerprintKind;
  language: string | null;
  tokenCount: number;
  hashCount: number;
  hashes: number[];
  truncated: boolean;
  derivedKey: string;
}

export interface CandidateFingerprint {
  resourceId: string;
  hashes: number[];
  derivedKey: string | null;
}

/**
 * Repository `DocumentFingerprint` (be.md §5.1/§5.3). CAS đơn giản: mọi hàm ghi trạng thái đọc lại `resourceVersion`
 * trước khi caller quyết định ghi (xem `fingerprint-index.service.claimForIndexing`) — Mongo không có `updateMany` trả
 * về bản ghi đã sửa nên kiểm ở tầng service thay vì cố nhét điều kiện `WHERE` phức tạp vào đây.
 */
export interface IFingerprintRepository {
  findByResourceId(resourceId: string): Promise<FingerprintRow | null>;
  findManyByResourceIds(ids: string[]): Promise<FingerprintRow[]>;
  upsertPending(input: UpsertPendingInput): Promise<FingerprintRow>;
  markUnsupported(input: UpsertPendingInput): Promise<FingerprintRow>;
  markStatus(resourceId: string, status: FingerprintStatus, errorCode: string | null): Promise<void>;
  markReady(resourceId: string, patch: MarkReadyInput): Promise<FingerprintRow>;
  markResourceDeleted(resourceId: string, deleted: boolean): Promise<void>;
  deleteByResourceId(resourceId: string): Promise<FingerprintRow | null>;
  /** Ứng viên nguồn: cùng workspace/kind, READY, chưa xoá, không thuộc `excludeResourceIds`, chứa ÍT NHẤT một hash trong lô. */
  findCandidatesByHashes(params: {
    workspaceId: string;
    kind: FingerprintKind;
    hashBatch: number[];
    excludeResourceIds: string[];
  }): Promise<CandidateFingerprint[]>;
  /** Số tài liệu READY (cùng loại, workspace) chứa TỪNG hash trong lô — dùng tính "câu chữ phổ biến" (README §2). */
  docFrequency(params: { workspaceId: string; kind: FingerprintKind; hashBatch: number[] }): Promise<Map<number, number>>;
  countReadyByKind(workspaceId: string, kind: FingerprintKind): Promise<number>;
  /** Đặt lại `PENDING` cho reindex admin (thuật toán đổi phiên bản) — trả số bản ghi bị đổi. */
  resetForReindex(filter: { workspaceId?: string; algoVersionLessThan: number }, batch: number): Promise<Array<{ resourceId: string; resourceVersion: number }>>;
  /** Đếm nhanh số bản ghi khớp điều kiện reindex — dùng để trả `{ queued }` ngay cho admin trước khi job nền chạy thật. */
  countForReindex(filter: { workspaceId?: string; algoVersionLessThan: number }): Promise<number>;
}

export class PrismaFingerprintRepository implements IFingerprintRepository {
  findByResourceId(resourceId: string): Promise<FingerprintRow | null> {
    return prisma.documentFingerprint.findUnique({ where: { resourceId } });
  }

  findManyByResourceIds(ids: string[]): Promise<FingerprintRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.documentFingerprint.findMany({ where: { resourceId: { in: ids } } });
  }

  upsertPending(input: UpsertPendingInput): Promise<FingerprintRow> {
    return prisma.documentFingerprint.upsert({
      where: { resourceId: input.resourceId },
      create: {
        resourceId: input.resourceId,
        workspaceId: input.workspaceId,
        resourceVersion: input.resourceVersion,
        assetId: input.assetId,
        algoVersion: input.algoVersion,
        status: "PENDING",
      },
      update: {
        resourceVersion: input.resourceVersion,
        assetId: input.assetId,
        algoVersion: input.algoVersion,
        status: "PENDING",
        errorCode: null,
        resourceDeleted: false,
      },
    });
  }

  markUnsupported(input: UpsertPendingInput): Promise<FingerprintRow> {
    return prisma.documentFingerprint.upsert({
      where: { resourceId: input.resourceId },
      create: {
        resourceId: input.resourceId,
        workspaceId: input.workspaceId,
        resourceVersion: input.resourceVersion,
        assetId: input.assetId,
        algoVersion: input.algoVersion,
        status: "UNSUPPORTED",
      },
      update: {
        resourceVersion: input.resourceVersion,
        assetId: input.assetId,
        algoVersion: input.algoVersion,
        status: "UNSUPPORTED",
        errorCode: null,
        resourceDeleted: false,
      },
    });
  }

  async markStatus(resourceId: string, status: FingerprintStatus, errorCode: string | null): Promise<void> {
    await prisma.documentFingerprint.updateMany({ where: { resourceId }, data: { status, errorCode, indexedAt: new Date() } });
  }

  markReady(resourceId: string, patch: MarkReadyInput): Promise<FingerprintRow> {
    return prisma.documentFingerprint.update({
      where: { resourceId },
      data: {
        algoVersion: patch.algoVersion,
        kind: patch.kind,
        language: patch.language,
        status: "READY",
        errorCode: null,
        tokenCount: patch.tokenCount,
        hashCount: patch.hashCount,
        hashes: patch.hashes,
        truncated: patch.truncated,
        derivedKey: patch.derivedKey,
        indexedAt: new Date(),
      },
    });
  }

  async markResourceDeleted(resourceId: string, deleted: boolean): Promise<void> {
    await prisma.documentFingerprint.updateMany({ where: { resourceId }, data: { resourceDeleted: deleted } });
  }

  async deleteByResourceId(resourceId: string): Promise<FingerprintRow | null> {
    const existing = await prisma.documentFingerprint.findUnique({ where: { resourceId } });
    if (!existing) return null;
    await prisma.documentFingerprint.delete({ where: { resourceId } });
    return existing;
  }

  findCandidatesByHashes(params: { workspaceId: string; kind: FingerprintKind; hashBatch: number[]; excludeResourceIds: string[] }): Promise<CandidateFingerprint[]> {
    if (params.hashBatch.length === 0) return Promise.resolve([]);
    return prisma.documentFingerprint.findMany({
      where: {
        workspaceId: params.workspaceId,
        kind: params.kind,
        status: "READY",
        resourceDeleted: false,
        ...(params.excludeResourceIds.length > 0 && { resourceId: { notIn: params.excludeResourceIds } }),
        hashes: { hasSome: params.hashBatch },
      },
      select: { resourceId: true, hashes: true, derivedKey: true },
    });
  }

  async docFrequency(params: { workspaceId: string; kind: FingerprintKind; hashBatch: number[] }): Promise<Map<number, number>> {
    if (params.hashBatch.length === 0) return new Map();
    const raw = (await prisma.documentFingerprint.aggregateRaw({
      pipeline: [
        { $match: { workspaceId: oid(params.workspaceId), kind: params.kind, status: "READY", resourceDeleted: false, hashes: { $in: params.hashBatch } } },
        { $project: { hashes: 1 } },
        { $unwind: "$hashes" },
        { $match: { hashes: { $in: params.hashBatch } } },
        { $group: { _id: "$hashes", count: { $sum: 1 } } },
      ],
    })) as unknown as Array<{ _id: unknown; count: unknown }>;
    const map = new Map<number, number>();
    for (const row of raw) map.set(num(row._id), num(row.count));
    return map;
  }

  countReadyByKind(workspaceId: string, kind: FingerprintKind): Promise<number> {
    return prisma.documentFingerprint.count({ where: { workspaceId, kind, status: "READY", resourceDeleted: false } });
  }

  async resetForReindex(filter: { workspaceId?: string; algoVersionLessThan: number }, batch: number): Promise<Array<{ resourceId: string; resourceVersion: number }>> {
    const rows = await prisma.documentFingerprint.findMany({
      where: {
        ...(filter.workspaceId && { workspaceId: filter.workspaceId }),
        algoVersion: { lt: filter.algoVersionLessThan },
        status: { in: ["READY", "NO_TEXT", "TOO_LARGE", "FAILED"] },
      },
      select: { resourceId: true, resourceVersion: true },
      take: batch,
    });
    const ids = rows.map((r) => r.resourceId);
    if (ids.length > 0) await prisma.documentFingerprint.updateMany({ where: { resourceId: { in: ids } }, data: { status: "PENDING", errorCode: null } });
    return rows;
  }

  countForReindex(filter: { workspaceId?: string; algoVersionLessThan: number }): Promise<number> {
    return prisma.documentFingerprint.count({
      where: {
        ...(filter.workspaceId && { workspaceId: filter.workspaceId }),
        algoVersion: { lt: filter.algoVersionLessThan },
        status: { in: ["READY", "NO_TEXT", "TOO_LARGE", "FAILED"] },
      },
    });
  }
}
