import { prisma } from "../../../infrastructure/database";
import { enqueue } from "../../../infrastructure/queue";
import type { AuditService } from "../../audit-log/audit-log.service";
import { PLAGIARISM_ALGO_VERSION } from "../lib/constants";
import { fingerprintJobId, PLAGIARISM_FINGERPRINT_JOB, PLAGIARISM_FINGERPRINT_QUEUE } from "./fingerprint-index.service";
import type { IFingerprintRepository } from "../repositories/fingerprint.repository";

export interface PlagiarismOverviewDto {
  scans: { total: number; completed: number; failed: number; cancelled: number };
  p95DurationSec: number | null;
  fingerprints: { byStatus: Record<string, number> };
  levelDistribution: Record<string, number>;
  topWorkspaces: Array<{ workspaceId: string; name: string; scans: number }>;
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const REINDEX_BATCH = 500;
export const PLAGIARISM_REINDEX_JOB = "plagiarism.reindex";

/**
 * Thống kê tổng hợp + lập chỉ mục lại (be.md §5.5, admin.md). KHÔNG BAO GIỜ trả `resourceId`/tên tệp/điểm theo tệp —
 * mọi truy vấn ở đây CHỈ đếm/gộp, không `select` trường nội dung của workspace.
 */
export class AdminPlagiarismService {
  constructor(
    private readonly d: {
      fingerprints: IFingerprintRepository;
      audit: AuditService;
      now?: () => Date;
    }
  ) {}

  async overview(range: "7d" | "30d" | "90d"): Promise<PlagiarismOverviewDto> {
    const since = new Date((this.d.now?.() ?? new Date()).getTime() - RANGE_DAYS[range] * 86_400_000);
    const [total, completed, failed, cancelled, timedScans, fpByStatus, levelGroups, topWorkspacesRaw] = await Promise.all([
      prisma.plagiarismScan.count({ where: { createdAt: { gte: since } } }),
      prisma.plagiarismScan.count({ where: { createdAt: { gte: since }, status: "COMPLETED" } }),
      prisma.plagiarismScan.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
      prisma.plagiarismScan.count({ where: { createdAt: { gte: since }, status: "CANCELLED" } }),
      prisma.plagiarismScan.findMany({
        where: { createdAt: { gte: since }, status: "COMPLETED", startedAt: { not: null }, finishedAt: { not: null } },
        select: { startedAt: true, finishedAt: true },
      }),
      prisma.documentFingerprint.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plagiarismResult.groupBy({ by: ["level"], where: { createdAt: { gte: since }, status: "OK" }, _count: { _all: true } }),
      prisma.plagiarismScan.groupBy({ by: ["workspaceId"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { workspaceId: "desc" } }, take: 5 }),
    ]);

    const durations = timedScans
      .map((s) => ((s.finishedAt as Date).getTime() - (s.startedAt as Date).getTime()) / 1000)
      .sort((a, b) => a - b);
    const p95 = durations.length > 0 ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] : null;

    const workspaceIds = topWorkspacesRaw.map((w) => w.workspaceId);
    const workspaces = workspaceIds.length > 0 ? await prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(workspaces.map((w) => [w.id, w.name]));

    return {
      scans: { total, completed, failed, cancelled },
      p95DurationSec: p95,
      fingerprints: { byStatus: Object.fromEntries(fpByStatus.map((g) => [g.status, g._count._all])) },
      levelDistribution: Object.fromEntries(levelGroups.map((g) => [g.level ?? "NONE", g._count._all])),
      topWorkspaces: topWorkspacesRaw.map((w) => ({ workspaceId: w.workspaceId, name: nameById.get(w.workspaceId) ?? "?", scans: w._count._all })),
    };
  }

  /**
   * Đếm nhanh số tệp khớp điều kiện reindex rồi xếp MỘT job nền `plagiarism.reindex` (be.md §5.5, §7) làm việc nặng
   * (đặt lại `PENDING` theo lô + xếp `plagiarism.fingerprint` cho từng tệp) — tránh chặn request admin nếu workspace có
   * hàng chục nghìn tệp. `algoVersionLessThan: ALGO_VERSION + 1` = MỌI bản ghi (kể cả đúng phiên bản hiện hành) — admin
   * chủ động lập chỉ mục lại, không chỉ khi thuật toán đổi phiên bản.
   */
  async reindex(input: { workspaceId?: string; reason: string }, actor: { id: string; role?: string }): Promise<number> {
    const filter = { workspaceId: input.workspaceId, algoVersionLessThan: PLAGIARISM_ALGO_VERSION + 1 };
    const queued = await this.d.fingerprints.countForReindex(filter);
    await enqueue(PLAGIARISM_FINGERPRINT_QUEUE, PLAGIARISM_REINDEX_JOB, filter, {
      jobId: `plagiarism.reindex:ws:${input.workspaceId ?? "all"}:a${PLAGIARISM_ALGO_VERSION}:t${Date.now()}`.replace(/:/g, "_"),
    });
    await this.d.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "plagiarism.reindex",
      targetType: "DocumentFingerprint",
      targetId: input.workspaceId ?? "ALL",
      reason: input.reason,
      metadata: { queued, workspaceId: input.workspaceId ?? null },
    });
    return queued;
  }
}

/** Việc nặng thật của reindex (be.md job `plagiarism.reindex`) — gọi từ `jobs/plagiarism-reindex.job.ts`. */
export async function runReindexBatches(fingerprints: IFingerprintRepository, filter: { workspaceId?: string; algoVersionLessThan: number }): Promise<number> {
  let queued = 0;
  for (;;) {
    const rows = await fingerprints.resetForReindex(filter, REINDEX_BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      await enqueue(
        PLAGIARISM_FINGERPRINT_QUEUE,
        PLAGIARISM_FINGERPRINT_JOB,
        { resourceId: row.resourceId, resourceVersion: row.resourceVersion },
        { jobId: `${fingerprintJobId(row.resourceId, row.resourceVersion)}_reindex${Date.now()}_${queued}` }
      );
      queued += 1;
    }
    if (rows.length < REINDEX_BATCH) break;
  }
  return queued;
}
