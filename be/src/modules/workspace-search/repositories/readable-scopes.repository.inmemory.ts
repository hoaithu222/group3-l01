import type { ReadableChannel, ReadableConversation } from "../entities/search.interface";
import type { IReadableScopesRepository } from "./readable-scopes.repository.interface";

interface ChannelSeed extends ReadableChannel {
  workspaceId: string;
}
interface GroupSeed extends ReadableConversation {
  workspaceId: string;
  memberIds: string[];
}
interface DirectSeed extends ReadableConversation {
  /** Hai người của hội thoại 1-1. */
  memberIds: [string, string];
}
interface GrantSeed {
  workspaceId: string;
  channelId: string;
  userId: string | null;
  source: "DIRECT" | "ROLE";
  roleRef?: string;
}
interface MembershipSeed {
  workspaceId: string;
  userId: string;
  role: string;
  active: boolean;
}

/** Repository in-memory cho unit test `ReadableScopesService` (cùng ngữ nghĩa bản Prisma). */
export class InMemoryReadableScopesRepository implements IReadableScopesRepository {
  channels: ChannelSeed[] = [];
  grants: GrantSeed[] = [];
  channelMemberships: { workspaceId: string; channelId: string; userId: string }[] = [];
  groups: GroupSeed[] = [];
  directs: DirectSeed[] = [];
  memberships: MembershipSeed[] = [];

  async listChannels(workspaceId: string, ids?: readonly string[]): Promise<ReadableChannel[]> {
    return this.channels.filter((c) => c.workspaceId === workspaceId && (!ids || ids.includes(c.id)));
  }

  async grantedChannelIds(workspaceId: string, userId: string, coveringRoles: readonly string[]): Promise<Set<string>> {
    const hit = this.grants.filter(
      (g) =>
        g.workspaceId === workspaceId &&
        ((g.source === "DIRECT" && g.userId === userId) || (g.source === "ROLE" && !!g.roleRef && coveringRoles.includes(g.roleRef)))
    );
    return new Set(hit.map((g) => g.channelId));
  }

  async joinedChannelIds(workspaceId: string, userId: string): Promise<Set<string>> {
    return new Set(this.channelMemberships.filter((m) => m.workspaceId === workspaceId && m.userId === userId).map((m) => m.channelId));
  }

  async listGroupConversations(workspaceId: string, userId: string, ids?: readonly string[]): Promise<ReadableConversation[]> {
    return this.groups.filter((g) => g.workspaceId === workspaceId && g.memberIds.includes(userId) && (!ids || ids.includes(g.id)));
  }

  async listDirectConversations(userId: string, ids?: readonly string[]): Promise<ReadableConversation[]> {
    return this.directs
      .filter((d) => d.memberIds.includes(userId) && (!ids || ids.includes(d.id)))
      .map((d) => ({ ...d, peerUserId: d.memberIds[0] === userId ? d.memberIds[1] : d.memberIds[0] }));
  }

  async activeMemberIds(workspaceId: string, userIds: readonly string[]): Promise<Set<string>> {
    return new Set(
      this.memberships.filter((m) => m.workspaceId === workspaceId && m.active && userIds.includes(m.userId)).map((m) => m.userId)
    );
  }
}
