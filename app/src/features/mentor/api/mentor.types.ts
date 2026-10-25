/**
 * Kiểu DTO Mentor Connect — khớp `be/src/modules/mentor/services/mentor-presenter.ts` (p6-03 README §5).
 * Ngày giờ là chuỗi ISO (JSON). `avatarUrl` luôn `null` ở BE hiện tại.
 */

export type MentorPostStatus = 'CLOSED' | 'FULFILLED' | 'OPEN';
export type MentorApplicationStatus = 'ACCEPTED' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
export type MentorEngagementStatus = 'ACTIVE' | 'ENDED';
export type MentorEndReason =
  | 'ENDED_BY_OWNER'
  | 'ENDED_BY_PLATFORM'
  | 'EXPIRED'
  | 'LEFT_BY_MENTOR'
  | 'MEMBERSHIP_REVOKED'
  | 'WORKSPACE_ARCHIVED';

export interface WorkspaceRef {
  avatarUrl: string | null;
  id: string;
  name: string;
}

export interface UserRef {
  id: string;
  name: string;
}

export interface MentorPostCard {
  activeEngagements: number;
  applicantsCount: number;
  commitmentHoursPerWeek: number;
  createdAt: string;
  createdBy: UserRef;
  expiresAt: string;
  id: string;
  mentorsNeeded: number;
  myApplication: { id: string; status: MentorApplicationStatus } | null;
  skillLabels: string[];
  status: MentorPostStatus;
  title: string;
  workspace: WorkspaceRef;
}

export interface MentorPostActions {
  apply: boolean;
  manage: boolean;
  report: boolean;
  withdraw: boolean;
}

export interface MentorPostDetail extends MentorPostCard {
  closedAt: string | null;
  description: string;
  hidden: boolean;
  myActions: MentorPostActions;
  version: number;
}

export interface MentorManagedPost extends MentorPostCard {
  hidden: boolean;
  pendingCount: number;
  version: number;
}

export interface MentorApplication {
  applicant: UserRef & { avatarUrl: string | null };
  createdAt: string;
  id: string;
  message: string;
  portfolioUrl: string | null;
  postId: string;
  rejectReason: string | null;
  reviewedAt: string | null;
  status: MentorApplicationStatus;
  workspaceId: string;
}

export interface MyMentorApplication {
  createdAt: string;
  engagement: {
    conversationId: string | null;
    endsAt: string;
    id: string;
    status: MentorEngagementStatus;
  } | null;
  id: string;
  post: { id: string; status: MentorPostStatus | null; title: string; workspace: WorkspaceRef };
  rejectReason: string | null;
  reviewedAt: string | null;
  status: MentorApplicationStatus;
}

export interface MentorEngagement {
  channelIds: string[];
  conversationId: string | null;
  endedAt: string | null;
  endedReason: MentorEndReason | null;
  endsAt: string;
  id: string;
  mentor: UserRef;
  post: { id: string; title: string };
  postId: string;
  startedAt: string;
  status: MentorEngagementStatus;
  totalDays: number;
  version: number;
  workspace: WorkspaceRef;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MentorFeedFilter {
  q?: string;
  /** Nhãn kỹ năng — gửi lên BE dạng CSV, bài phải có ĐỦ mọi kỹ năng. */
  skills?: string[];
}

export interface CreateMentorPostPayload {
  commitmentHoursPerWeek: number;
  description: string;
  expiresInDays: number;
  mentorsNeeded: number;
  skills: string[];
  title: string;
}

export interface ApplyPayload {
  message: string;
  portfolioUrl?: string;
}

export interface AcceptPayload {
  channelIds: string[];
  createConversation: boolean;
  durationDays: number;
  expectedPostVersion: number;
  includeMemberIds: string[];
}

export interface AcceptResult {
  conversationId: string | null;
  engagement: MentorEngagement;
  skippedChannels: { channelId: string; reason: string }[];
}

export type MentorReportReason =
  'HARASSMENT' | 'IMPERSONATION' | 'INAPPROPRIATE' | 'OTHER' | 'SCAM' | 'SPAM';

/** Kênh để chọn khi chấp nhận (đọc từ `GET /workspaces/:id/channels`). */
export interface MentorChannelOption {
  id: string;
  isDefault: boolean;
  name: string;
  visibility: 'PRIVATE' | 'PUBLIC';
}

/** Thành viên để kèm vào nhóm chat cố vấn (đọc từ `GET /workspaces/:id/members`). */
export interface MentorMemberOption {
  name: string;
  role: string;
  userId: string;
}

/** Nhóm mình quản lý (OWNER/ADMIN) — lối vào "Quản lý bài của nhóm" (`GET /workspaces`). */
export interface ManagedWorkspace {
  id: string;
  name: string;
}
