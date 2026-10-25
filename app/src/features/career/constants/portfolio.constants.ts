import type {
  PortfolioAccent,
  PortfolioBuildStatus,
  PortfolioSectionKind,
  PortfolioTemplate,
} from '../api/portfolio.types';

/**
 * `FALLBACK_PORTFOLIO_LIMITS` CHÉP từ `LIMITS.portfolio` của BE (`be/src/core/constants/limits.ts`, p6-07 README §7) và dùng khi `capabilities.limits`
 * chưa mang nhóm `portfolio` — đổi số bên BE thì đổi Ở ĐÂY theo, đây là bản SAO chứ không phải nguồn (cùng cách `FALLBACK_REVIEW_LIMITS` của `boards`).
 */
export const FALLBACK_PORTFOLIO_LIMITS = {
  bioMax: 600,
  displayNameMax: 60,
  displayNameMin: 2,
  headlineMax: 120,
  highlightMax: 160,
  highlightsMax: 3,
  linkLabelMax: 30,
  linksMax: 6,
  linkUrlMax: 300,
  projectsMax: 12,
  projectTitleMax: 80,
  projectTitleMin: 2,
  refreshPerHour: 10,
  roleMax: 60,
  slugMax: 30,
  slugMin: 3,
  summaryMax: 500,
} as const;

export const PORTFOLIO_TEMPLATES: readonly PortfolioTemplate[] = [
  'CLASSIC',
  'DEVELOPER',
  'DESIGNER',
  'MINIMAL',
];
export const PORTFOLIO_ACCENTS: readonly PortfolioAccent[] = [
  'GREEN',
  'BLUE',
  'VIOLET',
  'ORANGE',
  'ROSE',
  'SLATE',
];
export const PORTFOLIO_SECTION_KINDS: readonly PortfolioSectionKind[] = [
  'ABOUT',
  'PROJECTS',
  'SKILLS',
  'CONTACT',
];

/** Mặc định của BE (`DEFAULT_THEME`) khi tạo hồ sơ lần đầu. */
export const DEFAULT_THEME: { template: PortfolioTemplate; accent: PortfolioAccent } = {
  accent: 'GREEN',
  template: 'CLASSIC',
};

/** `-readonly`: `as const` làm mọi khoá chỉ-đọc, còn `readPortfolioLimits` ghi đè từng khoá bằng giá trị từ capabilities. */
export type PortfolioLimits = { -readonly [K in keyof typeof FALLBACK_PORTFOLIO_LIMITS]: number };

/** Khớp `SLUG_REGEX` của BE (`entities/portfolio.rules.ts`): 3–30 ký tự chữ thường/số/`-`, không `--`, không đầu/cuối `-`. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,28}[a-z0-9]$/;

/** Kiểm slug: đợi người dùng NGỪNG gõ (BE giới hạn 60 lượt/phút). */
export const SLUG_CHECK_DEBOUNCE_MS = 500;

/** Nhịp hỏi `builds/latest` khi đang dựng trang: 5 giây nếu MẤT socket (dự phòng), 20 giây khi socket còn nối (lưới an toàn nếu lỡ một sự kiện). */
export const BUILD_POLL_MS = 5_000;
export const BUILD_POLL_CONNECTED_MS = 20_000;

/** Bề rộng viewport giả lập khi xem trước ở chế độ "Máy tính bảng" (dp). Điện thoại = bề rộng WebView thật. */
export const PREVIEW_TABLET_WIDTH = 820;

export const SECTION_LABELS: Record<PortfolioSectionKind, string> = {
  ABOUT: 'Giới thiệu',
  CONTACT: 'Liên hệ',
  PROJECTS: 'Dự án',
  SKILLS: 'Huy hiệu kỹ năng',
};

export const SECTION_HINTS: Record<PortfolioSectionKind, string> = {
  ABOUT: 'Đoạn giới thiệu bản thân bạn viết.',
  CONTACT: 'Các liên kết https:// bạn thêm ở mục Thông tin.',
  PROJECTS: 'Dự án bạn chọn, kèm số liệu hệ thống ghi nhận.',
  SKILLS: 'Huy hiệu kỹ năng đã xác thực (nếu bạn cho phép hiện).',
};

/** Nhãn dự phòng khi `GET /portfolio/templates` chưa về — tên/mô tả THẬT do BE trả, đây chỉ để `TemplatePicker` không trống. */
export const ACCENT_LABELS: Record<PortfolioAccent, string> = {
  BLUE: 'Xanh dương',
  GREEN: 'Xanh lá',
  ORANGE: 'Cam',
  ROSE: 'Hồng',
  SLATE: 'Xám',
  VIOLET: 'Tím',
};

export const TEMPLATE_LABELS: Record<PortfolioTemplate, string> = {
  CLASSIC: 'Cổ điển',
  DESIGNER: 'Nhà thiết kế',
  DEVELOPER: 'Lập trình viên',
  MINIMAL: 'Tối giản',
};

export const BUILD_STATUS_LABELS: Record<PortfolioBuildStatus, string> = {
  BUILDING: 'Đang tạo trang…',
  FAILED: 'Tạo trang chưa thành công',
  QUEUED: 'Đang xếp hàng tạo trang…',
  READY: 'Trang đã sẵn sàng',
};
