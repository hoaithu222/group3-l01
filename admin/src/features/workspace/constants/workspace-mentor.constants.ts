import type { MentorEndReason } from '../types/workspace-mentor.types';

/** Cờ tính năng (`capabilities.features`) của tab "Cố vấn". */
export const MENTOR_FEATURE_FLAG = 'mentor';

/** Mã lỗi BE (404) khi cờ phân hệ `mentor` đang tắt (`requireFeature`). */
export const MENTOR_FEATURE_OFF_CODE = 'CFG_005';

/** `endedReason` → câu tiếng Việt; lý do lạ (BE thêm sau) → chính mã. */
export const MENTOR_END_REASON_LABELS: Record<MentorEndReason, string> = {
  EXPIRED: 'Hết hạn',
  ENDED_BY_OWNER: 'Quản trị nhóm kết thúc',
  LEFT_BY_MENTOR: 'Cố vấn tự rời',
  MEMBERSHIP_REVOKED: 'Bị thu hồi quyền vào nhóm',
  WORKSPACE_ARCHIVED: 'Nhóm đã lưu trữ',
  ENDED_BY_PLATFORM: 'Quản trị nền tảng kết thúc',
};

export const mentorEndReasonLabel = (reason: string | null): string =>
  reason ? ((MENTOR_END_REASON_LABELS as Record<string, string>)[reason] ?? reason) : '—';
