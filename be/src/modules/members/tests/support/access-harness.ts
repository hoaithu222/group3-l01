import { InMemoryInvitationRepository } from "../../repositories/invitation.repository.inmemory";
import { InMemoryMembershipRepository } from "../../repositories/membership.repository.inmemory";
import type { WorkspaceBrief, UserBrief } from "../../repositories/invitation.repository.interface";
import type { WorkspaceInvitation } from "../../entities/invitation.interface";
import type { WorkspaceMembership } from "../../entities/member.interface";
import { DEFAULT_GUEST_CONFIG, type GuestConfig } from "../../services/invitation-rules";
import { StaticGuestConfig } from "../../services/guest-config";

/** Dựng dữ liệu cho unit test luồng lời mời/khách/duyệt (repo in-memory, không DB/Redis). */
export const WS = "aa".repeat(12);
export const OWNER = "01".repeat(12);
export const ADMIN = "02".repeat(12);
export const MEMBER = "03".repeat(12);
export const GUEST = "04".repeat(12);
export const OUTSIDER = "05".repeat(12);
export const CH_PUBLIC = "c1".repeat(12);
export const CH_PRIVATE = "c2".repeat(12);

export function makeWorkspace(overrides: Partial<WorkspaceBrief> = {}): WorkspaceBrief {
  return {
    id: WS,
    name: "Nhóm thử",
    avatarAssetId: null,
    status: "ACTIVE",
    joinPolicy: "OPEN",
    guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: false },
    defaultChannelId: null,
    ...overrides,
  };
}

export function makeUser(id: string, overrides: Partial<UserBrief> = {}): UserBrief {
  return { id, email: `${id}@e.com`, name: `Người ${id.slice(0, 2)}`, emailVerified: true, ...overrides };
}

export function makeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: `m-${overrides.userId ?? "x"}`,
    workspaceId: WS,
    userId: MEMBER,
    role: "MEMBER",
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date("2026-09-01T00:00:00Z"),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    expiryVersion: 0,
    ...overrides,
  };
}

export function makeInvitation(overrides: Partial<WorkspaceInvitation> = {}): WorkspaceInvitation {
  const now = new Date();
  return {
    id: "inv1",
    workspaceId: WS,
    email: "Khach@Example.com",
    normalizedEmail: "khach@example.com",
    role: "MEMBER",
    guestChannelIds: [],
    guestDays: null,
    message: null,
    tokenHash: "hash-inv1",
    invitedBy: OWNER,
    status: "PENDING",
    pendingKey: `${WS}:khach@example.com`,
    expiresAt: new Date(now.getTime() + 7 * 24 * 3600_000),
    lastSentAt: new Date(now.getTime() - 24 * 3600_000),
    sendCount: 1,
    acceptedBy: null,
    acceptedAt: null,
    revokedBy: null,
    revokedAt: null,
    createdAt: new Date(now.getTime() - 24 * 3600_000),
    ...overrides,
  };
}

export interface AccessHarness {
  invitations: InMemoryInvitationRepository;
  memberships: InMemoryMembershipRepository;
  config: StaticGuestConfig;
}

/** Workspace + OWNER/ADMIN/MEMBER ACTIVE, 2 kênh (public + riêng tư) — chưa có lời mời nào. */
export function buildHarness(guestConfig: GuestConfig = DEFAULT_GUEST_CONFIG): AccessHarness {
  const invitations = new InMemoryInvitationRepository();
  const memberships = new InMemoryMembershipRepository();
  invitations.workspaces.set(WS, makeWorkspace());
  for (const [userId, role] of [[OWNER, "OWNER"], [ADMIN, "ADMIN"], [MEMBER, "MEMBER"]] as const) {
    memberships.seedMembership(makeMembership({ id: `m-${userId}`, userId, role }));
    invitations.users.set(userId, makeUser(userId));
  }
  invitations.channels.push(
    { id: CH_PUBLIC, workspaceId: WS, name: "Chung", visibility: "PUBLIC", status: "ACTIVE" },
    { id: CH_PRIVATE, workspaceId: WS, name: "Ban giám hiệu", visibility: "PRIVATE", status: "ACTIVE" }
  );
  return { invitations, memberships, config: new StaticGuestConfig(guestConfig) };
}
