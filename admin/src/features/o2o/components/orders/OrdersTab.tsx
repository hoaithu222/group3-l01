import { memo, useCallback, useMemo } from 'react';

import { useNavHref } from '@/shared/hooks';
import { Button, Dropdown, RangeDatePicker, Table, Toolbar } from '@/shared/ui';

import {
  ALL_FILTER,
  O2O_LIMITS,
  O2O_PAGE_SIZE,
  ORDER_SHOP_OPTIONS_QUERY,
  ORDER_STATUS_FILTER_OPTIONS,
  PAYMENT_FILTER_OPTIONS,
} from '../../constants/o2o.constants';
import { useOrderFilters } from '../../hooks/useOrderFilters';
import { useAdminOrders } from '../../service/o2o-orders.queries';
import { useAdminShops } from '../../service/o2o-shops.queries';
import type { AdminOrder } from '../../types/o2o.types';
import FilterSearchInput from '../shared/FilterSearchInput';
import ListLoadError from '../shared/ListLoadError';
import OrderDrawer from './OrderDrawer';
import { buildOrderColumns } from './orders.columns';

/**
 * Tab "Đơn in" (admin.md p6-05 §2.3): bảng phân trang server, tìm theo MÃ đơn `?q=` (khớp CHÍNH XÁC — BE so bằng, IME-safe, ≤ 20 ký tự), lọc tiệm · trạng thái ·
 * thanh toán · khoảng ngày — tất cả, trang và ngăn kéo (`?orderId=`, deep link `/o2o/orders/:id` chuyển về đây) sống trên URL.
 * Chỉ THEO DÕI và huỷ khi khiếu nại (ở ngăn kéo): không có PIN, không tải tệp.
 */
const OrdersTab = memo(function OrdersTab() {
  const f = useOrderFilters();
  const buildHref = useNavHref();
  const { data, error, isLoading, isError, refetch } = useAdminOrders(f.params);
  const { data: shops } = useAdminShops(ORDER_SHOP_OPTIONS_QUERY);
  const { openOrder } = f;

  const shopOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: 'Mọi tiệm' },
      ...(shops?.data ?? []).map((s) => ({ value: s.id, label: s.displayName })),
    ],
    [shops],
  );
  const columns = useMemo(
    () =>
      buildOrderColumns({
        hrefFor: (o) => buildHref({ orderId: o.id }),
        onOpen: (o) => openOrder(o.id),
      }),
    [buildHref, openOrder],
  );
  const rowKey = useCallback((o: AdminOrder) => o.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <>
            <FilterSearchInput
              maxLength={O2O_LIMITS.orderCodeMax}
              placeholder="Nhập đúng mã đơn (PO-…)"
              value={f.search}
              onChange={f.setSearch}
            />
            <Dropdown
              aria-label="Lọc theo tiệm"
              className="w-48"
              options={shopOptions}
              searchable
              size="sm"
              value={f.values.shop}
              onValueChange={(v) => f.setFilter('shop', v)}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái đơn"
              className="w-44"
              options={ORDER_STATUS_FILTER_OPTIONS}
              size="sm"
              value={f.values.status}
              onValueChange={(v) => f.setFilter('status', v)}
            />
            <Dropdown
              aria-label="Lọc theo thanh toán"
              className="w-44"
              options={PAYMENT_FILTER_OPTIONS}
              size="sm"
              value={f.values.paymentStatus}
              onValueChange={(v) => f.setFilter('paymentStatus', v)}
            />
            <RangeDatePicker
              align="end"
              className="w-64"
              placeholder="Khoảng ngày tạo đơn"
              range={f.values.range}
              showQuickSelect
              size="sm"
              onRangeChange={f.setRange}
            />
          </>
        }
        right={
          f.hasActiveFilter ? (
            <Button size="sm" variant="ghost" onClick={f.clear}>
              Xoá bộ lọc
            </Button>
          ) : null
        }
      />
      {isError && !data ? (
        <ListLoadError
          error={error}
          title="Không tải được danh sách đơn in"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          currentPage={f.page}
          data={rows}
          emptyMessage={f.hasActiveFilter ? 'Không có đơn nào khớp bộ lọc' : 'Chưa có đơn in nào'}
          loading={isLoading}
          pageSize={O2O_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={f.setPage}
        />
      )}
      <OrderDrawer orderId={f.orderId} onClose={() => openOrder(null)} />
    </div>
  );
});

export default OrdersTab;
