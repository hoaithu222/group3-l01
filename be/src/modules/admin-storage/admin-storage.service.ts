import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database";
import { enqueue, getQueue } from "../../infrastructure/queue";
import { env } from "../../core/config";
import type { StorageStatsQuery } from "./admin-storage.validators";

/** Cổng ghi audit log — thoả mãn bởi `AuditService` (module audit-log) qua structural typing (giống `admin-jobs`). */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface StorageCleanupResult {
  /** `jobId` BullMQ của lượt dọn thủ công (trong queue `cron`) — `assets.cleanup:manual:<yyyyMMddHH>` (UTC). */
  jobId: string;
  /** `true` = giờ này đã có lượt thủ công (đang chờ/chạy/đã xong) nên KHÔNG xếp thêm và KHÔNG ghi audit. */
  alreadyQueued: boolean;
}

/** `yyyyMMddHH` theo UTC — khoá giờ của `jobId` dọn thủ công (mỗi giờ tối đa 1 lượt). */
export function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13).replace(/[-T]/g, "");
}

export interface StorageBucket {
  key: string;
  count: number;
  bytes: number;
}

export interface StorageStats {
  totals: { bytes: number; count: number };
  byScope: StorageBucket[];
  byKind: StorageBucket[];
  byStatus: StorageBucket[];
  orphan: { count: number; bytes: number };
  storageType: string;
}

/** Trần số ứng viên `orphan` quét cho thống kê — đủ cho công cụ quan sát nội bộ, không phải phân trang chính xác tuyệt đối (giống `AdminJobsService.getFailedJobs`). */
const ORPHAN_SCAN_LIMIT = 5000;

/**
 * `AdminStorageService` — thống kê dung lượng asset theo scope/kind/status +
 * ước lượng "mồ côi" sắp bị `assets.cleanup` dọn (be.md p0-05 §4). Đọc thẳng
 * Prisma `groupBy`/`aggregate` (không qua `IAssetRepository` — đây là truy
 * vấn thống kê xuyên toàn bộ collection, không phải CRUD 1 asset, giống
 * `AdminJobsService` đọc thẳng BullMQ `Queue`, xem `architecture.md`
 * "Pattern Flat").
 */
export class AdminStorageService {
  constructor(private readonly audit?: AuditRecorder) {}

  async getStats(query: StorageStatsQuery): Promise<StorageStats> {
    const baseWhere: Prisma.AssetWhereInput = {
      ...(query.workspaceId && { workspaceId: query.workspaceId }),
    };
    const activeWhere: Prisma.AssetWhereInput = { ...baseWhere, status: { not: "DELETED" } };

    const [totals, byScope, byKind, byStatus, orphan] = await Promise.all([
      prisma.asset.aggregate({ where: activeWhere, _sum: { size: true }, _count: { _all: true } }),
      prisma.asset.groupBy({ by: ["scope"], where: activeWhere, _sum: { size: true }, _count: { _all: true } }),
      prisma.asset.groupBy({ by: ["kind"], where: activeWhere, _sum: { size: true }, _count: { _all: true } }),
      prisma.asset.groupBy({ by: ["status"], where: baseWhere, _sum: { size: true }, _count: { _all: true } }),
      this.getOrphanStats(baseWhere),
    ]);

    return {
      totals: { bytes: totals._sum.size ?? 0, count: totals._count._all },
      byScope: byScope.map((b) => ({ key: b.scope, count: b._count._all, bytes: b._sum.size ?? 0 })),
      byKind: byKind.map((b) => ({ key: b.kind, count: b._count._all, bytes: b._sum.size ?? 0 })),
      byStatus: byStatus.map((b) => ({ key: b.status, count: b._count._all, bytes: b._sum.size ?? 0 })),
      orphan,
      storageType: env.STORAGE_TYPE,
    };
  }

  /**
   * Chạy `assets.cleanup` NGAY (không chờ cron mỗi giờ) — chỉ xếp job vào queue
   * `cron`, worker `assets.cleanup` (`asset.jobs.ts`) làm phần dọn thật.
   *
   * `jobId = assets.cleanup:manual:<yyyyMMddHH>` — đúng 2 dấu `:` (BullMQ chỉ chấp
   * nhận jobId tuỳ biến có `:` khi đúng 3 phần) và khác `schedulerId`
   * `assets.cleanup` của cron nên hai đường không giẫm nhau. Cùng giờ bấm lại →
   * BullMQ bỏ qua job trùng id; ta báo `alreadyQueued` thay vì im lặng và không
   * ghi audit (không có gì mới được thực hiện).
   */
  async requestCleanup(reason: string, actorId: string, actorRole?: string): Promise<StorageCleanupResult> {
    const jobId = `assets.cleanup:manual:${hourKey(new Date())}`;

    const existing = await getQueue("cron").getJob(jobId);
    if (existing) return { jobId, alreadyQueued: true };

    await enqueue("cron", "assets.cleanup", { trigger: "manual", requestedBy: actorId }, { jobId });

    await this.audit?.record({
      actorId,
      actorRole,
      action: "system.storage-cleanup",
      targetType: "QueueJob",
      targetId: `cron:${jobId}`,
      reason,
      metadata: { queue: "cron", jobName: "assets.cleanup", jobId },
    });
    return { jobId, alreadyQueued: false };
  }

  /**
   * Ứng viên `assets.cleanup` (be.md §5.7 — cùng điều kiện job thật dùng) mà
   * KHÔNG còn `AssetLink` nào. Quét tối đa `ORPHAN_SCAN_LIMIT` bản ghi — ước
   * lượng cho dashboard, không phải con số tuyệt đối khi vượt trần này.
   */
  private async getOrphanStats(baseWhere: Prisma.AssetWhereInput): Promise<{ count: number; bytes: number }> {
    const olderThan = new Date(Date.now() - env.ASSET_ORPHAN_TTL_HOURS * 3600_000);
    const candidates = await prisma.asset.findMany({
      where: {
        ...baseWhere,
        variant: "ORIGINAL",
        status: { in: ["UPLOADING", "PROCESSING", "READY", "REJECTED"] },
        OR: [
          { lastUnlinkedAt: { lt: olderThan } },
          { lastUnlinkedAt: { isSet: false }, createdAt: { lt: olderThan } },
        ],
      },
      select: { id: true, size: true, declaredSize: true },
      take: ORPHAN_SCAN_LIMIT,
    });
    if (candidates.length === 0) return { count: 0, bytes: 0 };

    const ids = candidates.map((c) => c.id);
    const linked = await prisma.assetLink.findMany({
      where: { assetId: { in: ids } },
      select: { assetId: true },
      distinct: ["assetId"],
    });
    const linkedIds = new Set(linked.map((l) => l.assetId));
    const trulyOrphan = candidates.filter((c) => !linkedIds.has(c.id));

    return {
      count: trulyOrphan.length,
      bytes: trulyOrphan.reduce((sum, c) => sum + (c.size ?? c.declaredSize), 0),
    };
  }
}
