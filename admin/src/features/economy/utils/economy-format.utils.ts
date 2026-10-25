import { formatDate, formatNumber } from '@/shared/utils/format';

import { COIN_TX_TYPE_LABELS, NO_DATA } from '../constants/economy.constants';
import type { AdminCoinTransaction, ShopItemKind } from '../types/economy.types';

/** Số xu có dấu: `+120` / `−50` (dấu trừ thật, không phải gạch nối) / `0`. */
export function formatSignedCoins(n: number): string {
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(Math.abs(n))}`;
  return '0';
}

/** 6 ký tự cuối của id — đủ để đối chiếu; đầy đủ nằm ở `CopyableText`. */
export const shortId = (id: string): string => `…${id.slice(-6)}`;

export const formatDateTime = (iso: string): string => formatDate(iso, 'HH:mm DD/MM/YYYY');

/** Nhãn trục ngày của biểu đồ: `YYYY-MM-DD` → `DD/MM`. */
export const formatDayLabel = (date: string): string => formatDate(date, 'DD/MM');

/** Khung thời gian bán của vật phẩm; mốc `null` = không giới hạn phía đó. */
export function formatSaleWindow(from: string | null, to: string | null): string {
  if (!from && !to) return 'Không giới hạn';
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  return from ? `Từ ${formatDate(from)}` : `Đến ${formatDate(to as string)}`;
}

const text = (data: Record<string, unknown> | null, key: string): string => {
  const value = data?.[key];
  return typeof value === 'string' ? value : NO_DATA;
};

/**
 * Tóm tắt `ShopItem.data` bằng CHỮ (không tô màu bằng hex lấy từ dữ liệu vào `style` — hex chỉ được ghi/gửi đi như dữ liệu, xem
 * `color-system.md` §"Ngoại lệ"): khung avatar → màu viền + độ dày; giao diện → hai màu; gói emoji → vài emoji đầu + số lượng.
 */
export function describeItemData(kind: ShopItemKind, data: Record<string, unknown> | null): string {
  if (kind === 'AVATAR_FRAME') {
    const width = data?.width;
    return `Viền ${text(data, 'color')} · ${typeof width === 'number' ? width : NO_DATA}px`;
  }
  if (kind === 'PROFILE_THEME')
    return `Chủ đạo ${text(data, 'primary')} · nhấn ${text(data, 'accent')}`;
  const raw: unknown = data?.emojis;
  const emojis = Array.isArray(raw)
    ? (raw as unknown[]).filter((e): e is string => typeof e === 'string')
    : [];
  if (emojis.length === 0) return NO_DATA;
  const head = emojis.slice(0, 6).join(' ');
  return emojis.length > 6
    ? `${head} … (${emojis.length} emoji)`
    : `${head} (${emojis.length} emoji)`;
}

/** Nhãn loại giao dịch; loại lạ (BE thêm về sau) hiện đúng mã thay vì trống. */
export const txTypeLabel = (tx: Pick<AdminCoinTransaction, 'type'>): string =>
  COIN_TX_TYPE_LABELS[tx.type] ?? tx.type;
