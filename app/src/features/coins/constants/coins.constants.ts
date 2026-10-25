import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import type { TabItemData } from '@/shared/ui/tab';

import type { CoinTxType, ShopItemKind } from '../api/coins.types';

/** Trang lịch sử xu (cursor). BE cho tối đa `LIMITS.pagination.max`; 20 giống lịch sử XP. */
export const TRANSACTIONS_PAGE_SIZE = 20;

/** `staleTime` ví (app.md p7-02 §4: 30 giây). Socket `gamification:updated.coins` đồng bộ nhanh giữa hai lần tải. */
export const WALLET_STALE_MS = 30_000;

/** Dòng nhắc bắt buộc ở mọi màn (app.md §7): xu là tiền ảo, không nạp/quy đổi. */
export const COINS_NOTE = 'Xu là điểm thưởng trong ứng dụng, không quy đổi ra tiền.';

/** Nhãn theo LOẠI dòng sổ cái (`EARN_EVENT` còn có nhãn chi tiết theo nguồn — `EARN_SOURCE_LABELS`). */
export const TX_TYPE_LABELS: Record<CoinTxType, string> = {
  ADJUST_ADMIN: 'Điều chỉnh từ quản trị viên',
  BURN_FEE: 'Phí nền tảng',
  EARN_EVENT: 'Thưởng hoạt động',
  EARN_QUEST: 'Thưởng nhiệm vụ ngày',
  EARN_SALE: 'Bán tài liệu',
  REFUND: 'Hoàn xu',
  SPEND_MARKETPLACE: 'Mua tài liệu',
  SPEND_SHOP: 'Mua vật phẩm ở cửa hàng',
};

/**
 * Ô icon theo LOẠI dòng sổ cái — mắt tách "nhận" khỏi "tiêu" trước khi đọc số. Nhận = tông ấm/thành công (`loyalty`, nhiệm
 * vụ `checkmark-circle`), tiêu = `basket-01`/`store` (tông `accent` như lối "Cửa hàng"), hệ thống = `neutral`. Dấu +/−
 * và chữ vẫn là nguồn nghĩa chính — màu chỉ là điểm nhấn.
 */
export const TX_TYPE_ART: Record<CoinTxType, { icon: IconName; tone: IconTileTone }> = {
  ADJUST_ADMIN: { icon: 'user-setting-1', tone: 'neutral' },
  BURN_FEE: { icon: 'bill', tone: 'neutral' },
  EARN_EVENT: { icon: 'loyalty', tone: 'success' },
  EARN_QUEST: { icon: 'checkmark-circle', tone: 'brand' },
  EARN_SALE: { icon: 'money', tone: 'success' },
  REFUND: { icon: 'reload', tone: 'info' },
  SPEND_MARKETPLACE: { icon: 'document', tone: 'warning' },
  SPEND_SHOP: { icon: 'basket-01', tone: 'accent' },
};

/** Nguồn XP được phép có luật thưởng xu (`COIN_SOURCE_TYPES` ở BE; `ADMIN_ADJUST` cố ý không có). Nguồn lạ ⇒ rơi về "Thưởng hoạt động". */
export const EARN_SOURCE_LABELS: Record<string, string> = {
  POMODORO_CYCLE: 'Hoàn thành một phiên tập trung',
  QUIZ_PASSED: 'Đạt bài kiểm tra',
  QUIZ_SCORED: 'Làm bài kiểm tra',
  REVIEW_SUBMITTED: 'Nộp nhận xét',
  SR_REVIEW: 'Ôn tập thẻ ghi nhớ',
  SR_REVIEW_DAY: 'Ôn tập đủ trong ngày',
  STUDY_SET_PUBLISHED: 'Đăng bộ học liệu',
  TASK_COMPLETED: 'Hoàn thành công việc',
  TASK_ON_TIME: 'Hoàn thành công việc đúng hạn',
};

/** Bộ lọc lịch sử: chỉ các loại P0 có thật (chợ tài liệu là P1 nên chưa có tab "Bán/Mua tài liệu"). `key: 'ALL'` = không lọc. */
export const TRANSACTION_FILTER_TABS: TabItemData[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'EARN_EVENT', label: 'Hoạt động' },
  { key: 'EARN_QUEST', label: 'Nhiệm vụ' },
  { key: 'SPEND_SHOP', label: 'Cửa hàng' },
  { key: 'ADJUST_ADMIN', label: 'Điều chỉnh' },
];

export const SHOP_KIND_LABELS: Record<ShopItemKind, string> = {
  AVATAR_FRAME: 'Khung ảnh đại diện',
  EMOJI_PACK: 'Gói emoji',
  PROFILE_THEME: 'Giao diện hồ sơ',
};

/** Icon nhóm vật phẩm (`Section icon` ở Kho đồ) — khung ảnh = người, giao diện = đũa phép, emoji = bong bóng chat. */
export const SHOP_KIND_ICONS: Record<ShopItemKind, IconName> = {
  AVATAR_FRAME: 'user-circle',
  EMOJI_PACK: 'chat-bubble',
  PROFILE_THEME: 'magic-wand-01',
};

/** Thứ tự tab cửa hàng/nhóm kho đồ (app.md §1: Khung · Theme · Emoji). */
export const SHOP_KINDS: ShopItemKind[] = ['AVATAR_FRAME', 'PROFILE_THEME', 'EMOJI_PACK'];

export const SHOP_KIND_TABS: TabItemData[] = [
  { key: 'AVATAR_FRAME', label: 'Khung' },
  { key: 'PROFILE_THEME', label: 'Giao diện' },
  { key: 'EMOJI_PACK', label: 'Emoji' },
];
