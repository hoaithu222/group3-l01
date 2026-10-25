import type { QueryClient } from '@tanstack/react-query';

import type { CoinChangeReason, CoinsChange, Wallet } from '../api/coins.types';
import { coinsKeys } from '../queries/coins.keys';

const REASONS: readonly CoinChangeReason[] = [
  'EARN_EVENT',
  'QUEST',
  'SHOP',
  'SALE',
  'REFUND',
  'ADJUST',
];

/**
 * Lấy phần `coins` ra khỏi payload `gamification:updated`, hoặc `null` nếu đây KHÔNG phải sự kiện đổi số dư. Cùng một tên sự kiện BE phát hai dạng:
 * dạng XP/cấp/huy hiệu (không có `coins`) và dạng chỉ-`coins` — host XP (`features/gamification`) bỏ qua dạng sau, còn ta bỏ qua dạng trước.
 * ⚠️ Kiểm KỸ từng trường thay vì tin kiểu: payload đến từ socket, `balance` sai kiểu mà đem vá vào ví là hiện "NaN xu" trên màn.
 */
export function coinsChangeOf(event: unknown): CoinsChange | null {
  if (event === null || typeof event !== 'object' || !('coins' in event)) return null;
  const coins = (event as { coins: unknown }).coins;
  if (coins === null || typeof coins !== 'object') return null;
  const { balance, delta, reason } = coins as Record<string, unknown>;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
  if (typeof reason !== 'string' || !REASONS.includes(reason as CoinChangeReason)) return null;
  return { balance, delta, reason: reason as CoinChangeReason };
}

/**
 * Vá số dư vào cache ví rồi báo các danh sách liên quan là cũ (`invalidate`: màn đang mở tải lại ngay, màn chưa mở tải lười khi mở).
 * Sự kiện chỉ để đồng bộ NHANH — `GET /me/wallet` (do invalidate kéo theo) mới là nguồn đúng cho `todayEarned`/`lifetime*`, tiến độ nhiệm vụ…
 *
 * ⚠️ Số dư trong sự kiện ĐÃ trùng bản trong cache ⇒ bỏ qua: đó là dấu hiệu thao tác vừa xong ở CHÍNH thiết bị này (mua/nhận thưởng đã vá cache và
 * làm mới đúng phần cần thiết) — không có bước này, mỗi lần mua là hai lượt tải ví thừa.
 * `SHOP` (mua ở thiết bị khác) làm mới thêm cửa hàng + kho đồ; các lý do còn lại không đổi vật phẩm.
 */
export function applyCoinsEvent(queryClient: QueryClient, change: CoinsChange): void {
  const cached = queryClient.getQueryData<Wallet>(coinsKeys.wallet());
  if (cached?.balance === change.balance) return;
  queryClient.setQueryData<Wallet>(coinsKeys.wallet(), (old) =>
    old ? { ...old, balance: change.balance } : old,
  );
  const stale: (readonly unknown[])[] = [
    coinsKeys.wallet(),
    coinsKeys.transactionsAll(),
    coinsKeys.quests(),
  ];
  if (change.reason === 'SHOP') stale.push(coinsKeys.shop(), coinsKeys.inventory());
  for (const queryKey of stale) void queryClient.invalidateQueries({ queryKey });
}
