import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useDisclosure, useNavHref } from '@/shared/hooks';
import { Button, Dropdown, Table, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { O2O_PAGE_SIZE, SHOP_STATUS_FILTER_OPTIONS } from '../../constants/o2o.constants';
import { useShopFilters } from '../../hooks/useShopFilters';
import { useAdminShops } from '../../service/o2o-shops.queries';
import type { AdminShop } from '../../types/o2o.types';
import FilterSearchInput from '../shared/FilterSearchInput';
import ListLoadError from '../shared/ListLoadError';
import ShopDrawer from './ShopDrawer';
import ShopFormModal from './ShopFormModal';
import { buildShopColumns } from './shops.columns';

/**
 * Tab "Tiệm in" (admin.md p6-05 §2.2): bảng phân trang server, tìm `?q=` (IME-safe) + lọc trạng thái duyệt — bộ lọc, trang và ngăn
 * kéo (`?shopId=`, deep link `/o2o/shops/:id` chuyển về đây) sống trên URL. Nút "Thêm tiệm in" cần `o2o:create`; duyệt/tạm ngưng/sửa
 * giá làm trong ngăn kéo (`o2o:approve` / `o2o:update`).
 */
const ShopsTab = memo(function ShopsTab() {
  const f = useShopFilters();
  const buildHref = useNavHref();
  const canCreate = useAuthStore((s) => s.hasPermission('o2o', 'create'));
  const { data, error, isLoading, isError, refetch } = useAdminShops(f.params);
  const createModal = useDisclosure();
  const { openShop } = f;

  const columns = useMemo(
    () =>
      buildShopColumns({
        hrefFor: (s) => buildHref({ shopId: s.id }),
        onOpen: (s) => openShop(s.id),
      }),
    [buildHref, openShop],
  );
  const rowKey = useCallback((s: AdminShop) => s.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <>
            <FilterSearchInput
              maxLength={100}
              placeholder="Tìm theo tên tiệm…"
              value={f.search}
              onChange={f.setSearch}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái duyệt"
              className="w-44"
              options={SHOP_STATUS_FILTER_OPTIONS}
              size="sm"
              value={f.status}
              onValueChange={f.setStatus}
            />
            {f.hasActiveFilter ? (
              <Button size="sm" variant="ghost" onClick={f.clear}>
                Xoá bộ lọc
              </Button>
            ) : null}
          </>
        }
        right={
          canCreate ? (
            <Button
              size="sm"
              startIcon={<SystemIcon name="plus-outline" size={14} />}
              variant="primary"
              onClick={createModal.open}
            >
              Thêm tiệm in
            </Button>
          ) : null
        }
      />
      {isError && !data ? (
        <ListLoadError
          error={error}
          title="Không tải được danh sách tiệm in"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          currentPage={f.page}
          data={rows}
          emptyMessage={f.hasActiveFilter ? 'Không có tiệm nào khớp bộ lọc' : 'Chưa có tiệm in nào'}
          loading={isLoading}
          pageSize={O2O_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={f.setPage}
        />
      )}
      <ShopDrawer shopId={f.shopId} onClose={() => openShop(null)} />
      {createModal.isOpen ? <ShopFormModal onClose={createModal.close} /> : null}
    </div>
  );
});

export default ShopsTab;
