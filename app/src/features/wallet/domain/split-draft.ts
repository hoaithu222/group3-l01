import type {
  ExpenseParticipantView,
  SplitParticipantPayload,
  SplitType,
} from '../api/wallet.types';
import { WALLET_LIMITS } from '../constants/wallet.constants';

/**
 * Bản NHÁP chia tiền trên form: giữ đủ cả ba kiểu cùng lúc để đổi qua lại
 * EQUAL ↔ CUSTOM ↔ PERCENT không làm mất số người dùng đã gõ ở kiểu kia.
 * `null` = ô còn trống (chưa gõ) — khác với `0` do người dùng chủ động nhập.
 */
export interface SplitDraft {
  splitType: SplitType;
  /** Người được chọn tham gia, theo thứ tự chọn. */
  selected: string[];
  /** CUSTOM: số tiền (đồng) theo userId. */
  custom: Record<string, number | null>;
  /** PERCENT: basis points (1% = 100) theo userId. */
  percent: Record<string, number | null>;
}

export function createSplitDraft(memberIds: string[]): SplitDraft {
  return { splitType: 'EQUAL', selected: [...memberIds], custom: {}, percent: {} };
}

/** Dựng lại nháp từ khoản chi có sẵn (màn Sửa/Điều chỉnh). */
export function draftFromParticipants(
  splitType: SplitType,
  participants: readonly ExpenseParticipantView[],
): SplitDraft {
  return {
    splitType,
    selected: participants.map((p) => p.userId),
    custom: Object.fromEntries(participants.map((p) => [p.userId, p.amount])),
    percent: Object.fromEntries(participants.map((p) => [p.userId, p.bps])),
  };
}

/**
 * Nháp → `participants` gửi BE. ⚠️ BE (`refineSplitShape`) từ chối nếu kiểu chia
 * và trường không khớp: EQUAL KHÔNG kèm `amount`/`bps`, CUSTOM cần `amount` của
 * MỌI người, PERCENT cần `bps` của mọi người. Ô trống được coi là 0 ở đây — tổng
 * sai sẽ bị `previewSplit` báo và khoá nút Lưu trước khi tới BE.
 */
export function draftToParticipants(draft: SplitDraft): SplitParticipantPayload[] {
  return draft.selected.map((userId) => {
    if (draft.splitType === 'CUSTOM') return { userId, amount: draft.custom[userId] ?? 0 };
    if (draft.splitType === 'PERCENT') return { userId, bps: draft.percent[userId] ?? 0 };
    return { userId };
  });
}

/**
 * Chia `total` cho `ids` sao cho TỔNG đúng bằng `total`: mỗi người `floor`, phần
 * dư rải mỗi người +1 từ đầu danh sách. Dùng cho nút "Chia đều" của CUSTOM/PERCENT
 * — điểm xuất phát HỢP LỆ để người dùng chỉnh tiếp thay vì bắt đầu từ ô trống.
 */
export function distributeEvenly(total: number, ids: readonly string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = Math.floor(total / ids.length);
  const extra = total - base * ids.length;
  return Object.fromEntries(ids.map((id, index) => [id, base + (index < extra ? 1 : 0)]));
}

export function evenPercent(ids: readonly string[]): Record<string, number> {
  return distributeEvenly(WALLET_LIMITS.bpsTotal, ids);
}

/** Bỏ người khỏi danh sách; dọn luôn số đã gõ của họ để không rò vào tổng. */
export function toggleParticipant(draft: SplitDraft, userId: string): SplitDraft {
  const selected = draft.selected.includes(userId)
    ? draft.selected.filter((id) => id !== userId)
    : [...draft.selected, userId];
  return { ...draft, selected };
}
