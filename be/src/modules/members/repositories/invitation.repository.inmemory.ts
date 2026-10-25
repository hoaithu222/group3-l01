import type {
  ChannelBrief,
  IInvitationRepository,
  InvitationListParams,
  UserBrief,
  WorkspaceBrief,
} from "./invitation.repository.interface";
import type { InvitationStatusValue, WorkspaceInvitation } from "../entities/invitation.interface";

/** Chỉ dùng trong unit test — trả cùng thứ tự `createdAt desc, id desc` như bản Prisma (bỏ qua cursor). */
export class InMemoryInvitationRepository implements IInvitationRepository {
  invitations = new Map<string, WorkspaceInvitation>();
  workspaces = new Map<string, WorkspaceBrief>();
  users = new Map<string, UserBrief>();
  activeGuests = new Map<string, number>();

  async findWorkspace(workspaceId: string): Promise<WorkspaceBrief | null> {
    return this.workspaces.get(workspaceId) ?? null;
  }

  async findUserById(userId: string): Promise<UserBrief | null> {
    return this.users.get(userId) ?? null;
  }

  async findUsersByEmails(emails: string[]): Promise<UserBrief[]> {
    return [...this.users.values()].filter((u) => emails.includes(u.email));
  }

  async countActiveGuests(workspaceId: string): Promise<number> {
    return this.activeGuests.get(workspaceId) ?? 0;
  }

  async countPendingGuestInvitations(workspaceId: string, now: Date): Promise<number> {
    return [...this.invitations.values()].filter(
      (i) => i.workspaceId === workspaceId && i.role === "GUEST" && i.status === "PENDING" && i.expiresAt > now
    ).length;
  }

  /** `workspaceId → kênh` — dùng cho `listChannels`. */
  channels: Array<ChannelBrief & { workspaceId: string }> = [];

  async listChannels(workspaceId: string, channelIds: string[]): Promise<ChannelBrief[]> {
    return this.channels.filter((c) => c.workspaceId === workspaceId && channelIds.includes(c.id));
  }

  seed(invitation: WorkspaceInvitation): void {
    this.invitations.set(invitation.id, invitation);
  }

  async findById(id: string): Promise<WorkspaceInvitation | null> {
    return this.invitations.get(id) ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<WorkspaceInvitation | null> {
    return [...this.invitations.values()].find((i) => i.tokenHash === tokenHash) ?? null;
  }

  async listByWorkspace(
    workspaceId: string,
    params: InvitationListParams
  ): Promise<{ data: WorkspaceInvitation[]; hasMore: boolean }> {
    const rows = [...this.invitations.values()]
      .filter((i) => i.workspaceId === workspaceId && (!params.status || i.status === params.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return { data: rows.slice(0, params.limit), hasMore: rows.length > params.limit };
  }

  async listAllByWorkspace(workspaceId: string, status?: InvitationStatusValue): Promise<WorkspaceInvitation[]> {
    return [...this.invitations.values()]
      .filter((i) => i.workspaceId === workspaceId && (!status || i.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listPendingByEmail(normalizedEmail: string, now: Date): Promise<WorkspaceInvitation[]> {
    return [...this.invitations.values()].filter(
      (i) => i.normalizedEmail === normalizedEmail && i.status === "PENDING" && i.expiresAt > now
    );
  }

  async countCreatedSince(workspaceId: string, since: Date): Promise<number> {
    return [...this.invitations.values()].filter((i) => i.workspaceId === workspaceId && i.createdAt >= since).length;
  }

  async findPendingFor(workspaceId: string, normalizedEmail: string): Promise<WorkspaceInvitation | null> {
    return (
      [...this.invitations.values()].find(
        (i) => i.workspaceId === workspaceId && i.normalizedEmail === normalizedEmail && i.status === "PENDING"
      ) ?? null
    );
  }
}
