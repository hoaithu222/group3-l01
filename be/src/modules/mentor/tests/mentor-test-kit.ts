/**
 * Bộ dựng unit test cho service Mentor Connect — repo in-memory + cổng giả (quyền, khách, nhóm chat, báo cáo, thông báo, audit).
 * KHÔNG phải test (không khớp `*.test.ts`).
 */
import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import type { NotifyInput } from "../../notifications/public";
import type { GuestGrantInput, WorkspaceMembershipPort, WorkspaceMembershipStatus } from "../../../shared/ports/workspace-membership.port";
import type { ConversationPort, CreateGroupConversationInput } from "../../../shared/ports/conversation-group.port";
import type { ReportPort } from "../../../shared/ports/report.port";
import { buildMentorServices } from "../mentor.services";
import { InMemoryMentorPostRepository } from "../repositories/mentor-post.repository.inmemory";
import { InMemoryMentorApplicationRepository } from "../repositories/mentor-application.repository.inmemory";
import { InMemoryMentorEngagementRepository } from "../repositories/mentor-engagement.repository.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner } from "../repositories/tx";
import type { ChannelBrief, IMentorDirectory } from "../repositories/mentor-directory.interface";
import type { MentorDeps, WorkspaceRole } from "../services/mentor.deps";

export const user = (id: string = newObjectId(), role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: "T", role });

export class FakeMembership implements WorkspaceMembershipPort {
  readonly statuses = new Map<string, WorkspaceMembershipStatus>();
  readonly grants: GuestGrantInput[] = [];
  readonly revokes: Array<{ workspaceId: string; userId: string; reason: string }> = [];
  readonly expiries: Array<{ workspaceId: string; userId: string; expiresAt: Date }> = [];
  afterCalls = 0;

  key = (ws: string, u: string) => `${ws}:${u}`;
  set(ws: string, u: string, s: WorkspaceMembershipStatus): void {
    this.statuses.set(this.key(ws, u), s);
  }
  async statusOf(ws: string, u: string) {
    return this.statuses.get(this.key(ws, u)) ?? null;
  }
  async grantGuestInTx(_tx: unknown, input: GuestGrantInput) {
    const s = this.statuses.get(this.key(input.workspaceId, input.userId));
    if (s === "ACTIVE" || s === "PENDING" || s === "BANNED") return { ok: false as const, reason: "ALREADY_MEMBER" as const };
    this.grants.push(input);
    this.set(input.workspaceId, input.userId, "ACTIVE");
    return { ok: true as const, handle: { workspaceId: input.workspaceId, userId: input.userId, channelIds: input.channelIds, skipped: [], internal: null } };
  }
  async updateGuestExpiryInTx(_tx: unknown, input: { workspaceId: string; userId: string; expiresAt: Date }) {
    if (this.statuses.get(this.key(input.workspaceId, input.userId)) !== "ACTIVE") return false;
    this.expiries.push(input);
    return true;
  }
  async afterGuestChange() {
    this.afterCalls += 1;
  }
  async revokeGuest(workspaceId: string, userId: string, reason: string) {
    this.revokes.push({ workspaceId, userId, reason });
    if (this.statuses.get(this.key(workspaceId, userId)) !== "ACTIVE") return "SKIPPED" as const;
    this.set(workspaceId, userId, "REMOVED");
    return "REVOKED" as const;
  }
}

export class FakeConversations implements ConversationPort {
  readonly created: CreateGroupConversationInput[] = [];
  readonly removed: Array<{ conversationId: string; userId: string }> = [];
  private byKey = new Map<string, string>();
  async createGroup(input: CreateGroupConversationInput) {
    const existing = this.byKey.get(input.dedupeKey);
    if (existing) return { conversationId: existing, created: false, memberIds: [] };
    const id = newObjectId();
    this.byKey.set(input.dedupeKey, id);
    this.created.push(input);
    return { conversationId: id, created: true, memberIds: [input.ownerId, ...input.memberIds, ...input.guestIds] };
  }
  async removeMember(conversationId: string, userId: string) {
    this.removed.push({ conversationId, userId });
  }
}

export type SystemPost =
  | { type: "MENTOR_JOINED"; conversationId: string; workspaceId: string; mentorId: string; endsAt: Date; dedupeKey: string }
  | { type: "MENTOR_LEFT"; conversationId: string; workspaceId: string; mentorId: string; reason: string; dedupeKey: string };

