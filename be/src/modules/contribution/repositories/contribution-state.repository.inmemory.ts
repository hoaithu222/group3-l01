/* eslint-disable @typescript-eslint/require-await -- bản in-memory (test) cài đặt interface bất đồng bộ */
import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";
import type { BoardState } from "../entities/contribution.interface";
import type { IContributionStateRepository } from "./contribution-state.repository.interface";
import type { TxHandle } from "./tx";

const clone = (s: BoardState): BoardState => ({ ...s });

/** In-memory (test) — cùng ngữ nghĩa với bản Prisma. */
export class InMemoryContributionStateRepository implements IContributionStateRepository {
  readonly states = new Map<string, BoardState>();

  async get(boardId: string): Promise<BoardState | null> {
    const s = this.states.get(boardId);
    return s ? clone(s) : null;
  }

  async ensure(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<BoardState> {
    let s = this.states.get(boardId);
    if (!s) {
      s = {
        boardId,
        workspaceId,
        factsVersion: 0,
        computedVersion: 0,
        computedAt: null,
        configVersion: 0,
        configChangedAt: null,
        configChangedBy: null,
        previousWeights: null,
        defaultsSnapshot: { ...defaults, weights: { ...defaults.weights } },
        activityDirtyAt: null,
        activityRefreshedAt: null,
        snapshotTimezone: null,
        activityTimezone: null,
        updatedAt: new Date(),
      };
      this.states.set(boardId, s);
    }
    return clone(s);
  }

  async bumpFactsVersion(boardId: string, workspaceId: string, defaults: ContributionConfigValue): Promise<number> {
    await this.ensure(boardId, workspaceId, defaults);
    const s = this.states.get(boardId)!;
    s.factsVersion += 1;
    return s.factsVersion;
  }

  async markComputed(boardId: string, version: number, at: Date, timezone: string): Promise<void> {
    const s = this.states.get(boardId);
    if (s && s.computedVersion <= version) {
      s.computedVersion = version;
      s.computedAt = at;
      s.snapshotTimezone = timezone;
    }
  }

  async changeConfig(boardId: string, expectedVersion: number, patch: { at: Date; by: string; previousWeights: ContributionWeights }, _tx?: TxHandle): Promise<boolean> {
    const s = this.states.get(boardId);
    if (!s || s.configVersion !== expectedVersion) return false;
    s.configVersion += 1;
    s.configChangedAt = patch.at;
    s.configChangedBy = patch.by;
    s.previousWeights = { ...patch.previousWeights };
    return true;
  }

  async markActivityDirty(boardId: string, workspaceId: string, defaults: ContributionConfigValue, at: Date): Promise<void> {
    await this.ensure(boardId, workspaceId, defaults);
    this.states.get(boardId)!.activityDirtyAt = at;
  }

  async listDirty(limit: number): Promise<BoardState[]> {
    return [...this.states.values()]
      .filter((s) => s.activityDirtyAt !== null)
      .sort((a, b) => (a.activityDirtyAt as Date).getTime() - (b.activityDirtyAt as Date).getTime())
      .slice(0, limit)
      .map(clone);
  }

  async clearActivityDirty(boardId: string, seenAt: Date): Promise<void> {
    const s = this.states.get(boardId);
    if (s?.activityDirtyAt && s.activityDirtyAt <= seenAt) s.activityDirtyAt = null;
  }

  async setActivityRefreshed(boardId: string, at: Date, timezone?: string): Promise<void> {
    const s = this.states.get(boardId);
    if (!s) return;
    s.activityRefreshedAt = at;
    if (timezone !== undefined) s.activityTimezone = timezone;
  }

  async listByWorkspace(workspaceId: string): Promise<BoardState[]> {
    return [...this.states.values()].filter((s) => s.workspaceId === workspaceId).map(clone);
  }

  async listPage(afterBoardId: string | null, limit: number): Promise<BoardState[]> {
    return [...this.states.values()]
      .filter((s) => afterBoardId === null || s.boardId > afterBoardId)
      .sort((a, b) => (a.boardId < b.boardId ? -1 : a.boardId > b.boardId ? 1 : 0))
      .slice(0, limit)
      .map(clone);
  }
}
