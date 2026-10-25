/**
 * Kiểu cho tab "Cố vấn" của workspace (p6-03 admin.md §2.2) — viết tay theo BE thật: `GET /admin/workspaces/:workspaceId/mentor`
 * (`MentorAdminService.workspaceOverview` → `{ posts: AdminMentorPostDto[], engagements: MentorEngagementDto[] }`) và
 * `POST /admin/mentor/engagements/:id/end` (`MentorEngagementDto`), ở `be/src/modules/mentor/services/mentor-admin.service.ts` +
 * `mentor-presenter.ts`. Ngày là chuỗi ISO. BE là nguồn thật.
 *
 * ⛔ Riêng tư: lời nhắn ứng tuyển là dữ liệu giữa hai bên — BE KHÔNG trả và ở đây KHÔNG khai (chỉ số lượng đơn). Không khai `message`,
 * `portfolioUrl`, `applicant`, `rejectReason`; `tests/features/workspace/mentor-privacy.test.tsx` quét file này để chặn.
 */
export type MentorPostStatus = 'OPEN' | 'FULFILLED' | 'CLOSED';
export type MentorEngagementStatus = 'ACTIVE' | 'ENDED';

/** `MENTOR_END_REASONS` của BE. */
export type MentorEndReason =
  | 'EXPIRED'
  | 'ENDED_BY_OWNER'
  | 'LEFT_BY_MENTOR'
  | 'MEMBERSHIP_REVOKED'
  | 'WORKSPACE_ARCHIVED'
  | 'ENDED_BY_PLATFORM';

/** Bài tìm cố vấn của nhóm — chỉ phần tab cần (BE còn trả mô tả, kỹ năng, giờ/tuần… nhưng tab không hiển thị). */
export interface WorkspaceMentorPost {
  id: string;
  title: string;
  status: MentorPostStatus;
  /** Số đơn đã nhận (không kèm nội dung đơn). */
  applicantsCount: number;
  /** Số đơn còn chờ duyệt. */
  pendingCount: number;
  activeEngagements: number;
  mentorsNeeded: number;
  reportedCount: number;
  createdAt: string;
  expiresAt: string;
  /** Có giá trị khi bài bị kiểm duyệt ẩn. */
  hiddenAt: string | null;
}

export interface WorkspaceMentorEngagement {
  id: string;
  postId: string;
  status: MentorEngagementStatus;
  mentor: { id: string; name: string };
  post: { id: string; title: string };
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  endedReason: MentorEndReason | null;
}

export interface WorkspaceMentorOverview {
  posts: WorkspaceMentorPost[];
  engagements: WorkspaceMentorEngagement[];
}

export interface EndMentorEngagementPayload {
  engagementId: string;
  /** 10–500 ký tự (`adminReasonSchema` của BE) — `ConfirmWithReasonModal` đã chặn. */
  reason: string;
}
