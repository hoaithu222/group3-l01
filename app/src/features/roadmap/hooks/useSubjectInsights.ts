import { useMemo } from 'react';

import { useNow } from '@/shared/hooks/useNow';

import type { RoadmapSubjectDetailDto } from '../api/roadmap.types';
import { todayDay } from '../utils/roadmap-dates';
import { computeSubjectInsights } from '../utils/roadmap-progress';

/** Nhãn ngày chỉ đổi theo NGÀY — làm mới 5 phút/lần là đủ để "Ngày mai" thành "Hôm nay" ngay sau nửa đêm. */
const NOW_REFRESH_MS = 5 * 60_000;

/**
 * Tiến độ "thông minh" của MỘT môn (`computeSubjectInsights`) theo "hôm nay" ở múi giờ của đăng ký (BE lập lịch theo
 * `enrollment.timezone`, mặc định `Asia/Ho_Chi_Minh` — so theo giờ máy thì máy đặt giờ khác sẽ lệch "trễ/hôm nay").
 * `null` khi môn chưa tải xong.
 */
export function useSubjectInsights(subject: RoadmapSubjectDetailDto | undefined) {
  const now = useNow(NOW_REFRESH_MS);
  const today = todayDay(now, subject?.myEnrollment?.timezone);
  return useMemo(() => (subject ? computeSubjectInsights(subject, today) : null), [subject, today]);
}
