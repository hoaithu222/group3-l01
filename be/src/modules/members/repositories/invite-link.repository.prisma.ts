import { prisma } from "../../../infrastructure/database";
import { decodeCursor } from "../../../core/utils/cursor";
import type { IInviteLinkRepository, InviteLinkListParams } from "./invite-link.repository.interface";
import type { InviteLink } from "../entities/invite.interface";

type InviteLinkRecord = Awaited<ReturnType<typeof prisma.inviteLink.findFirstOrThrow>>;

function mapInviteLink(record: InviteLinkRecord): InviteLink {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    tokenHash: record.tokenHash,
    tokenPrefix: record.tokenPrefix,
    role: record.role,
    maxUses: record.maxUses,
    remainingUses: record.remainingUses,
    usesCount: record.usesCount,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    revokedBy: record.revokedBy,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}

export class PrismaInviteLinkRepository implements IInviteLinkRepository {
  async findByTokenHash(tokenHash: string): Promise<InviteLink | null> {
    const record = await prisma.inviteLink.findUnique({ where: { tokenHash } });
    return record ? mapInviteLink(record) : null;
  }

  async findById(id: string): Promise<InviteLink | null> {
    const record = await prisma.inviteLink.findUnique({ where: { id } });
    return record ? mapInviteLink(record) : null;
  }

  async countActive(workspaceId: string, now: Date): Promise<number> {
    return prisma.inviteLink.count({
      where: {
        workspaceId,
        OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
        expiresAt: { gt: now },
        remainingUses: { gt: 0 },
      },
    });
  }

  async listByWorkspace(
    workspaceId: string,
    params: InviteLinkListParams
  ): Promise<{ data: InviteLink[]; hasMore: boolean }> {
    const decoded = params.cursor ? decodeCursor(params.cursor) : null;
    const records = await prisma.inviteLink.findMany({
      where: {
        workspaceId,
        ...(decoded && {
          OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = records.length > params.limit;
    const page = hasMore ? records.slice(0, params.limit) : records;
    return { data: page.map(mapInviteLink), hasMore };
  }
}
