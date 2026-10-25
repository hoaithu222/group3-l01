import { useCallback, useMemo, useState } from 'react';

import { useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import {
  addDays,
  dayBoundaryIso,
  formatDate,
  parseDate,
  URL_DATE_FORMAT,
  urlDateToDate,
} from '@/shared/utils/format';

import type { RecruiterStatsParams } from '../types/recruiter.types';

/** Mặc định 90 ngày gần nhất; múi giờ nghiệp vụ Asia/Ho_Chi_Minh (BE tính "tháng" theo múi này). */
const DEFAULT_DAYS = 90;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
/**
 * BE từ chối khoảng dài hơn 366 ngày. `from` là ĐẦU ngày và `to` là CUỐI ngày (23:59:59.999) nên chênh lệch 366 ngày theo lịch đã là 366 ngày + gần một ngày → quá trần.
 * Chỉ nhận chênh lệch ≤ 365 ngày theo lịch để không bao giờ gửi một khoảng mà BE chắc chắn từ chối (400 `VAL_001`).
 */
export const STATS_MAX_DIFF_DAYS = 365;

/**
 * Khoảng ngày của tab "Thống kê" — sống trên URL (`?from=&to=`, `YYYY-MM-DD`). Vắng thì mặc định 90 ngày gần nhất tới hôm nay.
 * `params` là `undefined` khi khoảng sai (đảo ngược / quá dài) — trang hiện cảnh báo và KHÔNG gọi BE.
 */
export function useStatsRange() {
  const { getParam, updateParams } = useQueryParams();
  // Chốt "hôm nay" MỘT lần khi mount: nếu tính lại mỗi lần render thì khoá query đổi theo từng mili giây và bị gọi lại liên tục.
  const [defaults] = useState(() => {
    const today = new Date();
    return {
      from: formatDate(addDays(today, -(DEFAULT_DAYS - 1)).toDate(), URL_DATE_FORMAT),
      to: formatDate(today, URL_DATE_FORMAT),
    };
  });

  const from = getParam('from') || defaults.from;
  const to = getParam('to') || defaults.to;
  const diffDays = parseDate(to).diff(parseDate(from), 'day');
  const valid = parseDate(from).isValid() && parseDate(to).isValid() && diffDays >= 0;
  const tooLong = valid && diffDays > STATS_MAX_DIFF_DAYS;

  const params = useMemo<RecruiterStatsParams | undefined>(() => {
    const fromIso = dayBoundaryIso(from, 'start');
    const toIso = dayBoundaryIso(to, 'end');
    if (!valid || tooLong || !fromIso || !toIso) return undefined;
    return { from: fromIso, to: toIso, tz: TIME_ZONE };
  }, [from, to, valid, tooLong]);

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(from), to: urlDateToDate(to) }),
    [from, to],
  );

  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, URL_DATE_FORMAT) : null,
      }),
    [updateParams],
  );

  return { params, range, setRange, invalid: !valid, tooLong };
}
