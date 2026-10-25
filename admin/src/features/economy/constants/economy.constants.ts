import type {
  CoinQuestMetric,
  CoinSourceType,
  CoinTxType,
  ShopItemKind,
} from '../types/economy.types';

/** Cờ tính năng của phân hệ (`capabilities.features`) — tắt thì tab "Kinh tế xu" ẩn khỏi trang Gamification. */
export const ECONOMY_FEATURE_FLAG = 'coins';

/** Số liệu chưa có (đang tải / lỗi) — không bao giờ hiện `0` thay cho "chưa biết" (`api-patterns.md`). */
export const NO_DATA = '—';

// ── Nhóm chức năng (URL `?section=`) ─────────────────────────────────────────

export const ECONOMY_SECTION_PARAM = 'section';
export const DEFAULT_ECONOMY_SECTION = 'overview';

export const ECONOMY_SECTIONS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'wallet', label: 'Ví người dùng' },
  { key: 'shop', label: 'Cửa hàng' },
  { key: 'rules', label: 'Quy tắc thưởng' },
  { key: 'quests', label: 'Nhiệm vụ ngày' },
  { key: 'marketplace', label: 'Chợ' },
] as const;

/** Đổi nhóm thì xoá mọi bộ lọc của nhóm cũ — khỏi rơi sang nhóm mới với `?type=`/`?kind=` không thuộc về nó. */
export const CLEAR_SECTION_PARAMS: Record<string, null> = {
  days: null,
  userId: null,
  type: null,
  kind: null,
  search: null,
  page: null,
  pageSize: null,
};

// ── Giới hạn — khớp `be/src/core/constants/limits.ts` (`LIMITS.coins`, `LIMITS.shop`) ──

export const COIN_LIMITS = {
  /** Trần điều chỉnh ví một lần (BE chặn cứng, 60 lần/giờ/admin). */
  adjustMax: 100_000,
  /** Từ mức này trở lên phải tích ô xác nhận "điều chỉnh lớn" trước khi gửi (chỉ là chốt an toàn phía UI). */
  adjustLargeConfirm: 10_000,
  ruleCoinsMax: 1_000,
  /** Trần nhận xu mỗi ngày chung — trần của một luật không được vượt. */
  dailyEarnCap: 200,
  questCoinsMax: 1_000,
  questTargetMax: 100,
  questTitleMax: 80,
  questDescriptionMax: 300,
  questOrderMax: 1_000,
  shopPriceMax: 10_000,
  shopNameMax: 60,
  shopCodeMax: 40,
  emojiPackMax: 30,
  emojiMaxLength: 16,
} as const;

/** Mã vật phẩm/nhiệm vụ: a-z, 0-9, dấu gạch ngang, không bắt đầu/kết thúc bằng dấu gạch (BE `itemCode`/`questCode`). */
export const CODE_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

/** Màu mặc định của form vật phẩm — là DỮ LIỆU người dùng chọn rồi lưu (ngoại lệ hợp lệ của `color-system.md`), không phải màu giao diện. */
export const DEFAULT_ITEM_COLORS = {
  frame: '#F59E0B',
  primary: '#22C55E',
  accent: '#3B82F6',
} as const;

// ── Tổng quan ────────────────────────────────────────────────────────────────

export const OVERVIEW_DAYS_PARAM = 'days';
export const OVERVIEW_DEFAULT_DAYS = 7;
export const OVERVIEW_DAY_OPTIONS = [
  { key: '7', label: '7 ngày' },
  { key: '14', label: '14 ngày' },
  { key: '30', label: '30 ngày' },
] as const;

/** Màu series biểu đồ — CHỈ token scale `-5` (`chart-conventions.md §1.2`). */
export const ECONOMY_CHART_COLORS = {
  issued: 'success-5',
  spent: 'warning-5',
} as const;

/** Nhãn series (khoá = `dataKey`) cho tooltip và chú giải. */
export const ECONOMY_SERIES_LABELS: Record<string, string> = {
  issued: 'Xu phát hành',
  spent: 'Xu đã tiêu',
};

/** Chiều cao vùng vẽ — `useChartMetrics` chọn bậc mật độ theo chiều cao THỰC của vùng này. */
export const ECONOMY_CHART_HEIGHT_CLASS = 'h-64';

// ── Sổ cái / bảng ────────────────────────────────────────────────────────────

export const LEDGER_PAGE_SIZE = 20;
export const SHOP_PAGE_SIZE = 12;
/** Chợ tài liệu (P1) — trang tin chờ duyệt. */
export const PENDING_LISTINGS_PAGE_SIZE = 20;
export const ALL_FILTER = 'all';
export const USER_SEARCH_LIMIT = 8;
/** Số ký tự tối thiểu để bắt đầu tìm người dùng theo tên/email. */
export const USER_SEARCH_MIN_LENGTH = 2;
export const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// ── Nhãn tiếng Việt ──────────────────────────────────────────────────────────

