import { prisma } from "../../../infrastructure/database";
import type { DecodedCursor, PollVoteEntity, PollVoterRef } from "../entities/chat-extensions.types";
import type { IPollVoteRepository } from "./poll-vote.repository.interface";
import type { TxHandle } from "./tx";

const db = (tx?: TxHandle) => tx ?? prisma;

const mapVote = (r: { id: string; pollId: string; userId: string; optionIds: string[]; createdAt: Date; updatedAt: Date }): PollVoteEntity => ({
  id: r.id,
  pollId: r.pollId,
  userId: r.userId,
  optionIds: r.optionIds,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class PrismaPollVoteRepository implements IPollVoteRepository {
  async find(pollId: string, userId: string, tx?: TxHandle): Promise<PollVoteEntity | null> {
    const r = await db(tx).pollVote.findUnique({ where: { pollId_userId: { pollId, userId } } });
    return r ? mapVote(r) : null;
  }

  async findMine(pollIds: string[], userId: string): Promise<Map<string, string[]>> {
    if (pollIds.length === 0) return new Map();
    const rows = await prisma.pollVote.findMany({ where: { pollId: { in: pollIds }, userId }, select: { pollId: true, optionIds: true } });
    return new Map(rows.map((r) => [r.pollId, r.optionIds]));
  }

  async upsert(pollId: string, userId: string, optionIds: string[], tx: TxHandle): Promise<PollVoteEntity> {
    const r = await tx.pollVote.upsert({
      where: { pollId_userId: { pollId, userId } },
      create: { pollId, userId, optionIds },
      update: { optionIds },
    });
    return mapVote(r);
  }

  async delete(pollId: string, userId: string, tx: TxHandle): Promise<boolean> {
    const result = await tx.pollVote.deleteMany({ where: { pollId, userId } });
    return result.count > 0;
  }

  async listVoters(pollId: string, optionId: string, cursor: DecodedCursor | null, limit: number): Promise<PollVoterRef[]> {
    const rows = await prisma.pollVote.findMany({
      where: {
        pollId,
        optionIds: { has: optionId },
        ...(cursor && { OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }] }),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, userId: true, updatedAt: true },
    });
    return rows.map((r) => ({ voteId: r.id, userId: r.userId, votedAt: r.updatedAt }));
  }

  async tally(pollId: string): Promise<{ counts: Map<string, number>; voters: number }> {
    const rows = await prisma.pollVote.findMany({ where: { pollId }, select: { optionIds: true } });
    const counts = new Map<string, number>();
    for (const r of rows) for (const id of r.optionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { counts, voters: rows.length };
  }

  async deleteByUser(userId: string): Promise<number> {
    const result = await prisma.pollVote.deleteMany({ where: { userId } });
    return result.count;
  }
}
