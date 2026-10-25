/**
 * Hằng số khối "Phân bổ & hoạt động" của trang Tổng quan (`InsightsBreakdownGrid`) — nhãn tiếng Việt cho mã enum BE,
 * màu theo ngữ nghĩa, thông số hình học biểu đồ, bảng class bố cục.
 *
 * Nhãn CHÉP từ các bảng sẵn có chứ KHÔNG import (feature này không được import feature khác): nguồn XP từ
 * `features/gamification/constants/gamification.labels.ts` (`XP_SOURCE_LABELS`) + hai mã enum `XpSourceType` bảng đó chưa khai;
 * loại cuộc gọi từ `features/meeting/constants/call.constants.ts`; vai trò từ `features/user/constants/user.constants.ts`;
 * trạng thái báo cáo cùng chữ với `statusBadge('report')`. Đổi chữ ở bảng gốc thì sửa lại ở đây cho khớp.
 *
 * Màu: chỉ token scale `-5` (`chart-conventions.md §1.2`). Trạng thái (tài khoản, báo cáo) dùng ĐÚNG nghĩa
 * success/warning/error/neutral; phân loại thuần thì lấy từ dải `seriesTokenAt` (xem `utils/breakdown.utils.ts`).
 */
import type { TitleIconColor } from '@/shared/ui';

// ── Panel ──────────────────────────────────────────────────────────────────────

export type BreakdownPanelId =
  | 'accounts'
  | 'heatmap'
  | 'workspaces'
  | 'xp'
  | 'levels'
  | 'calls'
  | 'reports';

export interface BreakdownPanelMeta {
  title: string;
  /** Ghi chú ngắn sau tiêu đề (`PanelCard.titleNote`). */
  titleNote?: string;
  tone: TitleIconColor;
  /** Bề rộng theo "đơn vị": 1 = panel hẹp (biểu đồ nhỏ), 2 = panel rộng (heatmap 24 cột). `layoutBreakdownPanels` quy ra cột. */
  units: number;
  /** Câu hiện khi panel có trường dữ liệu nhưng chưa có số nào > 0. */
  emptyText: string;
}

/**
 * Thứ tự dựng = thứ tự đọc (trái→phải, trên→xuống). Tám đơn vị khi bật đủ cờ → hai hàng: `[Tài khoản · Hoạt động theo giờ ·
 * Workspace]` rồi `[Nguồn XP · Cấp độ · Cuộc gọi · Báo cáo]`, mỗi hàng đúng 4 đơn vị.
 */
export const BREAKDOWN_PANEL_ORDER: readonly BreakdownPanelId[] = [
  'accounts',
  'heatmap',
  'workspaces',
  'xp',
  'levels',
  'calls',
  'reports',
];

/** Mỗi panel một tone khung riêng (khác `sky` của biểu đồ hero) để nhóm phân bổ đọc ra "nhiều ô khác nhau", không phải một khối đồng màu. */
export const BREAKDOWN_PANELS: Readonly<Record<BreakdownPanelId, BreakdownPanelMeta>> = {
  accounts: {
    title: 'Tài khoản',
    tone: 'blue',
    units: 1,
    emptyText: 'Chưa có tài khoản nào',
  },
  heatmap: {
    title: 'Hoạt động theo giờ',
    titleNote: 'giờ VN',
    tone: 'teal',
    units: 2,
    emptyText: 'Chưa có tin nhắn nào trong kỳ này',
  },
  workspaces: {
    title: 'Workspace sôi động',
    titleNote: 'theo tin nhắn',
    tone: 'azure',
    units: 1,
    emptyText: 'Chưa có workspace nào hoạt động trong kỳ này',
  },
  xp: {
    title: 'Nguồn XP',
    tone: 'yellow',
    units: 1,
    emptyText: 'Chưa có XP nào được cấp trong kỳ này',
  },
  levels: {
    title: 'Cấp độ người dùng',
    titleNote: 'số người theo cấp',
    tone: 'purple',
    units: 1,
    emptyText: 'Chưa có người dùng nào có cấp độ',
  },
  // `title` của panel này đổi theo trường nào có mặt — xem `CALLS_PANEL_TITLES`.
  calls: {
    title: 'Cuộc gọi & tin nhắn',
    tone: 'indigo',
    units: 1,
    emptyText: 'Chưa có cuộc gọi hay tin nhắn nào trong kỳ này',
  },
  reports: {
    title: 'Báo cáo kiểm duyệt',
    tone: 'orange',
    units: 1,
    emptyText: 'Chưa có báo cáo nào trong kỳ này',
  },
};

/** Tiêu đề panel "Cuộc gọi & tin nhắn" theo trường dữ liệu có mặt (`callMedia` cờ voice/meeting, `messageScope` cờ communication). */
export const CALLS_PANEL_TITLES = {
  both: 'Cuộc gọi & tin nhắn',
  callsOnly: 'Cuộc gọi',
  messagesOnly: 'Phạm vi tin nhắn',
} as const;

/** Số cột của lưới bố cục (từ `xl`). */
export const BREAKDOWN_GRID_COLUMNS = 12;

/** Tối đa bấy nhiêu đơn vị bề rộng trong MỘT hàng ở `xl` — 4 đơn vị = 4 panel hẹp (mỗi panel 3 cột) hoặc 2 hẹp + 1 rộng. */
export const BREAKDOWN_MAX_UNITS_PER_ROW = 4;

/**
 * `col-span` ở `xl` theo số cột. ⛔ Phải LITERAL: Tailwind quét mã nguồn như văn bản thuần, class ghép chuỗi
 * (`xl:col-span-${n}`) không bao giờ được sinh ra.
 */
