import type { MonthlyOfferStats } from '../types/recruiter.types';

/** Chuỗi của biểu đồ lời mời theo tháng. Màu CHỈ là token scale `-5` lấy từ bảng chung (`chart-conventions.md §1.2`); nhãn luôn có chữ cạnh màu. */
export const OFFER_SERIES: ReadonlyArray<{
  key: Exclude<keyof MonthlyOfferStats, 'period'>;
  label: string;
  token: string;
}> = [
  { key: 'sent', label: 'Đã gửi', token: 'secondary-5' },
  { key: 'read', label: 'Đã xem', token: 'indigo-5' },
  { key: 'interested', label: 'Quan tâm', token: 'success-5' },
  { key: 'declined', label: 'Từ chối', token: 'warning-5' },
  { key: 'expired', label: 'Hết hạn', token: 'neutral-6' },
];
