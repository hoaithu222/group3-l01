import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  ExpenseCategory,
  SettlementMethod,
  SettlementStatus,
  ShareStatus,
  SplitType,
} from '../api/wallet.types';

/**
 * Hằng số của ví nhóm. Số giới hạn khớp `LIMITS.wallet` phía BE (p6-04
 * README §7) — BE vẫn là nơi quyết cuối cùng, client chỉ chặn sớm để người dùng
 * không phải chờ một lượt gọi API mới biết mình gõ quá trần.
 */
export const WALLET_LIMITS = {
  expenseMax: 100_000_000,
  participantsMax: 50,
  descriptionMax: 200,
  settlementNoteMax: 200,
  rejectReasonMin: 3,
  reminderMinDebtMax: 1_000_000,
  paymentProfilesMax: 3,
  /** Tổng basis points của kiểu chia PERCENT. */
  bpsTotal: 10_000,
} as const;

/** Số khoản chi hiện ở dashboard ("5 khoản chi gần nhất"). */
export const RECENT_EXPENSES_COUNT = 5;

export const EXPENSE_CATEGORIES: readonly { value: ExpenseCategory; label: string }[] = [
  { value: 'FOOD', label: 'Ăn uống' },
  { value: 'PRINTING', label: 'In ấn' },
  { value: 'SERVER', label: 'Máy chủ' },
  { value: 'TRANSPORT', label: 'Di chuyển' },
  { value: 'MATERIAL', label: 'Vật liệu' },
  { value: 'OTHER', label: 'Khác' },
];

export function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((item) => item.value === value)?.label ?? 'Khác';
}

/**
 * Ô icon theo DANH MỤC khoản chi (dòng khoản chi, đầu chi tiết) — nhìn lướt lịch sử là thấy "ăn uống" khác "in ấn". Bộ icon không có
 * "đồ ăn"/"máy chủ" đúng nghĩa ⇒ chọn gần nhất: `popcorn` (ăn uống), `lap` (màn hình máy tính — máy chủ). ⚠️ Chỉ BỔ TRỢ: chữ danh mục
 * luôn nằm ở dòng phụ ngay cạnh. Mã lạ (BE thêm mới) rơi về ô của "Khác".
 */
const CATEGORY_VISUAL: Record<ExpenseCategory, { icon: IconName; tone: IconTileTone }> = {
  FOOD: { icon: 'popcorn', tone: 'warning' },
  PRINTING: { icon: 'document-2', tone: 'success' },
  SERVER: { icon: 'lap', tone: 'info' },
  TRANSPORT: { icon: 'bus', tone: 'brand' },
  MATERIAL: { icon: 'basket-01', tone: 'accent' },
  OTHER: { icon: 'bill', tone: 'neutral' },
};

export function categoryVisual(value: string): { icon: IconName; tone: IconTileTone } {
  // Tra qua `Partial<Record<string, …>>`: `category` từ server là chuỗi trơn, mã lạ phải ra `undefined` chứ không phải kiểu "luôn có".
  const byCode: Partial<Record<string, { icon: IconName; tone: IconTileTone }>> = CATEGORY_VISUAL;
  return byCode[value] ?? CATEGORY_VISUAL.OTHER;
}

/** Ô icon theo PHƯƠNG THỨC trả (lịch sử thanh toán) — tông lấy theo TRẠNG THÁI ở nơi vẽ, icon nói "trả bằng gì". */
export const SETTLEMENT_METHOD_ICON: Record<SettlementMethod, IconName> = {
  BANK: 'bank',
  CASH: 'money',
  OTHER: 'arrow-data-transfer-vertical',
};

/** Tông ô icon theo trạng thái thanh toán — cặp với `Badge` trạng thái (`error` của huy hiệu ↔ `danger` của ô). */
export const SETTLEMENT_STATUS_TONE: Record<SettlementStatus, IconTileTone> = {
  CANCELLED: 'neutral',
  CONFIRMED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
};

export const SPLIT_TYPE_LABEL: Record<SplitType, string> = {
  EQUAL: 'Chia đều',
  CUSTOM: 'Tuỳ chỉnh',
  PERCENT: 'Theo %',
};

export const SETTLEMENT_METHOD_LABEL: Record<SettlementMethod, string> = {
  BANK: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  OTHER: 'Khác',
};

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  REJECTED: 'Bị từ chối',
  CANCELLED: 'Đã huỷ',
};

export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = {
  UNPAID: 'Chưa trả',
  PARTIAL: 'Một phần',
  PAID: 'Đã trả',
  VOID: 'Đã huỷ',
};

/** Mã lỗi BE của module (`be/src/core/utils/error.codes.ts`) mà UI rẽ nhánh theo. */
export const WALLET_ERROR = {
  /** `details.invalidUserIds` — người không thuộc nhóm. */
  invalidParticipant: 'WALLET_001',
  splitMismatch: 'WALLET_002',
  assetNotReady: 'WALLET_003',
  /** 409 — khoản đã có người thanh toán: sửa/xoá bị chặn, chỉ điều chỉnh được. */
  expenseLocked: 'WALLET_004',
  overDebt: 'WALLET_005',
  selfSettlement: 'WALLET_006',
  /** 409 — settlement không còn PENDING. */
  settlementNotPending: 'WALLET_007',
  invalidReminderTarget: 'WALLET_008',
  profileLimit: 'WALLET_009',
  /** 429 — nhắc quá dày (1 lần/giờ). */
  remindTooOften: 'WALLET_010',
} as const;

/** Thứ trong tuần theo quy ước cron (0 = Chủ nhật) — ĐÚNG với `weeklyCronSchema` của BE (`[0-6]`). */
export const CRON_WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 1, label: 'Thứ Hai' },
  { value: 2, label: 'Thứ Ba' },
  { value: 3, label: 'Thứ Tư' },
  { value: 4, label: 'Thứ Năm' },
  { value: 5, label: 'Thứ Sáu' },
  { value: 6, label: 'Thứ Bảy' },
  { value: 0, label: 'Chủ nhật' },
];

/** Lịch mặc định `wallet.defaultReminderCron` (SystemConfig) — 09:00 thứ Sáu. */
export const DEFAULT_REMINDER = { weekday: 5, hour: 9, minute: 0 } as const;
