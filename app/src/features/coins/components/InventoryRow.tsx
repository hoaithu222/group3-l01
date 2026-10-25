import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { InventoryEntry } from '../api/coins.types';
import { ItemPreview } from './ItemPreview';

export interface InventoryRowProps {
  entry: InventoryEntry;
  /** Đang gửi lượt trang bị/tháo CỦA dòng này. */
  pending: boolean;
  offline: boolean;
  /** Kẻ ngăn dưới — bỏ ở dòng cuối của nhóm (kẻ chạy hết thẻ, không để vạch cụt ở đáy). */
  divider: boolean;
  onToggle: (entry: InventoryEntry, equip: boolean) => void;
}

/**
 * Một vật phẩm trong kho đồ (app.md p7-02 §3): hình xem trước nhỏ, tên, trạng thái BẰNG CHỮ ("Đang dùng" · "Đã có từ 27/09/2026") và nút Trang bị/Tháo.
 * Cột giữa `flex-1` (chữ cạnh nút trong `flex-row` — thiếu thì tên dài đẩy nút ra ngoài mép). Vật phẩm đã bị gỡ khỏi danh mục (`item: null`, dữ liệu cũ) vẫn
 * hiện với tên chung và vẫn tháo/trang bị được — người dùng đã mua nó, không được "biến mất" khỏi kho.
 * Mất mạng ⇒ khoá nút (trang bị cần server xác nhận luật một-vật-phẩm-mỗi-loại).
 */
export function InventoryRow({ divider, entry, offline, onToggle, pending }: InventoryRowProps) {
  const name = entry.item?.name ?? 'Vật phẩm không còn bán';
  const since = formatDate(entry.acquiredAt);
  let status = 'Đã có';
  if (entry.equipped) status = 'Đang dùng';
  else if (since) status = `Đã có từ ${since}`;

  return (
    <View
      className={
        divider
          ? 'flex-row items-center gap-sm border-b border-border-1 px-md py-sm'
          : 'flex-row items-center gap-sm px-md py-sm'
      }
    >
      <ItemPreview compact item={{ data: entry.item?.data ?? null, kind: entry.kind }} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">{name}</Text>
        <Text className={entry.equipped ? 'text-body-md text-success' : 'text-body-md text-fg-2'}>
          {status}
        </Text>
      </View>
      <Button
        accessibilityLabel={`${entry.equipped ? 'Tháo' : 'Trang bị'} ${name}`}
        disabled={offline}
        label={entry.equipped ? 'Tháo' : 'Trang bị'}
        loading={pending}
        size="sm"
        variant={entry.equipped ? 'secondary' : 'primary'}
        onPress={() => onToggle(entry, !entry.equipped)}
      />
    </View>
  );
}