export const XL_COL_SPAN_CLASS: Readonly<Record<number, string>> = {
  1: 'xl:col-span-1',
  2: 'xl:col-span-2',
  3: 'xl:col-span-3',
  4: 'xl:col-span-4',
  5: 'xl:col-span-5',
  6: 'xl:col-span-6',
  7: 'xl:col-span-7',
  8: 'xl:col-span-8',
  9: 'xl:col-span-9',
  10: 'xl:col-span-10',
  11: 'xl:col-span-11',
  12: 'xl:col-span-12',
};

// ── Tài khoản ─────────────────────────────────────────────────────────────────

export const USER_STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Bị khoá',
  PENDING_DELETION: 'Chờ xoá',
  ANONYMIZED: 'Đã ẩn danh',
};

/** Trạng thái tài khoản dùng màu ĐÚNG nghĩa (lục = ổn · đỏ = bị khoá · cam = chờ xoá · xám = đã ẩn danh) — đây là trạng thái, không phải phân loại. */
export const USER_STATUS_COLORS: Readonly<Record<string, string>> = {
  ACTIVE: 'success-5',
  LOCKED: 'error-5',
  PENDING_DELETION: 'warning-5',
  ANONYMIZED: 'neutral-6',
};

export const USER_ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: 'Quản trị viên',
  manager: 'Quản lý',
  user: 'Người dùng',
};

/** Thứ tự slot màu cố định cho vai trò — màu theo VAI TRÒ chứ không theo thứ hạng số lượng, để đổi số liệu không đổi màu. */
export const USER_ROLE_ORDER: readonly string[] = ['user', 'manager', 'admin'];

// ── Cuộc gọi & tin nhắn ───────────────────────────────────────────────────────

export const CALL_MEDIA_LABELS: Readonly<Record<string, string>> = {
  AUDIO: 'Thoại',
  VIDEO: 'Video',
};
export const CALL_MEDIA_ORDER: readonly string[] = ['AUDIO', 'VIDEO'];

export const MESSAGE_SCOPE_LABELS: Readonly<Record<string, string>> = {
  CHANNEL: 'Kênh',
  CONVERSATION: 'Hội thoại',
};
export const MESSAGE_SCOPE_ORDER: readonly string[] = ['CHANNEL', 'CONVERSATION'];

// ── Báo cáo kiểm duyệt ────────────────────────────────────────────────────────

export const REPORT_STATUS_LABELS: Readonly<Record<string, string>> = {
  OPEN: 'Chờ xử lý',
  RESOLVED: 'Đã xử lý',
  DISMISSED: 'Bỏ qua',
};

export const REPORT_STATUS_COLORS: Readonly<Record<string, string>> = {
  OPEN: 'warning-5',
  RESOLVED: 'success-5',
  DISMISSED: 'neutral-6',
};

// ── XP & cấp độ ───────────────────────────────────────────────────────────────

export const XP_SOURCE_LABELS: Readonly<Record<string, string>> = {
  TASK_COMPLETED: 'Hoàn thành task',
  TASK_ON_TIME: 'Hoàn thành đúng hạn',
  QUIZ_SCORED: 'Làm bài kiểm tra',
  QUIZ_PASSED: 'Đạt bài kiểm tra',
  SR_REVIEW: 'Ôn thẻ',
  SR_REVIEW_DAY: 'Ôn tập trong ngày',
  REVIEW_SUBMITTED: 'Gửi đánh giá',
  STUDY_SET_PUBLISHED: 'Công khai bộ học',
  POMODORO_CYCLE: 'Chu kỳ Pomodoro',
  // Hai mã dưới có trong enum `XpSourceType` (be/prisma/schema.prisma) nhưng bảng nhãn của phân hệ gamification không khai.
  ROADMAP_LESSON: 'Hoàn thành buổi học',
  ADMIN_ADJUST: 'Quản trị điều chỉnh',
};

/** BE đã cắt top 8 nguồn XP; giữ trần ở FE để dải màu 8 slot không bao giờ tràn nếu BE đổi. */
export const XP_SOURCE_LIMIT = 8;

/** Cột cấp độ: một hue duy nhất (cấp độ là THỨ TỰ liên tục, không phải 10 loại khác nhau). */
export const LEVEL_COLUMN_COLOR = 'purple-5';

// ── Hình học biểu đồ ──────────────────────────────────────────────────────────

/**
 * Vành donut trong hệ toạ độ `viewBox` 100×100: bán kính đường tâm 40, bề dày 14 ⇒ mép ngoài 47 · mép trong 33
 * (lòng donut rộng 66% đường kính — đủ chỗ cho số tổng + nhãn ở tâm).
 */
export const DONUT_RING_RADIUS = 40;
export const DONUT_RING_WIDTH = 14;

/** Chừa bề ngang bên phải thanh cho nhãn số cuối thanh — đủ cho "123.456" ở cỡ chữ `base`. */
export const BAR_CHART_MARGIN_RIGHT = 52;
/** Bề rộng ước lượng của một ký tự nhãn trục theo cỡ chữ (em) — để đo trục danh mục đủ chứa nhãn dài nhất. */
export const CATEGORY_CHAR_WIDTH_EM = 0.54;
/** Đệm hai bên nhãn trục danh mục (px). */
export const CATEGORY_AXIS_PADDING = 12;
/** Trục danh mục không được ăn quá tỉ lệ này của bề ngang biểu đồ — nhãn dài hơn thì cắt "…" (tên đầy đủ nằm ở tooltip). */
export const CATEGORY_AXIS_MAX_RATIO = 0.46;
