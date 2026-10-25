import { Badge, Button, Toggle } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { SHOP_ITEM_KIND_LABELS } from '../constants/economy.constants';
import type { AdminShopItem } from '../types/economy-catalog.types';
import { describeItemData, formatSaleWindow } from '../utils/economy-format.utils';

export interface ShopItemColumnActions {
  /** Có `gamification:update` — không có thì công tắc bị khoá và không có nút "Sửa". */
  canUpdate: boolean;
  onEdit: (item: AdminShopItem) => void;
  /** Bấm công tắc → mở hộp thoại lý do; trạng thái chỉ đổi khi BE xác nhận. */
  onToggle: (item: AdminShopItem) => void;
}

/**
 * Cột bảng vật phẩm (admin.md p7-02 §2.1): tên + mã, loại, "xem trước" (tóm tắt `data` bằng chữ), giá, số người sở hữu, khung bán, công tắc bật/tắt, nút Sửa.
 * Mỗi công tắc/nút mang NHÃN TRUY CẬP theo tên vật phẩm — trong bảng lặp nhiều dòng, control không tên chỉ đọc ra "công tắc"/"Sửa".
 */
export function buildShopItemColumns({
  canUpdate,
  onEdit,
  onToggle,
}: ShopItemColumnActions): TableColumn<AdminShopItem>[] {
  return [
    {
      key: 'item',
      header: 'Vật phẩm',
      width: 220,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-body-14 text-fg-1">{r.name}</div>
          <div className="truncate text-caption-12 text-fg-4">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Loại',
      width: 140,
      cell: (r) => (
        <Badge color="neutral" variant="tinted">
          {SHOP_ITEM_KIND_LABELS[r.kind] ?? r.kind}
        </Badge>
      ),
    },
    {
      key: 'preview',
      header: 'Xem trước',
      cell: (r) => (
        <span className="block truncate text-fg-2">{describeItemData(r.kind, r.data)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Giá (xu)',
      width: 100,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.price)}</span>,
    },
    {
      key: 'owners',
      header: 'Người sở hữu',
      width: 120,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.owners)}</span>,
    },
    {
      key: 'window',
      header: 'Thời gian bán',
      width: 190,
      cell: (r) => (
        <span className="tabular-nums text-caption-12 text-fg-3">
          {formatSaleWindow(r.availableFrom, r.availableTo)}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Bật',
      width: 80,
      cell: (r) => (
        <Toggle
          aria-label={`Bật vật phẩm — ${r.name}`}
          checked={r.isActive}
          disabled={!canUpdate}
          onCheckedChange={() => onToggle(r)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 80,
      cell: (r) =>
        canUpdate ? (
          <Button
            aria-label={`Sửa vật phẩm ${r.name}`}
            size="sm"
            variant="ghost"
            onClick={() => onEdit(r)}
          >
            Sửa
          </Button>
        ) : null,
    },
  ];
}
