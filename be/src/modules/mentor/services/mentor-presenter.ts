import { avatarUrlOf } from "../../../shared/media";
import type { MentorApplication, MentorEngagement, MentorPost } from "../entities/mentor.interface";
import type { IMentorDirectory, UserBrief, WorkspaceBrief } from "../repositories/mentor-directory.interface";

/**
 * Hợp đồng API (README §5) — `avatarUrl` = URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (`avatarUrlOf`, dựng từ `avatarAssetId` nạp cùng
 * truy vấn của `IMentorDirectory`); client dùng thẳng làm nguồn ảnh. Chưa đặt ảnh/tài khoản đã ẩn danh hoá → `null`.
 */
export interface WorkspaceRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}
export interface UserRef {
  id: string;
  name: string;
}

export interface MentorPostCardDto {
  id: string;
  title: string;
  skillLabels: string[];
  commitmentHoursPerWeek: number;
  mentorsNeeded: number;
  activeEngagements: number;
  status: MentorPost["status"];
  applicantsCount: number;
  expiresAt: Date;
  createdAt: Date;
  workspace: WorkspaceRef;
  createdBy: UserRef;
  myApplication: { id: string; status: MentorApplication["status"] } | null;
}

export interface MentorPostActions {
  apply: boolean;
  manage: boolean;
  report: boolean;
  withdraw: boolean;
}

export interface MentorPostDetailDto extends MentorPostCardDto {
  description: string;
  version: number;
  hidden: boolean;
  closedAt: Date | null;
  myActions: MentorPostActions;
}

export interface MentorManagedPostDto extends MentorPostCardDto {
  version: number;
  pendingCount: number;
  hidden: boolean;
}

export interface MentorApplicationDto {
  id: string;
  postId: string;
  workspaceId: string;
  status: MentorApplication["status"];
  message: string;
  portfolioUrl: string | null;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  applicant: UserRef & { avatarUrl: string | null };
}

export interface MentorEngagementDto {
  id: string;
  postId: string;
  status: MentorEngagement["status"];
  mentor: UserRef;
  post: { id: string; title: string };
  workspace: WorkspaceRef;
  channelIds: string[];
  conversationId: string | null;
  startedAt: Date;
  endsAt: Date;
  totalDays: number;
  endedAt: Date | null;
  endedReason: MentorEngagement["endedReason"];
  version: number;
}

export interface MyApplicationDto {
  id: string;
  status: MentorApplication["status"];
  createdAt: Date;
  reviewedAt: Date | null;
  rejectReason: string | null;
  post: { id: string; title: string; status: MentorPost["status"] | null; workspace: WorkspaceRef };
  engagement: { id: string; status: MentorEngagement["status"]; conversationId: string | null; endsAt: Date } | null;
}

export interface PresentLookups {
  workspaces: Map<string, WorkspaceBrief>;
  users: Map<string, UserBrief>;
}

/** Nạp tên + ảnh nhóm/người một lượt (2 truy vấn cho cả trang — không N+1). */
export async function loadLookups(directory: IMentorDirectory, workspaceIds: string[], userIds: string[]): Promise<PresentLookups> {
  const [workspaces, users] = await Promise.all([directory.workspaces(workspaceIds), directory.users(userIds)]);
  return { workspaces, users };
}

export const workspaceRef = (id: string, l: PresentLookups): WorkspaceRef => {
  const workspace = l.workspaces.get(id);
  return { id, name: workspace?.name ?? "", avatarUrl: avatarUrlOf(workspace?.avatarAssetId) };
};
export const userRef = (id: string, l: PresentLookups): UserRef => ({ id, name: l.users.get(id)?.name ?? "" });

export function toPostCard(post: MentorPost, l: PresentLookups, mine: MentorApplication | undefined): MentorPostCardDto {
  return {
    id: post.id,
    title: post.title,
    skillLabels: post.skillLabels,
    commitmentHoursPerWeek: post.commitmentHoursPerWeek,
    mentorsNeeded: post.mentorsNeeded,
    activeEngagements: post.activeEngagements,
    status: post.status,
    applicantsCount: post.applicantsCount,
    expiresAt: post.expiresAt,
    createdAt: post.createdAt,
    workspace: workspaceRef(post.workspaceId, l),
    createdBy: userRef(post.createdBy, l),
    myApplication: mine ? { id: mine.id, status: mine.status } : null,
  };
}

export function toApplicationDto(app: MentorApplication, l: PresentLookups): MentorApplicationDto {
  return {
    id: app.id,
    postId: app.postId,
    workspaceId: app.workspaceId,
    status: app.status,
    message: app.message,
    portfolioUrl: app.portfolioUrl,
    rejectReason: app.rejectReason,
    createdAt: app.createdAt,
    reviewedAt: app.reviewedAt,
    applicant: { ...userRef(app.applicantId, l), avatarUrl: avatarUrlOf(l.users.get(app.applicantId)?.avatarAssetId) },
  };
}

export function toEngagementDto(e: MentorEngagement, post: MentorPost | undefined, l: PresentLookups): MentorEngagementDto {
  return {
    id: e.id,
    postId: e.postId,
    status: e.status,
    mentor: userRef(e.mentorId, l),
    post: { id: e.postId, title: post?.title ?? "" },
    workspace: workspaceRef(e.workspaceId, l),
    channelIds: e.channelIds,
    conversationId: e.conversationId,
    startedAt: e.startedAt,
    endsAt: e.endsAt,
    totalDays: e.totalDays,
    endedAt: e.endedAt,
    endedReason: e.endedReason,
    version: e.version,
  };
}
