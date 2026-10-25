/**
 * Entity domain của `coins` (p7-02) — khai ĐỘC LẬP với Prisma (khớp model cùng tên), tầng domain không import kiểu Prisma. Xu là SỐ NGUYÊN ẢO: không quy đổi ra tiền thật,
 * không liên quan ví chi tiêu nhóm (`modules/wallet`, p6-04).
 */
export const COIN_TX_TYPES = ["EARN_EVENT", "EARN_QUEST", "SPEND_SHOP", "SPEND_MARKETPLACE", "EARN_SALE", "BURN_FEE", "REFUND", "ADJUST_ADMIN"] as const;
export type CoinTxTypeValue = (typeof COIN_TX_TYPES)[number];

/** Loại tham chiếu của dòng sổ cái — cùng `type` + `refId` khác `refType` là hai giao dịch khác nhau. */
export const COIN_REF_TYPES = ["XP_EVENT", "QUEST", "SHOP_ITEM", "ADMIN", "PURCHASE", "LISTING"] as const;
export type CoinRefTypeValue = (typeof COIN_REF_TYPES)[number];

export const SHOP_ITEM_KINDS = ["AVATAR_FRAME", "PROFILE_THEME", "EMOJI_PACK"] as const;
export type ShopItemKindValue = (typeof SHOP_ITEM_KINDS)[number];

/**
 * Nguồn XP được phép có luật thưởng xu (khớp `XpSourceType` của gamification). ⛔ `ADMIN_ADJUST` cố ý KHÔNG có: `xp.awarded` do admin điều chỉnh XP tay vẫn được phát nhưng
 * không được đẻ ra xu (chống admin/kẻ chiếm quyền admin in xu qua đường XP).
 */
export const COIN_SOURCE_TYPES = ["TASK_COMPLETED", "TASK_ON_TIME", "QUIZ_SCORED", "QUIZ_PASSED", "SR_REVIEW", "SR_REVIEW_DAY", "REVIEW_SUBMITTED", "STUDY_SET_PUBLISHED", "POMODORO_CYCLE"] as const;
export type CoinSourceTypeValue = (typeof COIN_SOURCE_TYPES)[number];

/** Chỉ số đếm của nhiệm vụ ngày — đếm từ `xp.awarded` (XP thật > 0), nên thừa hưởng chống farm của XP. */
export const COIN_QUEST_METRICS = ["tasksDone", "tasksOnTime", "quizzesTaken", "quizzesPassed", "srReviewDays", "reviewsGiven", "setsPublished", "pomodoroCycles"] as const;
export type CoinQuestMetric = (typeof COIN_QUEST_METRICS)[number];

export interface CoinWallet {
  id: string;
  userId: string;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  type: CoinTxTypeValue;
  refType: CoinRefTypeValue;
  refId: string;
  balanceAfter: number;
  counterpartyId: string | null;
  note: string | null;
  actorId: string | null;
  at: Date;
}

/** Khoá idempotent của một dòng sổ cái — trùng cả bốn trường = cùng một giao dịch. */
export interface CoinLedgerKey {
  type: CoinTxTypeValue;
  refType: CoinRefTypeValue;
  refId: string;
  userId: string;
}

export interface CoinTransactionInsert extends CoinLedgerKey {
  amount: number;
  balanceAfter: number;
  counterpartyId: string | null;
  note: string | null;
  actorId: string | null;
}

export interface CoinEarnEvent {
  id: string;
  dedupeKey: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  localDate: string;
  coins: number;
  capped: boolean;
  at: Date;
}

export type CoinEarnEventInsert = Omit<CoinEarnEvent, "id" | "at">;

export interface CoinRule {
  id: string;
  sourceType: CoinSourceTypeValue;
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface CoinRuleWrite {
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
}

export interface CoinQuest {
  id: string;
  code: string;
  title: string;
  description: string;
  metric: CoinQuestMetric;
  target: number;
  coins: number;
  isActive: boolean;
  order: number;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export type CoinQuestWrite = Omit<CoinQuest, "id" | "version" | "updatedBy" | "updatedAt">;

export interface QuestProgress {
  id: string;
  userId: string;
  questId: string;
  date: string;
  progress: number;
  claimedAt: Date | null;
}

export interface ShopItem {
  id: string;
  code: string;
  name: string;
  kind: ShopItemKindValue;
  price: number;
  assetId: string | null;
  data: Record<string, unknown> | null;
  isActive: boolean;
  availableFrom: Date | null;
  availableTo: Date | null;
  version: number;
  updatedBy: string | null;
  createdAt: Date;
}

export type ShopItemWrite = Omit<ShopItem, "id" | "version" | "updatedBy" | "createdAt">;

export interface InventoryItem {
  id: string;
  userId: string;
  itemId: string;
  kind: ShopItemKindValue;
  equipped: boolean;
  acquiredAt: Date;
}

/** Người dùng tối thiểu cho thưởng xu: múi giờ hợp lệ + trạng thái (không email/điện thoại). */
export interface CoinUser {
  timezone: string;
  status: string;
}

// ── marketplace (p7-02 P1) ──────────────────────────────────────────────────

export const LISTING_CONTENT_TYPES = ["STUDY_SET", "RESOURCE"] as const;
export type ListingContentTypeValue = (typeof LISTING_CONTENT_TYPES)[number];

export const LISTING_STATUSES = ["PENDING_REVIEW", "ACTIVE", "HIDDEN", "WITHDRAWN"] as const;
export type ListingStatusValue = (typeof LISTING_STATUSES)[number];

/** Lý do báo cáo một tin niêm yết — bản riêng của `coins` (KHÔNG import `REPORT_REASONS` của `moderation`, xem `coins.errors.ts`/báo cáo bàn giao P1). */
export const LISTING_REPORT_REASONS = ["COPYRIGHT", "SPAM", "INAPPROPRIATE", "WRONG_CONTENT", "OTHER"] as const;
export type ListingReportReasonValue = (typeof LISTING_REPORT_REASONS)[number];

export interface MarketplaceListing {
  id: string;
  sellerId: string;
  contentType: ListingContentTypeValue;
  contentId: string;
  title: string;
  normalizedTitle: string;
  description: string | null;
  tags: string[];
  price: number;
  status: ListingStatusValue;
  sales: number;
  reportCount: number;
  hiddenReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ListingCreateInput = Omit<MarketplaceListing, "id" | "sales" | "reportCount" | "version" | "createdAt" | "updatedAt">;

/** Patch CAS (`updateIf`) — KHÔNG có `contentType`/`contentId`/`sellerId` (bất biến sau khi tạo). */
export type ListingPatch = Partial<Pick<MarketplaceListing, "title" | "normalizedTitle" | "description" | "tags" | "price">>;

export interface MarketplacePurchase {
  id: string;
  listingId: string;
  buyerId: string;
  price: number;
  fee: number;
  accessRef: string | null;
  refundedAt: Date | null;
  createdAt: Date;
}

export type PurchaseCreateInput = Pick<MarketplacePurchase, "listingId" | "buyerId" | "price" | "fee">;