export interface Kit {
  deps: MentorDeps;
  services: ReturnType<typeof buildMentorServices>;
  posts: InMemoryMentorPostRepository;
  applications: InMemoryMentorApplicationRepository;
  engagements: InMemoryMentorEngagementRepository;
  outbox: InMemoryOutboxPort;
  membership: FakeMembership;
  conversations: FakeConversations;
  notifications: NotifyInput[];
  /** Tin hệ thống đã đăng (`MENTOR_JOINED`/`MENTOR_LEFT`) — để assert nội dung + dedupeKey. */
  systemPosts: SystemPost[];
  /** Số ngày mặc định của hệ thống (`SystemConfig mentor.defaultDurationDays`) — test đổi giá trị này. */
  settings: { defaultDays: number };
  audits: Array<{ action: string; targetId: string }>;
  roles: Map<string, WorkspaceRole>;
  channels: ChannelBrief[];
  manageableChannels: Set<string>;
  /** `userId`/`workspaceId` → `avatarAssetId` mà thư mục giả trả về (vắng = chưa đặt ảnh). */
  avatars: Map<string, string>;
  setRole(workspaceId: string, userId: string, role: WorkspaceRole): void;
  clock: { now: Date };
}

export function makeKit(): Kit {
  const posts = new InMemoryMentorPostRepository();
  const applications = new InMemoryMentorApplicationRepository();
  const engagements = new InMemoryMentorEngagementRepository();
  const outbox = new InMemoryOutboxPort();
  const membership = new FakeMembership();
  const conversations = new FakeConversations();
  const notifications: NotifyInput[] = [];
  const systemPosts: SystemPost[] = [];
  const settings = { defaultDays: 30 };
  const audits: Array<{ action: string; targetId: string }> = [];
  const roles = new Map<string, WorkspaceRole>();
  const channels: ChannelBrief[] = [];
  const manageableChannels = new Set<string>();
  const clock = { now: new Date() };
  const avatars = new Map<string, string>();
  const directory: IMentorDirectory = {
    workspaces: async (ids) =>
      new Map(ids.map((id) => [id, { id, name: `Nhóm ${id.slice(-4)}`, status: "ACTIVE", defaultChannelId: null, avatarAssetId: avatars.get(id) ?? null }])),
    users: async (ids) => new Map(ids.map((id) => [id, { id, name: `Người ${id.slice(-4)}`, avatarAssetId: avatars.get(id) ?? null }])),
    channels: async (ws, ids) => channels.filter((c) => c.workspaceId === ws && ids.includes(c.id)),
    adminIds: async (ws) => [...roles.entries()].filter(([k, r]) => k.startsWith(`${ws}:`) && (r === "OWNER" || r === "ADMIN")).map(([k]) => k.split(":")[1]),
  };
  const reports: ReportPort = {
    submit: async () => ({ id: newObjectId(), status: "OPEN", createdAt: clock.now, alreadyReported: false }),
    closeOpenByTarget: async () => ({ closedCount: 0 }),
  };
  const deps: MentorDeps = {
    posts,
    applications,
    engagements,
    directory,
    access: {
      workspaceRole: async (u, ws) => roles.get(`${ws}:${u.id}`) ?? null,
      canManageChannel: async (_u, ch) => manageableChannels.has(ch),
    },
    membership,
    conversations,
    reports,
    systemMessages: {
      mentorJoined: async (conversationId, workspaceId, mentorId, endsAt, dedupeKey) => void systemPosts.push({ type: "MENTOR_JOINED", conversationId, workspaceId, mentorId, endsAt, dedupeKey }),
      mentorLeft: async (conversationId, workspaceId, mentorId, reason, dedupeKey) => void systemPosts.push({ type: "MENTOR_LEFT", conversationId, workspaceId, mentorId, reason, dedupeKey }),
    },
    settings: { defaultDurationDays: async () => settings.defaultDays },
    notifier: { notify: async (_tx, input) => void notifications.push(input) },
    audit: { record: async (input) => void audits.push({ action: input.action, targetId: input.targetId }) },
    tx: new InMemoryTxRunner(),
    outbox,
    now: () => clock.now,
  };
  return {
    deps,
    services: buildMentorServices(deps),
    posts,
    applications,
    engagements,
    outbox,
    membership,
    conversations,
    notifications,
    systemPosts,
    settings,
    audits,
    roles,
    channels,
    manageableChannels,
    avatars,
    setRole: (ws, u, r) => {
      roles.set(`${ws}:${u}`, r);
      membership.set(ws, u, "ACTIVE");
    },
    clock,
  };
}

export async function expectCode(p: Promise<unknown>, code: string, status?: number): Promise<void> {
  await expect(p).rejects.toMatchObject({ errorCode: code, ...(status !== undefined && { statusCode: status }) });
}
