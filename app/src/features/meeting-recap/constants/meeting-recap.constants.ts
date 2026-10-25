/**
 * Giới hạn DỰ PHÒNG của biên bản/bản ghi (BE `LIMITS.meetingRecap` / `LIMITS.recording`, p2-06 README §7). Nguồn thật là server:
 * `capabilities.limits` (admin chỉnh được qua SystemConfig) — đọc bằng `useRecapLimits()`; hằng này chỉ dùng khi capabilities chưa tải.
 * ⛔ Đừng kiểm "cứng" bằng hằng này rồi chặn người dùng: BE luôn là nơi quyết (`MEET_022`, `MEET_023`).
 */
export const FALLBACK_RECAP_LIMITS = {
  attachmentsMax: 10,
  contentMax: 20_000,
} as const;

export const FALLBACK_RECORDING_RETENTION_DAYS = 90;

/** Khoá phạm vi hàng đợi upload của MỘT biên bản — `useUpload('MEETING', …)` chỉ thấy tệp của biên bản đó. */
export const recapUploadScopeKey = (meetingId: string): string => `recap:${meetingId}`;
export const RECAP_UPLOAD_PREFIX = 'recap:';

/** Mẫu gợi ý khi biên bản còn trống (README §1 P1 "mẫu biên bản") — chỉ là placeholder, không chèn vào nội dung. */
export const RECAP_PLACEHOLDER = '### Mục tiêu\n- …\n### Quyết định\n- …\n### Việc cần làm\n- [ ] …';
