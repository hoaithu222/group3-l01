import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';
import type { DateRange } from '@/shared/ui';
import { dayBoundaryIso, formatDate, URL_DATE_FORMAT, urlDateToDate } from '@/shared/utils/format';

import { PRINT_ORDER_STATUSES, PRINT_PAYMENT_STATUSES } from '../constants/print.constants';
import { ALL_FILTER, O2O_LIMITS, O2O_PAGE_SIZE } from '../constants/o2o.constants';
import type { AdminOrdersParams } from '../types/o2o.types';
import { oneOf, validId } from '../utils/filter.utils';

/**
 * Bộ lọc tab "Đơn in" — trên URL: tìm mã đơn `?q=` (khớp chính xác, BE tự viết hoa), tiệm `?shop=`, trạng thái, thanh toán, khoảng ngày TẠO đơn `?from&to`
 * (`YYYY-MM-DD` → mốc ISO đầu/cuối ngày), trang, và ngăn kéo `?orderId=`. (Khoá `shop` chứ không phải `shopId` — `shopId`
 * là ngăn kéo của tab Tiệm in.) Giá trị URL lạ bị bỏ; đổi bộ lọc → về trang 1.
 */
export function useOrderFilters() {
  const qp = useQueryParams({ searchKey: 'q' });
  const { getParam, updateParams, page } = qp;

  const status = oneOf(getParam('status'), PRINT_ORDER_STATUSES);
  const paymentStatus = oneOf(getParam('paymentStatus'), PRINT_PAYMENT_STATUSES);
  const shop = validId(getParam('shop'));
  const from = getParam('from');
  const to = getParam('to');
  const debouncedSearch = useDebounce(qp.search.trim().slice(0, O2O_LIMITS.orderCodeMax), 300);
  const orderId = validId(getParam('orderId')) ?? null;

  const params = useMemo<AdminOrdersParams>(
    () => ({
      page,
      limit: O2O_PAGE_SIZE,
      ...(debouncedSearch && { q: debouncedSearch }),
      ...(shop && { shopId: shop }),
      ...(status && { status }),
      ...(paymentStatus && { paymentStatus }),
      ...(dayBoundaryIso(from, 'start') && { from: dayBoundaryIso(from, 'start') }),
      ...(dayBoundaryIso(to, 'end') && { to: dayBoundaryIso(to, 'end') }),
    }),
    [page, debouncedSearch, shop, status, paymentStatus, from, to],
  );

  const range = useMemo<DateRange>(
    () => ({ from: urlDateToDate(from), to: urlDateToDate(to) }),
    [from, to],
  );

  const setFilter = useCallback(
    (key: 'shop' | 'status' | 'paymentStatus', value: string) =>
      updateParams({ [key]: value === ALL_FILTER ? null : value, page: null }),
    [updateParams],
  );

  const setRange = useCallback(
    (next: DateRange) =>
      updateParams({
        from: next.from ? formatDate(next.from, URL_DATE_FORMAT) : null,
        to: next.to ? formatDate(next.to, URL_DATE_FORMAT) : null,
        page: null,
      }),
    [updateParams],
  );

  const clear = useCallback(
    () =>
      updateParams({
        q: null,
        shop: null,
        status: null,
        paymentStatus: null,
        from: null,
        to: null,
        page: null,
      }),
    [updateParams],
  );

  return {
    params,
    search: qp.search,
    debouncedSearch,
    values: {
      shop: shop ?? ALL_FILTER,
      status: status ?? ALL_FILTER,
      paymentStatus: paymentStatus ?? ALL_FILTER,
      range,
    },
    hasActiveFilter: Boolean(debouncedSearch || shop || status || paymentStatus || from || to),
    orderId,
    openOrder: (id: string | null) => updateParams({ orderId: id }),
    page,
    setPage: qp.setPage,
    setSearch: qp.setSearch,
    setFilter,
    setRange,
    clear,
  };
}
