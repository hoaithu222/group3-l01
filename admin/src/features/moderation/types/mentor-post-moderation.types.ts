/**
 * Kiểu cho kiểm duyệt bài tìm cố vấn (p6-03 admin.md §2.1) — viết tay theo `AdminMentorPostDto` ở
 * `be/src/modules/mentor/services/mentor-admin.service.ts` (`GET /admin/mentor/posts/:id`). KHÔNG có lời nhắn ứng tuyển
 * (dữ liệu giữa hai bên) — chỉ số lượng.
 */
export type MentorPostStatus = 'OPEN' | 'FULFILLED' | 'CLOSED';

export interface AdminMentorPost {
  id: string;
  title: string;
  description: string;
  skillLabels: string[];
  commitmentHoursPerWeek: number;
  mentorsNeeded: number;
  activeEngagements: number;
  status: MentorPostStatus;
  applicantsCount: number;
  pendingCount: number;
  reportedCount: number;
  expiresAt: string;
  createdAt: string;
  closedAt: string | null;
  hiddenAt: string | null;
  hiddenReason: string | null;
  version: number;
  workspace: { id: string; name: string };
  createdBy: { id: string; name: string };
}

export interface MentorPostDecisionPayload {
  postId: string;
  /** 10–500 ký tự (`reasonSchema` của BE) — `ConfirmWithReasonModal` đã chặn. */
  reason: string;
}
