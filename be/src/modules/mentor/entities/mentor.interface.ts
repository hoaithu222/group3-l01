/**
 * Entity domain của Mentor Connect (p6-03) — khai ĐỘC LẬP với kiểu Prisma (cùng giá trị enum), giống `modules/wallet/entities`.
 */
export const MENTOR_POST_STATUSES = ["OPEN", "FULFILLED", "CLOSED"] as const;
export type MentorPostStatus = (typeof MENTOR_POST_STATUSES)[number];

export const MENTOR_APPLICATION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const;
export type MentorApplicationStatus = (typeof MENTOR_APPLICATION_STATUSES)[number];

export const MENTOR_ENGAGEMENT_STATUSES = ["ACTIVE", "ENDED"] as const;
export type MentorEngagementStatus = (typeof MENTOR_ENGAGEMENT_STATUSES)[number];

export const MENTOR_END_REASONS = [
  "EXPIRED",
  "ENDED_BY_OWNER",
  "LEFT_BY_MENTOR",
  "MEMBERSHIP_REVOKED",
  "WORKSPACE_ARCHIVED",
  "ENDED_BY_PLATFORM",
] as const;
export type MentorEndReason = (typeof MENTOR_END_REASONS)[number];

/** Nhãn hiển thị gắn vào `WorkspaceMembership.displayTag` của cố vấn. */
export const MENTOR_DISPLAY_TAG = "MENTOR";

export interface MentorPost {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  normalizedTitle: string;
  description: string;
  skills: string[];
  skillLabels: string[];
  commitmentHoursPerWeek: number;
  mentorsNeeded: number;
  activeEngagements: number;
  status: MentorPostStatus;
  applicantsCount: number;
  expiresAt: Date;
  reportedCount: number;
  hiddenAt: Date | null;
  hiddenBy: string | null;
  hiddenReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

export type MentorPostCreateInput = Pick<
  MentorPost,
  | "workspaceId"
  | "createdBy"
  | "title"
  | "normalizedTitle"
  | "description"
  | "skills"
  | "skillLabels"
  | "commitmentHoursPerWeek"
  | "mentorsNeeded"
  | "expiresAt"
>;

export type MentorPostPatch = Partial<
  Pick<
    MentorPost,
    "title" | "normalizedTitle" | "description" | "skills" | "skillLabels" | "commitmentHoursPerWeek" | "mentorsNeeded" | "expiresAt" | "status"
  >
>;

export interface MentorApplication {
  id: string;
  postId: string;
  workspaceId: string;
  applicantId: string;
  message: string;
  portfolioUrl: string | null;
  status: MentorApplicationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MentorApplicationCreateInput = Pick<MentorApplication, "postId" | "workspaceId" | "applicantId" | "message" | "portfolioUrl">;

export interface MentorEngagement {
  id: string;
  postId: string;
  applicationId: string;
  workspaceId: string;
  mentorId: string;
  acceptedBy: string;
  channelIds: string[];
  conversationId: string | null;
  startedAt: Date;
  endsAt: Date;
  totalDays: number;
  status: MentorEngagementStatus;
  endedAt: Date | null;
  endedReason: MentorEndReason | null;
  endedBy: string | null;
  endingSoonNotifiedAt: Date | null;
  version: number;
  createdAt: Date;
}

export type MentorEngagementCreateInput = Pick<
  MentorEngagement,
  "postId" | "applicationId" | "workspaceId" | "mentorId" | "acceptedBy" | "channelIds" | "startedAt" | "endsAt" | "totalDays"
>;

/** Bộ lọc bảng tin công khai. */
export interface MentorPostFeedFilter {
  status: MentorPostStatus;
  /** Chuỗi đã chuẩn hoá `normalizeSearch` (tìm trong tiêu đề). */
  q?: string;
  /** Kỹ năng đã chuẩn hoá — bài phải có ĐỦ mọi kỹ năng. */
  skills?: string[];
  workspaceId?: string;
  now: Date;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}
