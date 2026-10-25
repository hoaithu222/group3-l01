import type { IconName } from '@/shared/ui/icon';

import type {
  FillMatchMode,
  ReportReason,
  StudyItemType,
  StudyVisibility,
} from '../api/study.types';

/**
 * Trần cứng của BE (`LIMITS.study`, be.md p4-01 §7) — dùng khi `capabilities.limits.study` chưa có. Client KHÔNG
 * hard-code giới hạn ở nơi khác (02-conventions §2): mọi chỗ đọc qua `readStudyLimits`.
 */
export const FALLBACK_STUDY_LIMITS = {
  acceptedAnswerMax: 200,
  acceptedAnswersMax: 10,
  bulkOpsMax: 500,
  explanationMax: 2000,
  itemTagsMax: 5,
  itemsPerSetMax: 500,
  optionTextMax: 300,
  optionsMax: 6,
  optionsMin: 2,
  promptMax: 2000,
  setDescriptionMax: 1000,
  setTitleMax: 120,
  tagMax: 30,
  tagsMax: 10,
} as const;

export type StudyLimits = { -readonly [K in keyof typeof FALLBACK_STUDY_LIMITS]: number };

const MIB = 1024 * 1024;

/**
 * Ảnh/âm thanh của bộ học — bản SAO của `LIMITS.upload.scopeRestrict.STUDY` (BE `core/constants/limits.ts`, be.md p4-01
 * §13.12). Scope `STUDY` bị SIẾT CHẶT: kind khác (video, tệp, GIF/HEIC) bị từ chối `ASSET_001`. Đổi số ở BE thì đổi Ở ĐÂY
 * theo — `capabilities.upload.kinds` chưa có trần riêng theo scope, nên client không có nguồn nào khác để đọc.
 * `AUDIO.mime` là MIME BE nhận (`audio/mp4` = M4A); MIME máy báo (`audio/x-m4a`…) được quy về đây ở `media-policy.ts`.
 */
export const STUDY_MEDIA_LIMITS = {
  AUDIO: { label: 'MP3 hoặc M4A', maxBytes: 10 * MIB, mime: ['audio/mpeg', 'audio/mp4'] },
  IMAGE: { label: 'JPEG, PNG hoặc WebP', maxBytes: 5 * MIB, mime: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;

export const ITEM_TYPE_META: Record<StudyItemType, { icon: IconName; label: string }> = {
  FILL_BLANK: { icon: 'edit', label: 'Điền vào chỗ trống' },
  FLASHCARD: { icon: 'book', label: 'Thẻ ghi nhớ' },
  MULTI_SELECT: { icon: 'checkmark-square', label: 'Nhiều đáp án đúng' },
  MULTIPLE_CHOICE: { icon: 'checkmark-circle', label: 'Trắc nghiệm' },
  TRUE_FALSE: { icon: 'tick-double-01', label: 'Đúng / Sai' },
};

/** Phạm vi thể hiện bằng ICON + CHỮ (không chỉ màu) — app.md p4-01 §2 `StudySetCard`. */
export const VISIBILITY_META: Record<
  StudyVisibility,
  { description: string; icon: IconName; label: string }
> = {
  PRIVATE: { description: 'Chỉ mình bạn xem và học.', icon: 'lock', label: 'Riêng tư' },
  PUBLIC: {
    description: 'Mọi người dùng đều tìm thấy, xem và sao chép bộ này.',
    icon: 'share',
    label: 'Công khai',
  },
  WORKSPACE: {
    description: 'Thành viên của nhóm xem, học và sao chép được.',
    icon: 'add-team',
    label: 'Trong nhóm',
  },
};

export const MATCH_MODE_LABELS: Record<FillMatchMode, string> = {
  EXACT: 'Khớp chính xác',
  IGNORE_ACCENTS: 'Bỏ qua dấu và hoa/thường',
  IGNORE_CASE: 'Bỏ qua hoa/thường',
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  COPYRIGHT: 'Vi phạm bản quyền',
  INAPPROPRIATE: 'Nội dung không phù hợp',
  OTHER: 'Lý do khác',
  SPAM: 'Spam / quảng cáo',
  WRONG_CONTENT: 'Nội dung sai',
};

/** `LIMITS.report.otherDescriptionMin` — lý do "Khác" bắt buộc mô tả (BE `reportSetSchema`). */
export const REPORT_OTHER_MIN = 10;

/** Độ dài lý do ẩn/khôi phục bộ của nhóm — cùng luật `reasonSchema` của BE (`trim`, 10–500). Thiếu là 400 `VAL_001`. */
export const MODERATION_REASON_MIN = 10;
export const MODERATION_REASON_MAX = 500;

/** Chuỗi đầu vào bị coi là chữ gõ dở của bộ gõ tiếng Việt khi debounce tìm kiếm (giống các feature khác). */
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_CHARS = 2;

/** Tiêu đề AppBar của các màn ôn theo lịch (SM-2). */
export const SR_TITLE = 'Ôn tập hôm nay';
