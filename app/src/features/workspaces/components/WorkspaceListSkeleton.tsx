import { View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

import { WORKSPACE_CARD_COVER_RATIO } from '../utils/workspace-cover';
import { WorkspaceGrid } from './WorkspaceGrid';

/** Bốn thẻ giả — hơn một màn điện thoại một chút, vừa hai hàng ở máy tính bảng; không đủ để tưởng danh sách vô tận. */
const CARDS = ['a', 'b', 'c', 'd'] as const;

/**
 * Khung xương của `WorkspaceListScreen` — dựng ĐÚNG khuôn màn thật để dữ liệu về là thế chỗ mà không nhảy:
 *  · hàng lối vào (nút "Tham gia bằng mã" + ô QR, cao `h-control-sm`) và ô tìm (`h-control-md`) như `WorkspaceListHeader`;
 *  · thẻ trong CÙNG lưới `WorkspaceGrid` (1 · 2 · 3 cột) với dải bìa CÙNG tỉ lệ `WORKSPACE_CARD_COVER_RATIO`, avatar 48 đè
 *    nửa lên mép bìa (`-mt-6` + vành `border-thick` như `Avatar`), rồi hai dòng chữ.
 *
 * ⛔ Dải bìa theo TỈ LỆ, không phải chiều cao cố định: thẻ thật co giãn theo bề rộng ô (≈96dp ở máy 320dp, ≈200dp ở 1 cột
 * 600dp). `Skeleton` không nhận `style` ⇒ khung tỉ lệ là `View` bọc ngoài, `Skeleton` lấp `h-full` bên trong.
 * Phần chữ của thẻ thật cao thấp theo mô tả/huy hiệu nên chỉ cần XẤP XỈ; phần phải khớp đúng là bìa — nó chiếm phần lớn thẻ.
 */
export function WorkspaceListSkeleton() {
  return (
    <View className="gap-md">
      <View className="flex-row gap-xs tablet:max-w-content">
        <Skeleton className="h-control-sm flex-1 rounded-full" />
        <Skeleton className="h-control-sm w-10 rounded-full" />
      </View>
      <Skeleton className="h-control-md rounded-full tablet:max-w-content" />
      <WorkspaceGrid
        items={CARDS}
        keyOf={(card) => card}
        renderItem={() => (
          <View className="overflow-hidden rounded-md bg-bg-1">
            <View style={{ aspectRatio: WORKSPACE_CARD_COVER_RATIO }}>
              <Skeleton className="h-full rounded-none" />
            </View>
            <View className="flex-row gap-sm px-md pb-md">
              <View className="-mt-6 h-12 w-12 overflow-hidden rounded-full border-thick border-border-white bg-bg-1">
                <Skeleton className="h-full w-full rounded-full" />
              </View>
              <View className="flex-1 gap-xs pt-sm">
                <Skeleton className="w-2/3" />
                <Skeleton className="w-1/2" />
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}
