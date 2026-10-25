import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { DiscoveryScopeType, SavedListParams, SavedMessageCreateInput, SavedMessageRecord } from "../entities/discovery.interface";
import type { ISavedMessageRepository } from "./saved-message.repository.interface";

type SavedRecord = NonNullable<Awaited<ReturnType<typeof prisma.savedMessage.findUnique>>>;

function mapSaved(r: SavedRecord): SavedMessageRecord {
  return {
    id: r.id,
    userId: r.userId,
    messageId: r.messageId,
    scopeType: r.scopeType as DiscoveryScopeType,
    scopeId: r.scopeId,
    workspaceId: r.workspaceId,
    threadId: r.threadId,
    createdAt: r.createdAt,
  };
}

export class PrismaSavedMessageRepository implements ISavedMessageRepository {
  async findByUserAndMessage(userId: string, messageId: string): Promise<SavedMessageRecord | null> {
    const r = await prisma.savedMessage.findUnique({ where: { userId_messageId: { userId, messageId } } });
    return r ? mapSaved(r) : null;
  }

  async create(input: SavedMessageCreateInput): Promise<{ record: SavedMessageRecord; created: boolean }> {
    try {
      const r = await prisma.savedMessage.create({
        data: {
          userId: input.userId,
          messageId: input.messageId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          workspaceId: input.workspaceId,
          threadId: input.threadId,
        },
      });
      return { record: mapSaved(r), created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.findByUserAndMessage(input.userId, input.messageId);
        if (existing) return { record: existing, created: false };
      }
      throw err;
    }
  }

  async delete(userId: string, messageId: string): Promise<boolean> {
    const result = await prisma.savedMessage.deleteMany({ where: { userId, messageId } });
    return result.count > 0;
  }

  async countByUser(userId: string): Promise<number> {
    return prisma.savedMessage.count({ where: { userId } });
  }

  async list(params: SavedListParams): Promise<SavedMessageRecord[]> {
    const and: Prisma.SavedMessageWhereInput[] = [{ userId: params.userId }];
    if (params.scopeType) and.push({ scopeType: params.scopeType });
    if (params.workspaceId) and.push({ workspaceId: params.workspaceId });
    if (params.before) {
      and.push({
        OR: [{ createdAt: { lt: params.before.at } }, { AND: [{ createdAt: params.before.at }, { id: { lt: params.before.id } }] }],
      });
    }
    const rows = await prisma.savedMessage.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit,
    });
    return rows.map(mapSaved);
  }

  async findSavedIds(userId: string, messageIds: readonly string[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await prisma.savedMessage.findMany({
      where: { userId, messageId: { in: [...messageIds] } },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  async deleteAllByUser(userId: string): Promise<number> {
    const result = await prisma.savedMessage.deleteMany({ where: { userId } });
    return result.count;
  }
}
