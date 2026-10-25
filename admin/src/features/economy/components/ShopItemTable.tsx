import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { useQueryParams } from '@/shared/hooks';
import { Button, Callout, Dropdown, Table, Toolbar } from '@/shared/ui';

import {
  ALL_FILTER,
  SHOP_ITEM_KINDS,
  SHOP_KIND_FILTER_OPTIONS,
  SHOP_PAGE_SIZE,
} from '../constants/economy.constants';
import { useUpdateShopItem } from '../service/economy.mutations';
import { useShopItems } from '../service/economy.queries';
import type { AdminShopItem } from '../types/economy-catalog.types';
import { isVersionConflict } from '../utils/economy-errors';
import { paginate } from '../utils/paginate.utils';
import EconomyLoadError from './EconomyLoadError';
import ShopItemFormModal from './ShopItemFormModal';
import { buildShopItemColumns } from './shop-item-table.columns';
import ToggleActiveConfirm from './ToggleActiveConfirm';

/**
 * Nhóm "Cửa hàng" (admin.md p7-02 §2.1) — `GET /admin/economy/shop-items` (cả vật phẩm đang tắt, kèm số người sở hữu). BE không phân trang (danh mục nhỏ) nên bảng
 * phân trang phía client; loại, trang, cỡ trang sống trên URL. Thêm/Sửa qua `ShopItemFormModal`; bật/tắt qua hộp thoại lý do (audit `coins.shop-item.update`).
 * Không có `gamification:update` → chỉ xem: công tắc khoá, không có nút Thêm/Sửa.
 */
const ShopItemTable = memo(function ShopItemTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const qp = useQueryParams({ defaultPageSize: SHOP_PAGE_SIZE });
  const { getParam, setParam } = qp;
  const kind = SHOP_ITEM_KINDS.find((k) => k === getParam('kind'));
  const { data: items = [], error, isLoading, refetch } = useShopItems(kind);
  const update = useUpdateShopItem();
  const [editing, setEditing] = useState<AdminShopItem | 'new' | null>(null);
  const [toggling, setToggling] = useState<AdminShopItem | null>(null);

  const handleToggle = useCallback(
    async (reason: string) => {
      if (!toggling) return;
      try {
        await update.mutateAsync({
          id: toggling.id,
          expectedVersion: toggling.version,
          isActive: !toggling.isActive,
          reason,
        });
      } catch (err) {
        // Vật phẩm vừa bị sửa ở nơi khác: danh sách đã tải lại, bỏ hộp thoại (nó cầm bản cũ) — interceptor đã báo.
        if (!isVersionConflict(err)) throw err;
      }
      setToggling(null);
    },
    [toggling, update],
  );

  const columns = useMemo(
    () => buildShopItemColumns({ canUpdate, onEdit: setEditing, onToggle: setToggling }),
    [canUpdate],
  );
  const view = paginate(items, qp.page, qp.pageSize);
  const failed = !!error && items.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Đổi giá chỉ áp cho lần mua sau. Mã và loại vật phẩm không đổi được sau khi tạo."
        intent="info"
        variant="ghost"
      />
      <Toolbar
        left={
          <Dropdown
            aria-label="Lọc theo loại vật phẩm"
            className="w-52"
            options={SHOP_KIND_FILTER_OPTIONS}
            size="sm"
            value={kind ?? ALL_FILTER}
            onValueChange={(v) => setParam('kind', v === ALL_FILTER ? null : v)}
          />
        }
        right={
          canUpdate ? (
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
              Thêm vật phẩm
            </Button>
          ) : null
        }
      />
      {failed ? (
        <EconomyLoadError
          error={error}
          title="Không tải được danh sách vật phẩm"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          currentPage={view.page}
          data={view.rows}
          emptyMessage={kind ? 'Chưa có vật phẩm nào thuộc loại này' : 'Chưa có vật phẩm nào'}
          loading={isLoading}
          pageSize={qp.pageSize}
          rowKey={(r) => r.id}
          total={items.length}
          onPageChange={qp.setPage}
          onPageSizeChange={qp.setPageSize}
        />
      )}
      {editing && (
        <ShopItemFormModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ToggleActiveConfirm
        effect="Đổi trạng thái bán có hiệu lực ngay; không lấy lại vật phẩm khỏi kho đồ của người đã sở hữu."
        noun="vật phẩm"
        target={toggling ? { label: toggling.name, next: !toggling.isActive } : null}
        onClose={() => setToggling(null)}
        onConfirm={handleToggle}
      />
    </div>
  );
});

export default ShopItemTable;
