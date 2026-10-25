import type { MonthlyOfferStats } from '../types/recruiter.types';

export interface OfferTotals {
  sent: number;
  read: number;
  interested: number;
  declined: number;
  expired: number;
}

/** Cộng dồn các tháng trong khoảng đã chọn. */
export function totalOffers(byMonth: readonly MonthlyOfferStats[]): OfferTotals {
  return byMonth.reduce<OfferTotals>(
    (acc, m) => ({
      sent: acc.sent + m.sent,
      read: acc.read + m.read,
      interested: acc.interested + m.interested,
      declined: acc.declined + m.declined,
      expired: acc.expired + m.expired,
    }),
    { sent: 0, read: 0, interested: 0, declined: 0, expired: 0 },
  );
}

/**
 * Tỉ lệ `part / whole` theo phần trăm (1 chữ số thập phân). Chưa gửi lời mời nào (`whole = 0`) → `null` — hiện "—", KHÔNG phải "0%":
 * "0% quan tâm" đọc như doanh nghiệp bị từ chối hết, trong khi thật ra chưa có gì để đo.
 */
export function ratePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** `2026-09` → `09/2026` (kỳ theo Asia/Ho_Chi_Minh, BE đã tính). */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-');
  return month && year ? `${month}/${year}` : period;
}
