import { prisma } from "../../../infrastructure/database";
import type { IPinSupportRepository } from "./pin-support.repository.interface";

export class PrismaPinSupportRepository implements IPinSupportRepository {
  async findUserNames(userIds: string[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await prisma.messageHide.findMany({
      where: { userId, messageId: { in: messageIds } },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }
}
