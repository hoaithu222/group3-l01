import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { WhiteboardView } from '../api/whiteboard.types';
import { ROLE_LABEL } from '../constants/whiteboard.constants';
import { lastEditedText, whiteboardRowLabel } from '../utils/whiteboard-format';

export interface WhiteboardRowProps {
  board: WhiteboardView;
  /** Có menu "⋯" (đổi tên, chia sẻ, lịch sử, lưu trữ…) — luôn có; hành động cần quyền tự ẩn trong menu. */
  onMenu: (board: WhiteboardView) => void;
  onOpen: (board: WhiteboardView) => void;
}

/**
 * Một bảng trắng trong danh sách (app.md §3): tên, khoá nếu riêng tư, người sửa cuối + thời gian, "Chỉ xem" nếu là người xem, "Đã lưu trữ". Chạm cả
 * hàng → mở; nút "⋯" bên phải mở menu thao tác (hành động không phụ thuộc vuốt — `swipe` phải có đường thay thế). Cả hàng là MỘT ô trợ năng đọc đủ
 * tên · chế độ · trạng thái · số phần tử · người sửa; nút "⋯" là ô riêng.
 *
 * ⚠️ Kế hoạch vẽ LƯỚI 2 cột kèm ảnh thu nhỏ; P0 dùng HÀNG danh sách vì luồng tải ảnh thu nhỏ (`makeImageSnapshot` → upload → `PATCH thumbnailAssetId`)
 * chưa làm — chưa có ảnh để hiện. ⚠️ `Text` cạnh nút trong `flex-row` có `flex-1` (không thì tên dài đẩy nút "⋯" ra ngoài màn), hàng `min-h-[64px]`.
 */
export function WhiteboardRow({ board, onMenu, onOpen }: WhiteboardRowProps) {
  const archived = board.status === 'ARCHIVED';

  return (
    <View className="flex-row items-center gap-xs border-b border-b-divider-1 pl-md pr-xs">
      <Pressable
        accessibilityLabel={whiteboardRowLabel(board)}
        accessibilityRole="button"
        className="min-h-[64px] flex-1 flex-row items-center gap-sm py-sm active:opacity-70"
        onPress={() => onOpen(board)}
      >
        <IconTile name="edit" tone={archived ? 'neutral' : 'brand'} />
        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-3xs">
            <Text className="flex-1 text-label-lg font-semibold text-fg-1" numberOfLines={2}>
              {board.name}
            </Text>
            {board.visibility === 'PRIVATE' ? <Icon color="fg-2" name="lock" size={16} /> : null}
          </View>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {lastEditedText(board)}
          </Text>
          {archived || board.myRole === 'VIEWER' ? (
            <View className="flex-row gap-3xs">
              {archived ? <Badge label="Đã lưu trữ" size="sm" variant="neutral" /> : null}
              {board.myRole === 'VIEWER' ? (
                <Badge label={ROLE_LABEL.VIEWER} size="sm" variant="info" />
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Button
        accessibilityLabel={`Tuỳ chọn cho ${board.name}`}
        iconLeft="more"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => onMenu(board)}
      />
    </View>
  );
}
