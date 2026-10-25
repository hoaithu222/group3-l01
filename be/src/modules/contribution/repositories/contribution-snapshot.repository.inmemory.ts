/* eslint-disable @typescript-eslint/require-await -- bản in-memory (test) cài đặt interface bất đồng bộ */
import type { ContributionSnapshotRow } from "../entities/contribution.interface";
import type { IContributionSnapshotRepository } from "./contribution-snapshot.repository.interface";

/** In-memory (test). */
export class InMemoryContributionSnapshotRepository implements IContributionSnapshotRepository {
  rows: ContributionSnapshotRow[] = [];

  async replaceForBoard(boardId: string, rows: readonly ContributionSnapshotRow[]): Promise<void> {
    this.rows = [...this.rows.filter((r) => r.boardId !== boardId), ...rows.map((r) => ({ ...r }))];
  }

  async listByPeriod(boardId: string, periodKey: string): Promise<ContributionSnapshotRow[]> {
    return this.rows.filter((r) => r.boardId === boardId && r.periodKey === periodKey);
  }

  async listAllPeriodByUser(userId: string): Promise<ContributionSnapshotRow[]> {
    return this.rows.filter((r) => r.userId === userId && r.periodKey === "ALL");
  }
}