export const COIN_TX_TYPE_LABELS: Record<CoinTxType, string> = {
  EARN_EVENT: 'Thưởng sự kiện',
  EARN_QUEST: 'Thưởng nhiệm vụ',
  SPEND_SHOP: 'Mua ở cửa hàng',
  SPEND_MARKETPLACE: 'Mua ở chợ',
  EARN_SALE: 'Bán ở chợ',
  BURN_FEE: 'Phí chợ (đốt)',
  REFUND: 'Hoàn xu',
  ADJUST_ADMIN: 'Admin điều chỉnh',
};

export const SHOP_ITEM_KIND_LABELS: Record<ShopItemKind, string> = {
  AVATAR_FRAME: 'Khung avatar',
  PROFILE_THEME: 'Giao diện hồ sơ',
  EMOJI_PACK: 'Gói emoji',
};

/** Loại nội dung niêm yết (chợ tài liệu, P1) — `ListingContentType` BE. */
export const CONTENT_TYPE_LABELS: Record<'STUDY_SET' | 'RESOURCE', string> = {
  STUDY_SET: 'Bộ học',
  RESOURCE: 'Tài liệu',
};

/** Nhãn + gợi ý cho nguồn XP có luật thưởng xu (`COIN_SOURCE_TYPES` BE). */
export const COIN_SOURCE_LABELS: Record<CoinSourceType, { label: string; hint: string }> = {
  TASK_COMPLETED: { label: 'Hoàn thành task', hint: 'Sau khi XP task được ghi nhận' },
  TASK_ON_TIME: { label: 'Hoàn thành đúng hạn', hint: 'Thưởng thêm khi xong trước hạn' },
  QUIZ_SCORED: { label: 'Làm bài kiểm tra', hint: 'Mỗi bài có điểm' },
  QUIZ_PASSED: { label: 'Đạt bài kiểm tra', hint: 'Vượt ngưỡng đạt' },
  SR_REVIEW: { label: 'Ôn thẻ', hint: 'Mỗi lượt ôn thẻ lặp lại ngắt quãng' },
  SR_REVIEW_DAY: { label: 'Ôn tập trong ngày', hint: 'Hoàn thành phiên ôn của ngày' },
  REVIEW_SUBMITTED: { label: 'Gửi đánh giá', hint: 'Gửi đánh giá/nhận xét' },
  STUDY_SET_PUBLISHED: { label: 'Công khai bộ học', hint: 'Bộ học được công khai' },
  POMODORO_CYCLE: { label: 'Chu kỳ Pomodoro', hint: 'Chưa có XP nên chưa phát sinh' },
};

export const COIN_QUEST_METRIC_LABELS: Record<CoinQuestMetric, string> = {
  tasksDone: 'Task hoàn thành',
  tasksOnTime: 'Task đúng hạn',
  quizzesTaken: 'Bài kiểm tra đã làm',
  quizzesPassed: 'Bài kiểm tra đạt',
  srReviewDays: 'Ngày ôn tập',
  reviewsGiven: 'Đánh giá đã gửi',
  setsPublished: 'Bộ học công khai',
  pomodoroCycles: 'Chu kỳ Pomodoro',
};

export const COIN_SOURCE_TYPES = Object.keys(COIN_SOURCE_LABELS) as CoinSourceType[];
export const COIN_TX_TYPES = Object.keys(COIN_TX_TYPE_LABELS) as CoinTxType[];
export const SHOP_ITEM_KINDS = Object.keys(SHOP_ITEM_KIND_LABELS) as ShopItemKind[];
const COIN_QUEST_METRICS = Object.keys(COIN_QUEST_METRIC_LABELS) as CoinQuestMetric[];

/** Ô lọc loại giao dịch của sổ cái — "Mọi loại" dùng giá trị `all` vì Radix Select không nhận chuỗi rỗng. */
export const COIN_TX_TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_FILTER, label: 'Mọi loại giao dịch' },
  ...COIN_TX_TYPES.map((type) => ({ value: type, label: COIN_TX_TYPE_LABELS[type] })),
];

export const SHOP_KIND_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL_FILTER, label: 'Mọi loại vật phẩm' },
  ...SHOP_ITEM_KINDS.map((kind) => ({ value: kind, label: SHOP_ITEM_KIND_LABELS[kind] })),
];

/** Lựa chọn "Loại" của form vật phẩm / nhiệm vụ. */
export const SHOP_ITEM_KIND_OPTIONS: Array<{ value: string; label: string }> = SHOP_ITEM_KINDS.map(
  (kind) => ({
    value: kind,
    label: SHOP_ITEM_KIND_LABELS[kind],
  }),
);

export const COIN_QUEST_METRIC_OPTIONS: Array<{ value: string; label: string }> =
  COIN_QUEST_METRICS.map((metric) => ({
    value: metric,
    label: COIN_QUEST_METRIC_LABELS[metric],
  }));
