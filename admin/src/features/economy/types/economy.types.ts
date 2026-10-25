/**
 * Kiểu dữ liệu kinh tế xu (admin p7-02) — viết tay theo BE thật `be/src/modules/coins`:
 * `services/economy-admin.service.ts` (`OverviewDto`), `services/coins-presenter.ts` (`WalletDto`, `AdminCoinTransactionDto`,
 * `AdminShopItemDto`, `AdminRuleDto`, `AdminQuestDto`), `dtos/admin-economy.dto.ts` (payload ghi). Ngày là chuỗi ISO. Đổi hợp đồng ở BE thì đối chiếu lại file này.
 */
import type { CursorMeta } from '@/shared/types/api.types';

/** `CoinTxType` — loại dòng sổ cái. */
export type CoinTxType =
  | 'EARN_EVENT'
  | 'EARN_QUEST'
  | 'SPEND_SHOP'
  | 'SPEND_MARKETPLACE'
  | 'EARN_SALE'
  | 'BURN_FEE'
  | 'REFUND'
  | 'ADJUST_ADMIN';

export type ShopItemKind = 'AVATAR_FRAME' | 'PROFILE_THEME' | 'EMOJI_PACK';

/** Nguồn XP được phép có luật thưởng xu (`COIN_SOURCE_TYPES` BE — KHÔNG có `ADMIN_ADJUST`). */
export type CoinSourceType =
  | 'TASK_COMPLETED'
  | 'TASK_ON_TIME'
  | 'QUIZ_SCORED'
  | 'QUIZ_PASSED'
  | 'SR_REVIEW'
  | 'SR_REVIEW_DAY'
  | 'REVIEW_SUBMITTED'
  | 'STUDY_SET_PUBLISHED'
  | 'POMODORO_CYCLE';

/** Chỉ số đếm của nhiệm vụ ngày (`COIN_QUEST_METRICS` BE). */
export type CoinQuestMetric =
  | 'tasksDone'
  | 'tasksOnTime'
  | 'quizzesTaken'
  | 'quizzesPassed'
  | 'srReviewDays'
  | 'reviewsGiven'
  | 'setsPublished'
  | 'pomodoroCycles';

// ── Tổng quan ────────────────────────────────────────────────────────────────

export interface EconomyDayTotals {
  /** Xu MỚI phát ra (thưởng sự kiện + nhiệm vụ). */
  issued: number;
  /** Xu người dùng đã tiêu (cửa hàng + chợ), số dương. */
  spent: number;
  /** Xu bị đốt (phí chợ), số dương. */
  burned: number;
  /** Điều chỉnh thủ công ròng của admin (có dấu). */
  adjusted: number;
}

export interface EconomyDayPoint extends EconomyDayTotals {
  /** `YYYY-MM-DD` (giờ VN). */
  date: string;
}

/** `ReconcileReport` BE — lần đối soát gần nhất; `mismatched > 0` ⇒ cảnh báo (KHÔNG tự sửa). */
export interface ReconcileReport {
  at: string;
  checked: number;
  mismatched: number;
  sampleUserIds: string[];
}

export interface EconomyTopItem {
  itemId: string;
  code: string;
  name: string;
  owners: number;
}

/** `GET /admin/economy/overview?days`. */
export interface EconomyOverviewData {
  days: number;
  totals: EconomyDayTotals;
  perDay: EconomyDayPoint[];
  /** Σ số dư mọi ví — số xu đang lưu hành. */
  circulating: number;
  topItems: EconomyTopItem[];
  /** `null` = chưa chạy / báo cáo đã hết hạn. */
  reconcile: ReconcileReport | null;
}

// ── Ví và sổ cái ─────────────────────────────────────────────────────────────

/** `GET /admin/economy/users/:userId/wallet`. */
export interface CoinWalletSummary {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  /** Xu nhận từ sự kiện trong ngày địa phương của người đó. */
  todayEarned: number;
  /** Trần nhận xu mỗi ngày hiệu lực. */
  dailyCap: number;
}

export interface AdminCoinTransaction {
  id: string;
  type: CoinTxType;
  /** Có dấu: + nhận, − tiêu. */
  amount: number;
  balanceAfter: number;
  refType: string;
  refId: string;
  at: string;
  /** Lý do điều chỉnh của admin (chỉ dòng `ADJUST_ADMIN`). */
  note: string | null;
  actorId: string | null;
  counterpartyId: string | null;
}

/** Trang sổ cái (cursor) — `{ data, meta }` của BE. */
export interface CoinTxPage {
  data: AdminCoinTransaction[];
  meta: CursorMeta;
}

export interface WalletTxParams {
  userId: string;
  type?: CoinTxType;
  cursor?: string;
  limit: number;
}

export interface AdjustCoinsPayload {
  userId: string;
  amount: number;
  reason: string;
  /** Header `Idempotency-Key` (BẮT BUỘC ở BE). */
  idempotencyKey: string;
}

export interface AdjustCoinsResult {
  balance: number;
  delta: number;
  /** `true` = khoá này đã được xử lý trước đó, không cộng lần hai. */
  replayed: boolean;
}
