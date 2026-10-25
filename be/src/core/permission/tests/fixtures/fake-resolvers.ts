/**
 * Resolver GIẢ dùng riêng cho test `core/permission` (be.md §10) — mô phỏng
 * hành vi resolver thật (Phase 1 điền: p1-02/p1-03/p1-05/p2-01/p2-04) mà
 * KHÔNG đụng Prisma/DB. KHÔNG export ra runtime — chỉ sống trong `tests/`.
 */
import type { AuthUser } from "../../../types/express";
import type { ScopeRef, ScopeResolver, ResolvedAccess, ResolveContext } from "../../scope.types";
import type { Action } from "../../actions";

function access(visible: boolean, role: string | null, actions: readonly Action[], parent?: ScopeRef): ResolvedAccess {
  return { visible, role, actions: new Set(actions), parent };
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE — role → tập action (be.md README §6: OWNER > ADMIN > MEMBER > GUEST)
// ─────────────────────────────────────────────────────────────────────────────

export type FakeWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

const WORKSPACE_ACTIONS: Record<FakeWorkspaceRole, Action[]> = {
  GUEST: ["workspace.read"],
  MEMBER: [
    "workspace.read",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
  ],
  ADMIN: [
    "workspace.read",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
    "workspace.update",
    "workspace.member.list",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.member.ban",
    "workspace.member.role",
  ],
  OWNER: [
    "workspace.read",
    "workspace.channel.create",
    "workspace.conversation.create",
    "workspace.meeting.create",
    "workspace.update",
    "workspace.member.list",
    "workspace.member.invite",
    "workspace.member.remove",
    "workspace.member.ban",
    "workspace.member.role",
    "workspace.archive",
    "workspace.transfer",
  ],
};

export class FakeWorkspaceResolver implements ScopeResolver {
  readonly type = "WORKSPACE" as const;
  /** `{ [wsId]: { [userId]: role } }` */
  members = new Map<string, Map<string, FakeWorkspaceRole>>();
  /** `{ [wsId]: ScopeRef[] }` — scope con để test cascade (ACL-07). */
  childScopes = new Map<string, ScopeRef[]>();

  async resolve(user: AuthUser, scopeId: string, _ctx: ResolveContext): Promise<ResolvedAccess> {
    const role = this.members.get(scopeId)?.get(user.id);
    if (!role) return access(false, null, []);
    return access(true, role, WORKSPACE_ACTIONS[role]);
  }

  async children(scopeId: string): Promise<ScopeRef[]> {
    return this.childScopes.get(scopeId) ?? [];
  }

  roomsFor(scopeId: string): string[] {
    return [`ws:${scopeId}`];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANNEL — visibility (PUBLIC đọc được nếu là thành viên workspace) + grant
// ─────────────────────────────────────────────────────────────────────────────

export type FakeChannelLevel = "MANAGER" | "MEMBER";

const CHANNEL_ACTIONS: Record<FakeChannelLevel, Action[]> = {
  MEMBER: ["channel.read", "channel.join", "channel.message.send", "channel.message.react"],
  MANAGER: [
    "channel.read",
    "channel.join",
    "channel.message.send",
    "channel.message.react",
    "channel.message.pin",
    "channel.message.moderate",
    "channel.manage",
    "channel.grant.manage",
  ],
};

/** Chỉ đọc — visitor kênh PUBLIC chưa có grant (theo workspace member, chưa join). */
const CHANNEL_VISITOR_ACTIONS: Action[] = ["channel.read", "channel.join"];

export interface FakeChannelData {
  workspaceId: string;
  visibility: "PUBLIC" | "PRIVATE";
  grants: Map<string, FakeChannelLevel>;
}

export class FakeChannelResolver implements ScopeResolver {
  readonly type = "CHANNEL" as const;
  channels = new Map<string, FakeChannelData>();

  async resolve(user: AuthUser, scopeId: string, ctx: ResolveContext): Promise<ResolvedAccess> {
    const channel = this.channels.get(scopeId);
    if (!channel) return access(false, null, []);

    const grant = channel.grants.get(user.id);
    const parent: ScopeRef = { type: "WORKSPACE", id: channel.workspaceId };

    if (grant) {
      return access(true, grant, CHANNEL_ACTIONS[grant], parent);
    }
    if (channel.visibility === "PUBLIC") {
      // Công khai trong workspace — thấy được nếu là thành viên workspace (đệ quy qua ctx.resolve).
      const wsAccess = await ctx.resolve(user, parent);
      if (wsAccess.visible) return access(true, null, CHANNEL_VISITOR_ACTIONS, parent);
    }
    return access(false, null, []);
  }

  roomsFor(scopeId: string): string[] {
    return [`ch:${scopeId}`];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION — DIRECT/GROUP, role OWNER/ADMIN/MEMBER (be.md README §6)
// ─────────────────────────────────────────────────────────────────────────────

export type FakeConversationRole = "OWNER" | "ADMIN" | "MEMBER";

const CONVERSATION_ACTIONS: Record<FakeConversationRole, Action[]> = {
  MEMBER: ["conversation.read", "conversation.message.send", "conversation.leave"],
  ADMIN: [
    "conversation.read",
    "conversation.message.send",
    "conversation.leave",
    "conversation.member.add",
    "conversation.member.remove",
  ],
  OWNER: [
    "conversation.read",
    "conversation.message.send",
    "conversation.leave",
    "conversation.member.add",
    "conversation.member.remove",
    "conversation.member.role",
    "conversation.transfer",
    "conversation.dissolve",
  ],
};

export interface FakeConversationData {
  kind: "DIRECT" | "GROUP";
  members: Map<string, FakeConversationRole>;
}

export class FakeConversationResolver implements ScopeResolver {
  readonly type = "CONVERSATION" as const;
  conversations = new Map<string, FakeConversationData>();

  async resolve(user: AuthUser, scopeId: string, _ctx: ResolveContext): Promise<ResolvedAccess> {
    const conv = this.conversations.get(scopeId);
    const role = conv?.members.get(user.id);
    if (!conv || !role) return access(false, null, []);
    return access(true, role, CONVERSATION_ACTIONS[role]);
  }

  roomsFor(scopeId: string): string[] {
    return [`conv:${scopeId}`];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEETING — HOST/COHOST/ATTENDEE
// ─────────────────────────────────────────────────────────────────────────────

export type FakeMeetingRole = "HOST" | "COHOST" | "ATTENDEE";

const MEETING_ACTIONS: Record<FakeMeetingRole, Action[]> = {
  ATTENDEE: ["meeting.read", "meeting.join"],
  COHOST: ["meeting.read", "meeting.join", "meeting.invite", "meeting.lobby.admit", "meeting.record"],
  HOST: [
    "meeting.read",
    "meeting.join",
    "meeting.invite",
    "meeting.lobby.admit",
    "meeting.record",
    "meeting.edit",
    "meeting.cancel",
    "meeting.delete",
    "meeting.start",
    "meeting.end",
    "meeting.attendee.remove",
  ],
};

export interface FakeMeetingData {
  workspaceId: string;
  attendees: Map<string, FakeMeetingRole>;
}

export class FakeMeetingResolver implements ScopeResolver {
  readonly type = "MEETING" as const;
  meetings = new Map<string, FakeMeetingData>();

  async resolve(user: AuthUser, scopeId: string, _ctx: ResolveContext): Promise<ResolvedAccess> {
    const meeting = this.meetings.get(scopeId);
    const role = meeting?.attendees.get(user.id);
    if (!meeting || !role) return access(false, null, []);
    return access(true, role, MEETING_ACTIONS[role], { type: "WORKSPACE", id: meeting.workspaceId });
  }

  roomsFor(scopeId: string): string[] {
    return [`meet:${scopeId}`];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL — HOST/PARTICIPANT
// ─────────────────────────────────────────────────────────────────────────────

export type FakeCallRole = "HOST" | "PARTICIPANT";

const CALL_ACTIONS: Record<FakeCallRole, Action[]> = {
  PARTICIPANT: ["call.join", "call.leave"],
  HOST: [
    "call.join",
    "call.leave",
    "call.invite",
    "call.end",
    "call.host.mute",
    "call.host.remove",
    "call.host.lock",
    "call.host.transfer",
  ],
};

export class FakeCallResolver implements ScopeResolver {
  readonly type = "CALL" as const;
  /** `{ [callId]: { [userId]: role } }` */
  participants = new Map<string, Map<string, FakeCallRole>>();

  async resolve(user: AuthUser, scopeId: string, _ctx: ResolveContext): Promise<ResolvedAccess> {
    const role = this.participants.get(scopeId)?.get(user.id);
    if (!role) return access(false, null, []);
    return access(true, role, CALL_ACTIONS[role]);
  }

  roomsFor(scopeId: string): string[] {
    return [`call:${scopeId}`];
  }
}
