/**
 * Thuật toán THUẦN của `coins` (không I/O — mẫu `modules/wallet/domain`): dấu hợp lệ theo loại giao dịch, hệ số cập nhật ví, trần ngày, ánh xạ nguồn XP → chỉ số nhiệm vụ,
 * dựng khoá tham chiếu. Xu là SỐ NGUYÊN — không có số thực ở bất kỳ bước nào (phí sàn xuống, cắt trần bằng `min`).
 */
import type { CoinQuestMetric, CoinSourceTypeValue, CoinTxTypeValue } from "../entities/coins.interface";
import { COIN_SOURCE_TYPES } from "../entities/coins.interface";

/** Thay đổi ví của MỘT dòng sổ cái — `balance` có dấu; `earned`/`spent` là hệ số cộng vào bộ đếm trọn đời (REFUND có thể âm). */
export interface WalletDelta {
  balance: number;
  earned: number;
  spent: number;
}

/**
 * Dấu `amount` hợp lệ theo loại: nhận (EARN_*) dương; tiêu (SPEND_*, BURN_FEE) âm; hoàn/điều chỉnh (REFUND, ADJUST_ADMIN) hai chiều. Luôn số nguyên khác 0 — chặn gọi nhầm
 * (vd `EARN_EVENT` với số âm sẽ TRỪ xu của người dùng qua đường "nhận").
 */
export function isValidAmount(type: CoinTxTypeValue, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount === 0) return false;
  switch (type) {
    case "EARN_EVENT":
    case "EARN_QUEST":
    case "EARN_SALE":
      return amount > 0;
    case "SPEND_SHOP":
    case "SPEND_MARKETPLACE":
    case "BURN_FEE":
      return amount < 0;
    case "REFUND":
    case "ADJUST_ADMIN":
      return true;
  }
}

/**
 * Hệ số cập nhật ví cho một dòng (đã qua `isValidAmount`). Điều chỉnh của admin KHÔNG tính vào "đã nhận/đã tiêu" (số liệu hiển thị cho người dùng phải phản ánh hoạt động thật);
 * hoàn xu (REFUND +) giảm "đã tiêu", thu hồi (REFUND −) giảm "đã nhận".
 */
export function walletDeltaOf(type: CoinTxTypeValue, amount: number): WalletDelta {
  switch (type) {
    case "EARN_EVENT":
    case "EARN_QUEST":
    case "EARN_SALE":
      return { balance: amount, earned: amount, spent: 0 };
    case "SPEND_SHOP":
    case "SPEND_MARKETPLACE":
    case "BURN_FEE":
      return { balance: amount, earned: 0, spent: -amount };
    case "REFUND":
      return amount > 0 ? { balance: amount, earned: 0, spent: -amount } : { balance: amount, earned: amount, spent: 0 };
    case "ADJUST_ADMIN":
      return { balance: amount, earned: 0, spent: 0 };
  }
}

export interface AwardInput {
  /** Xu của luật cho MỘT sự kiện. */
  ruleCoins: number;
  /** Trần ngày RIÊNG của luật (`null` = chỉ chịu trần chung). */
  ruleDailyCap: number | null;
  /** Đã thưởng hôm nay THEO luật này / TỔNG mọi luật. */
  earnedRuleToday: number;
  earnedToday: number;
  /** Trần chung hiệu lực (`LIMITS.coins.dailyEarnCap` ⊕ override admin). */
  globalCap: number;
}

/** Xu được thưởng sau khi áp cả hai trần: phần còn lại nếu chưa hết, 0 nếu đã hết (không âm). `capped` khi bị cắt bớt (kể cả về 0). */
export function awardWithCaps(input: AwardInput): { allowed: number; capped: boolean } {
  const ruleRoom = input.ruleDailyCap === null ? Number.POSITIVE_INFINITY : input.ruleDailyCap - input.earnedRuleToday;
  const globalRoom = input.globalCap - input.earnedToday;
  const allowed = Math.max(0, Math.min(input.ruleCoins, ruleRoom, globalRoom));
  return { allowed, capped: allowed < input.ruleCoins };
}

export const isCoinSource = (sourceType: string): sourceType is CoinSourceTypeValue => (COIN_SOURCE_TYPES as readonly string[]).includes(sourceType);

/**
 * Nguồn XP → chỉ số nhiệm vụ ngày. `SR_REVIEW` (XP 0, không phát `xp.awarded`) không có chỉ số. Nhiệm vụ chỉ đếm sự kiện ĐÃ được cộng XP thật nên thừa hưởng chống farm của XP
 * (tuổi tối thiểu của thẻ, trần ngày).
 */
export const QUEST_METRIC_BY_SOURCE: Readonly<Partial<Record<CoinSourceTypeValue, CoinQuestMetric>>> = {
  TASK_COMPLETED: "tasksDone",
  TASK_ON_TIME: "tasksOnTime",
  QUIZ_SCORED: "quizzesTaken",
  QUIZ_PASSED: "quizzesPassed",
  SR_REVIEW_DAY: "srReviewDays",
  REVIEW_SUBMITTED: "reviewsGiven",
  STUDY_SET_PUBLISHED: "setsPublished",
  POMODORO_CYCLE: "pomodoroCycles",
};

/** `XpEvent.dedupeKey` = `<sourceType>:<sourceId>:<userId>` — KHỚP `xpDedupeKey` của gamification (test đối chiếu hai bản). Là khoá idempotent của `CoinEarnEvent`. */
export const earnDedupeKey = (sourceType: string, sourceId: string, userId: string): string => `${sourceType}:${sourceId}:${userId}`;

/** `refId` dòng sổ cái thưởng theo sự kiện — `userId` đã nằm trong unique của sổ cái nên không lặp lại ở đây. */
export const xpRefId = (sourceType: string, sourceId: string): string => `${sourceType}:${sourceId}`;

/** `refId` dòng sổ cái nhận thưởng nhiệm vụ: một lần cho mỗi (nhiệm vụ, ngày địa phương). */
export const questRefId = (questId: string, date: string): string => `${questId}:${date}`;
