import type { InsightsRange } from '@/core/api/admin';

/** Khoá gốc của `GET /admin/overview/insights` — `invalidateQueries({ queryKey: INSIGHTS_KEY })` làm mới mọi khoảng thời gian. */
export const INSIGHTS_KEY = ['admin-insights'] as const;

/** Mỗi khoảng thời gian một bản cache riêng: quay lại 7 ngày sau khi xem 30 ngày thì có số ngay, không nháy trắng. */
export const insightsKey = (range: InsightsRange) => [...INSIGHTS_KEY, range] as const;
