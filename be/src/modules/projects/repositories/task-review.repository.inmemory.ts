import { newObjectId } from "../../../core/utils/object-id";
import {
  closedRoundKey,
  openRoundKey,
  roundActiveKey,
  type MyReviewRow,
  type ReviewCancelReason,
  type ReviewCreateInput,
  type ReviewProgress,
  type ReviewUpdate,
  type ReviewerLoad,
  type RoundCreateInput,
  type RoundUpdate,
  type TaskReview,
  type TaskReviewRound,
} from "../entities/task-review.interface";
import type { IReviewStatsRepository, ITaskReviewRepository, ITaskReviewRoundRepository, RawReviewStats } from "./task-review.repository.interface";

/** Kho dùng chung của ba repository in-memory (lượt, review, số liệu) — mô phỏng unique `activeKey`/`(taskId, round)`/`(roundId, reviewerId)`. */
export class InMemoryReviewStore {
  readonly rounds = new Map<string, TaskReviewRound>();
  readonly reviews = new Map<string, TaskReview>();
}

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cloneRound = (r: TaskReviewRound): TaskReviewRound => structuredClone(r);
const cloneReview = (r: TaskReview): TaskReview => structuredClone(r);

export class InMemoryTaskReviewRoundRepository implements ITaskReviewRoundRepository {
  constructor(private readonly store: InMemoryReviewStore = new InMemoryReviewStore()) {}

  async create(input: RoundCreateInput): Promise<TaskReviewRound> {
    const round: TaskReviewRound = {
      ...structuredClone(input),
      activeKey: roundActiveKey(input),
      waivedBy: null,
      waiveReason: null,
      version: 1,
    };
    for (const r of this.store.rounds.values()) {
      if (r.activeKey === round.activeKey) throw new Error(`P2002 activeKey trùng: ${round.activeKey}`);
      if (r.taskId === round.taskId && r.round === round.round) throw new Error(`P2002 (taskId, round) trùng: ${round.taskId}/${round.round}`);
    }
    this.store.rounds.set(round.id, round);
    return cloneRound(round);
  }

  async findById(id: string): Promise<TaskReviewRound | null> {
    const r = this.store.rounds.get(id);
    return r ? cloneRound(r) : null;
  }

  async findOpen(taskId: string): Promise<TaskReviewRound | null> {
    const key = openRoundKey(taskId);
    const r = [...this.store.rounds.values()].find((x) => x.activeKey === key);
    return r ? cloneRound(r) : null;
  }

  async findLatest(taskId: string): Promise<TaskReviewRound | null> {
    const rows = [...this.store.rounds.values()].filter((r) => r.taskId === taskId).sort((a, b) => b.round - a.round);
    return rows[0] ? cloneRound(rows[0]) : null;
  }

  async listByTask(taskId: string, limit: number): Promise<TaskReviewRound[]> {
    return [...this.store.rounds.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => b.round - a.round)
      .slice(0, limit)
      .map(cloneRound);
  }

  async listOpenByBoard(boardId: string, afterId: string | null, limit: number): Promise<TaskReviewRound[]> {
    return [...this.store.rounds.values()]
      .filter((r) => r.boardId === boardId && r.status === "OPEN" && (afterId === null || r.id > afterId))
      .sort(byId)
      .slice(0, limit)
      .map(cloneRound);
  }

  async countOpenByBoard(boardId: string): Promise<number> {
    return [...this.store.rounds.values()].filter((r) => r.boardId === boardId && r.status === "OPEN").length;
  }

  async progressOf(taskIds: string[]): Promise<Map<string, ReviewProgress>> {
    const out = new Map<string, ReviewProgress>();
    for (const r of this.store.rounds.values()) {
      if (r.status === "OPEN" && taskIds.includes(r.taskId)) out.set(r.taskId, { approvedCount: r.approvedCount, requiredReviews: r.requiredReviews });
    }
    return out;
  }

