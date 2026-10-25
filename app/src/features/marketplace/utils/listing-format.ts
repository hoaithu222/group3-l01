import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { ListingStatus, ListingContentType } from '../api/marketplace.types';

/**
 * "1.250 xu" — xu là số nguyên ảo, KHÔNG phải tiền (không đi qua `formatCurrency`/`VND`). ⛔ Không `toLocaleString('vi-VN')`: Hermes cắt ICU
 * nên cùng một số ra hai kiểu trên Android và iOS (`screen-layout.md` mục "Tiền") — `formatNumber` dùng đúng dấu chấm hàng nghìn của app.
 */
export function formatCoins(amount: number): string {
  return formatNumber(amount, { unit: 'xu' });
}

/** "12 lượt mua" / "Chưa có lượt mua" — câu đầy đủ, không để một con số trơn không ngữ cảnh. */
export function formatSales(sales: number): string {
  return sales > 0 ? `${formatNumber(sales)} lượt mua` : 'Chưa có lượt mua';
}

export const CONTENT_TYPE_LABELS: Record<ListingContentType, string> = {
  STUDY_SET: 'Bộ học',
  RESOURCE: 'Tài liệu',
};

/** Nhãn trạng thái cho "Tin của tôi" (app.md §3 "Tin của tôi / Đã mua"). */
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  PENDING_REVIEW: 'Chờ duyệt',
  ACTIVE: 'Đang bán',
  HIDDEN: 'Đã ẩn',
  WITHDRAWN: 'Đã gỡ',
};

export const LISTING_STATUS_BADGE_VARIANT: Record<ListingStatus, 'neutral' | 'success' | 'warning' | 'error'> = {
  PENDING_REVIEW: 'warning',
  ACTIVE: 'success',
  HIDDEN: 'error',
  WITHDRAWN: 'neutral',
};
