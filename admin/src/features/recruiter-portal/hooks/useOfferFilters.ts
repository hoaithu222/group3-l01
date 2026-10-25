import { useCallback, useMemo } from 'react';

import { OFFER_STATUSES } from '@/features/recruiter';
import type { OfferStatus } from '@/features/recruiter';
import { useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { dayBoundaryIso, formatDate, URL_DATE_FORMAT, urlDateToDate } from '@/shared/utils/format';

import type { OfferItem, OfferListParams } from '../types/offer.types';

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const OFFER_FILTER_ALL = 'all';

/**
 * Bộ lọc danh sách lời mời — sống trên URL: `?status=` (một trạng thái), `?recruiterId=` (người gửi), `?from=&to=` (ngày gửi). Giá trị lạ bị bỏ (không gửi BE).
 * BE chỉ lọc `status` và `recruiterId`; KHOẢNG NGÀY chưa có tham số ở BE nên lọc PHÍA CLIENT trên các trang đã tải (`filterByRange`) — "Tải thêm" nạp tiếp rồi lọc lại,
 * nên khoảng ngày chỉ đúng trên phần đã tải (ghi rõ ở giao diện để không ai hiểu nhầm là "hết lời mời trong khoảng").
 */
export function useOfferFilters() {
  const { getParam, setParam, updateParams } = useQueryParams({ resetPageOnChange: false });

  const statusRaw = getParam('status');
  const recruiterRaw = getParam('recruiterId');
  const from = getParam('from');
  const to = getParam('to');

  const status = (OFFER_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as OfferStatus)
    : undefined;
  const recruiterId = OBJECT_ID.test(recruiterRaw) ? recruiterRaw : undefined;

  const params = useMemo<OfferListParams>(
    () => ({ ...(status && { status }), ...(recruiterId && { recruiterId }) }),
    [status, recruiterId],
  );

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(from), to: urlDateToDate(to) }),
    [from, to],
  );
  const fromMs = dayBoundaryIso(from, 'start');
  const toMs = dayBoundaryIso(to, 'end');

  const filterByRange = useCallback(
    (items: readonly OfferItem[]): OfferItem[] => {
      if (!fromMs && !toMs) return [...items];
      const lo = fromMs ? Date.parse(fromMs) : -Infinity;
      const hi = toMs ? Date.parse(toMs) : Infinity;
      return items.filter((o) => {
        const at = Date.parse(o.sentAt);
        return at >= lo && at <= hi;
      });
    },
    [fromMs, toMs],
  );

  const setStatus = useCallback(
    (v: string) => setParam('status', v === OFFER_FILTER_ALL ? null : v),
    [setParam],
  );
  const setRecruiter = useCallback(
    (v: string) => setParam('recruiterId', v === OFFER_FILTER_ALL ? null : v),
    [setParam],
  );
  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, URL_DATE_FORMAT) : null,
      }),
    [updateParams],
  );
  const clear = useCallback(
    () => updateParams({ status: null, recruiterId: null, from: null, to: null }),
    [updateParams],
  );

  return {
    params,
    statusValue: status ?? OFFER_FILTER_ALL,
    recruiterValue: recruiterId ?? OFFER_FILTER_ALL,
    range,
    hasRange: !!fromMs || !!toMs,
    hasFilter: !!status || !!recruiterId || !!fromMs || !!toMs,
    filterByRange,
    setStatus,
    setRecruiter,
    setRange,
    clear,
  };
}
