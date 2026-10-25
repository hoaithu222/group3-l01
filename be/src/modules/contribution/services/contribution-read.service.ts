import type { ContributionCareerScore, ContributionMemberScore, ContributionReadPort } from "../../../shared/ports/contribution-read.port";
import type { ContributionSnapshotRow } from "../entities/contribution.interface";
import type { IContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.interface";

const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
const x10 = (v: number): number => Math.round(v * 10);

/** Chỉ tính bảng mà người này THỰC SỰ có thẻ hoàn thành (một người chưa làm gì ở bảng đó không kéo điểm hồ sơ xuống). */
const contributing = (rows: readonly ContributionSnapshotRow[]): ContributionSnapshotRow[] => rows.filter((r) => r.tasksDone > 0);

function scoreOfWorkspace(rows: readonly ContributionSnapshotRow[]): ContributionMemberScore | null {
  const used = contributing(rows);
  if (used.length === 0) return null;
  return { scoreX10: x10(mean(used.map((r) => r.score))), shareX10: x10(mean(used.map((r) => r.share))), boards: used.length };
}

/**
 * Cài đặt `ContributionReadPort` (đồng bộ chéo #11) trên snapshot `ALL`. `careerScore` = trung bình các nhóm (mỗi nhóm là trung bình các bảng), nên một nhóm
 * có nhiều bảng không lấn át nhóm khác.
 */
export class ContributionReadService implements ContributionReadPort {
  constructor(private readonly snapshots: IContributionSnapshotRepository) {}

  async memberScore(workspaceId: string, userId: string): Promise<ContributionMemberScore | null> {
    const rows = (await this.snapshots.listAllPeriodByUser(userId)).filter((r) => r.workspaceId === workspaceId);
    return scoreOfWorkspace(rows);
  }

  async careerScore(userId: string): Promise<ContributionCareerScore | null> {
    const byWorkspace = new Map<string, ContributionSnapshotRow[]>();
    for (const row of await this.snapshots.listAllPeriodByUser(userId)) byWorkspace.set(row.workspaceId, [...(byWorkspace.get(row.workspaceId) ?? []), row]);
    const scores = [...byWorkspace.values()].flatMap((rows) => scoreOfWorkspace(rows) ?? []);
    if (scores.length === 0) return null;
    return { pctX10: Math.round(mean(scores.map((s) => s.scoreX10))), workspaces: scores.length };
  }
}