  async updateCas(id: string, expectedVersion: number, set: RoundUpdate): Promise<TaskReviewRound | null> {
    const r = this.store.rounds.get(id);
    if (!r || r.version !== expectedVersion) return null;
    const defined = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
    Object.assign(r, defined, { version: r.version + 1 });
    if (set.status !== undefined && set.status !== "OPEN") r.activeKey = closedRoundKey(id);
    return cloneRound(r);
  }

  async listOpenPage(afterId: string | null, limit: number): Promise<TaskReviewRound[]> {
    return [...this.store.rounds.values()]
      .filter((r) => r.status === "OPEN" && (afterId === null || r.id > afterId))
      .sort(byId)
      .slice(0, limit)
      .map(cloneRound);
  }
}

export class InMemoryTaskReviewRepository implements ITaskReviewRepository {
  /** Đồng hồ `assignedAt` mặc định của bản ghi thiếu (test có thể tiêm). */
  now: () => Date = () => new Date();

  constructor(private readonly store: InMemoryReviewStore = new InMemoryReviewStore()) {}

  async createMany(inputs: ReviewCreateInput[]): Promise<TaskReview[]> {
    const out: TaskReview[] = [];
    for (const input of inputs) {
      for (const r of this.store.reviews.values()) {
        if (r.roundId === input.roundId && r.reviewerId === input.reviewerId) throw new Error(`P2002 (roundId, reviewerId) trùng: ${input.roundId}/${input.reviewerId}`);
      }
      const review: TaskReview = {
        id: newObjectId(),
        roundId: input.roundId,
        taskId: input.taskId,
        boardId: input.boardId,
        workspaceId: input.workspaceId,
        reviewerId: input.reviewerId,
        status: "PENDING",
        assignedBy: input.assignedBy,
        assignedAt: input.assignedAt ?? this.now(),
        submittedAt: null,
        score10: null,
        rubricScores: [],
        feedback: null,
        cancelReason: null,
        replacedById: null,
        version: 1,
      };
      this.store.reviews.set(review.id, review);
      out.push(cloneReview(review));
    }
    return out;
  }

  async findById(id: string): Promise<TaskReview | null> {
    const r = this.store.reviews.get(id);
    return r ? cloneReview(r) : null;
  }

  async listByRound(roundId: string): Promise<TaskReview[]> {
    return this.sorted([...this.store.reviews.values()].filter((r) => r.roundId === roundId)).map(cloneReview);
  }

  async listByRounds(roundIds: string[]): Promise<TaskReview[]> {
    return this.sorted([...this.store.reviews.values()].filter((r) => roundIds.includes(r.roundId))).map(cloneReview);
  }

  async updatePendingCas(id: string, expectedVersion: number, set: ReviewUpdate): Promise<TaskReview | null> {
    const r = this.store.reviews.get(id);
    if (!r || r.version !== expectedVersion || r.status !== "PENDING") return null;
    const defined = Object.fromEntries(Object.entries(structuredClone(set)).filter(([, v]) => v !== undefined));
    Object.assign(r, defined, { version: r.version + 1 });
    return cloneReview(r);
  }

  async cancelPendingOfRound(roundId: string, reason: ReviewCancelReason): Promise<TaskReview[]> {
    const out: TaskReview[] = [];
    for (const r of this.store.reviews.values()) {
      if (r.roundId !== roundId || r.status !== "PENDING") continue;
      Object.assign(r, { status: "CANCELLED", cancelReason: reason, version: r.version + 1 });
      out.push(cloneReview(r));
    }
    return out;
  }

