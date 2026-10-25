import type { IInviteLinkRepository, InviteLinkListParams } from "./invite-link.repository.interface";
import type { InviteLink } from "../entities/invite.interface";

export class InMemoryInviteLinkRepository implements IInviteLinkRepository {
  links = new Map<string, InviteLink>();

  seed(link: InviteLink): void {
    this.links.set(link.id, link);
  }

  async findByTokenHash(tokenHash: string): Promise<InviteLink | null> {
    return [...this.links.values()].find((l) => l.tokenHash === tokenHash) ?? null;
  }

  async findById(id: string): Promise<InviteLink | null> {
    return this.links.get(id) ?? null;
  }

  async countActive(workspaceId: string, now: Date): Promise<number> {
    return [...this.links.values()].filter(
      (l) => l.workspaceId === workspaceId && !l.revokedAt && l.expiresAt > now && l.remainingUses > 0
    ).length;
  }

  async listByWorkspace(workspaceId: string, params: InviteLinkListParams): Promise<{ data: InviteLink[]; hasMore: boolean }> {
    const all = [...this.links.values()]
      .filter((l) => l.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const data = all.slice(0, params.limit);
    return { data, hasMore: all.length > params.limit };
  }
}
