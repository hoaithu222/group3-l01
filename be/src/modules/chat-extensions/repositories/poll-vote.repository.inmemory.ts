import { newObjectId } from "../../../core/utils/object-id";
import type { DecodedCursor, PollVoteEntity, PollVoterRef } from "../entities/chat-extensions.types";
import type { IPollVoteRepository } from "./poll-vote.repository.interface";
import type { TxHandle } from "./tx";

/** In-memory: giữ ràng buộc `(pollId, userId)` duy nhất bằng khoá Map — đúng ý nghĩa `@@unique` của bản Prisma. */
export class InMemoryPollVoteRepository implements IPollVoteRepository {
  private readonly rows = new Map<string, PollVoteEntity>();
  /** Thứ tự thời gian của test (mỗi lần ghi tăng 1 ms) để `listVoters` ổn định mà không phụ thuộc đồng hồ thật. */
  private tick = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private key(pollId: string, userId: string): string {
    return `${pollId}:${userId}`;
  }

  private now(): Date {
    this.tick += 1;
    return new Date(this.clock().getTime() + this.tick);
  }

  async find(pollId: string, userId: string, _tx?: TxHandle): Promise<PollVoteEntity | null> {
    const v = this.rows.get(this.key(pollId, userId));
    return v ? { ...v, optionIds: [...v.optionIds] } : null;
  }

  async findMine(pollIds: string[], userId: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const pollId of pollIds) {
      const v = this.rows.get(this.key(pollId, userId));
      if (v) out.set(pollId, [...v.optionIds]);
    }
    return out;
  }

  async upsert(pollId: string, userId: string, optionIds: string[], _tx: TxHandle): Promise<PollVoteEntity> {
    const key = this.key(pollId, userId);
    const at = this.now();
    const existing = this.rows.get(key);
    const vote: PollVoteEntity = existing
      ? { ...existing, optionIds: [...optionIds], updatedAt: at }
      : { id: newObjectId(), pollId, userId, optionIds: [...optionIds], createdAt: at, updatedAt: at };
    this.rows.set(key, vote);
    return { ...vote, optionIds: [...vote.optionIds] };
  }

  async delete(pollId: string, userId: string, _tx: TxHandle): Promise<boolean> {
    return this.rows.delete(this.key(pollId, userId));
  }

  async listVoters(pollId: string, optionId: string, cursor: DecodedCursor | null, limit: number): Promise<PollVoterRef[]> {
    return [...this.rows.values()]
      .filter((v) => v.pollId === pollId && v.optionIds.includes(optionId))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : -1))
      .filter((v) => !cursor || v.updatedAt.getTime() < cursor.at.getTime() || (v.updatedAt.getTime() === cursor.at.getTime() && v.id < cursor.id))
      .slice(0, limit)
      .map((v) => ({ voteId: v.id, userId: v.userId, votedAt: v.updatedAt }));
  }

  async tally(pollId: string): Promise<{ counts: Map<string, number>; voters: number }> {
    const counts = new Map<string, number>();
    let voters = 0;
    for (const v of this.rows.values()) {
      if (v.pollId !== pollId) continue;
      voters += 1;
      for (const id of v.optionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return { counts, voters };
  }

  async deleteByUser(userId: string): Promise<number> {
    let removed = 0;
    for (const [key, v] of this.rows) {
      if (v.userId === userId) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