  async loadsOf(workspaceId: string, userIds: string[]): Promise<Map<string, ReviewerLoad>> {
    const loads = new Map<string, ReviewerLoad>();
    for (const r of this.store.reviews.values()) {
      if (r.workspaceId !== workspaceId || !userIds.includes(r.reviewerId)) continue;
      const load = loads.get(r.reviewerId) ?? { userId: r.reviewerId, pending: 0, lastAssignedAt: null };
      if (r.status === "PENDING") load.pending += 1;
      if (!load.lastAssignedAt || r.assignedAt > load.lastAssignedAt) load.lastAssignedAt = r.assignedAt;
      loads.set(r.reviewerId, load);
    }
    return loads;
  }

  async listPendingOf(userIds: string[], workspaceId: string | null, limit: number): Promise<TaskReview[]> {
    return this.sorted(
      [...this.store.reviews.values()].filter((r) => r.status === "PENDING" && userIds.includes(r.reviewerId) && (workspaceId === null || r.workspaceId === workspaceId))
    )
      .slice(0, limit)
      .map(cloneReview);
  }

  async listPendingPage(afterId: string | null, limit: number): Promise<TaskReview[]> {
    return [...this.store.reviews.values()]
      .filter((r) => r.status === "PENDING" && (afterId === null || r.id > afterId))
      .sort(byId)
      .slice(0, limit)
      .map(cloneReview);
  }

  async listMine(userId: string, kind: "PENDING" | "SUBMITTED", cursor: { at: Date; id: string } | null, limit: number): Promise<MyReviewRow[]> {
    const at = (r: TaskReview): Date => (kind === "PENDING" ? r.assignedAt : (r.submittedAt as Date));
    const rows = [...this.store.reviews.values()]
      .filter((r) => r.reviewerId === userId && (kind === "PENDING" ? r.status === "PENDING" : (r.status === "APPROVED" || r.status === "REQUEST_CHANGES") && r.submittedAt !== null))
      .filter((r) => !cursor || at(r) < cursor.at || (at(r).getTime() === cursor.at.getTime() && r.id < cursor.id))
      .sort((a, b) => at(b).getTime() - at(a).getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, limit);
    return rows.flatMap((review) => {
      const round = this.store.rounds.get(review.roundId);
      return round ? [{ review: cloneReview(review), round: cloneRound(round) }] : [];
    });
  }

  private sorted(rows: TaskReview[]): TaskReview[] {
    return rows.sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime() || byId(a, b));
  }
}

export class InMemoryReviewStatsRepository implements IReviewStatsRepository {
  constructor(private readonly store: InMemoryReviewStore) {}

  async forWorkspace(workspaceId: string, since: Date, overdueBefore: Date, sampleMax: number): Promise<RawReviewStats> {
    const rounds = [...this.store.rounds.values()].filter((r) => r.workspaceId === workspaceId);
    const reviews = [...this.store.reviews.values()].filter((r) => r.workspaceId === workspaceId);
    const period = rounds.filter((r) => r.openedAt >= since);
    const openRoundsByBoard = new Map<string, number>();
    for (const r of rounds) if (r.status === "OPEN") openRoundsByBoard.set(r.boardId, (openRoundsByBoard.get(r.boardId) ?? 0) + 1);
    return {
      openRounds: rounds.filter((r) => r.status === "OPEN").length,
      pendingReviews: reviews.filter((r) => r.status === "PENDING").length,
      overdue: reviews.filter((r) => r.status === "PENDING" && r.assignedAt < overdueBefore).length,
      roundsInPeriod: period.length,
      autoApprovedRounds: period.filter((r) => r.autoApproved).length,
      waivedRounds: period.filter((r) => r.status === "WAIVED").length,
      submitDurations: reviews
        .filter((r) => (r.status === "APPROVED" || r.status === "REQUEST_CHANGES") && r.submittedAt !== null && r.submittedAt >= since)
        .sort((a, b) => (b.submittedAt as Date).getTime() - (a.submittedAt as Date).getTime())
        .slice(0, sampleMax)
        .map((r) => ({ assignedAt: r.assignedAt, submittedAt: r.submittedAt as Date })),
      openRoundsByBoard,
    };
  }
}
