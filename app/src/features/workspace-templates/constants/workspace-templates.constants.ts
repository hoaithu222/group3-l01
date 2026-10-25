import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  TemplateChannelType,
  TemplateChannelVisibility,
  TemplatePostingPolicy,
} from '../api/workspace-templates.types';

/** Mẫu chỉ đổi khi admin sửa (và chỉ áp cho nhóm tạo SAU) nên cache lâu (app.md p5-04 §4: 1 giờ). */
export const TEMPLATES_STALE_TIME_MS = 60 * 60_000;

/**
 * Mã lỗi của "Mẫu nhóm" → câu tiếng Việt (be.md p5-04 §8). Đặt TRONG feature: `shared/constants/error-codes.ts` đã ở trần dòng
 * của `file-size-manifest.json`. `CFG_005` (cờ phụ `workspaceTemplates` đang tắt) đi chung vì cùng hiện ở màn này.
 */
export const TEMPLATE_ERROR_MESSAGES: Record<string, string> = {
  /** 404 — mẫu không tồn tại hoặc admin vừa tắt. */
  TPL_001: 'Mẫu này không còn dùng được — danh sách mẫu đã được làm mới.',
  /** 409 — nhóm đã lưu trữ (chỉ đọc). */
  TPL_002: 'Nhóm đã lưu trữ nên không áp được mẫu.',
  /** 409 — số kênh đang hoạt động + số kênh sắp tạo vượt trần của nhóm. */
  TPL_003: 'Nhóm đã đạt số kênh tối đa — bỏ bớt kênh trong mẫu hoặc lưu trữ kênh cũ rồi thử lại.',
  /** 404 — cờ phụ `workspaceTemplates` đang tắt ở admin. */
  CFG_005: 'Mẫu nhóm hiện chưa được bật.',
};

export const FORBIDDEN_MESSAGE = 'Chỉ chủ nhóm và quản trị viên áp được mẫu.';
export const RATE_LIMITED_MESSAGE = 'Bạn áp mẫu quá nhiều lần trong một giờ — thử lại sau.';

export const CHANNEL_TYPE_LABEL: Record<TemplateChannelType, string> = {
  POMODORO: 'Kênh Pomodoro',
  TEXT: 'Kênh chữ',
  VOICE: 'Kênh thoại',
};

export const CHANNEL_VISIBILITY_LABEL: Record<TemplateChannelVisibility, string> = {
  PRIVATE: 'Riêng tư',
  PUBLIC: 'Công khai',
};

export const POSTING_POLICY_LABEL: Record<TemplatePostingPolicy, string> = {
  ADMINS_ONLY: 'Chỉ quản trị viên đăng',
  MEMBERS: 'Mọi thành viên đăng',
};

/**
 * Ô icon theo LOẠI kênh — CÙNG bảng với danh sách kênh (chat `info`, thoại `success`, pomodoro `warning`): kênh xem trước trong
 * mẫu trông đúng như lúc đã tạo. Khai lại ở đây vì ⛔ không import chéo feature `channels`.
 */
export const CHANNEL_TYPE_ART: Record<TemplateChannelType, { icon: IconName; tone: IconTileTone }> = {
  POMODORO: { icon: 'timer', tone: 'warning' },
  TEXT: { icon: 'chat-bubble', tone: 'info' },
  VOICE: { icon: 'mic-01', tone: 'success' },
};

/**
 * Tông ô icon của từng MẪU, xoay theo vị trí (mẫu là dữ liệu admin tự đặt tên, không có "loại" để gán tông cố định) — đủ để hai
 * mẫu cạnh nhau khác màu. ⛔ Không có `danger`: không mẫu nào là việc phá huỷ.
 */
export const TEMPLATE_TILE_TONES: readonly IconTileTone[] = ['brand', 'info', 'success', 'warning', 'accent'];
