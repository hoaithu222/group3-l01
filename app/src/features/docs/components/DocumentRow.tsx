import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import type { DocumentView } from '../api/docs.types';
import { ROLE_LABEL } from '../constants/docs.constants';
import { documentRowLabel, lastEditedText } from '../utils/docs-format';

export interface DocumentRowProps {
  doc: DocumentView;
  /** Có menu "⋯" (đổi tên, chia sẻ, lịch sử, lưu trữ…) — luôn có; hành động cần quyền tự ẩn trong menu. */
  onMenu: (doc: DocumentView) => void;
  onOpen: (doc: DocumentView) => void;
}

/**
 * Một tài liệu trong danh sách (app.md §3): tiêu đề, khoá nếu riêng tư, người sửa cuối + thời gian, "Chỉ xem" nếu là người xem, "Đã lưu trữ".
 * Chạm cả hàng → mở; nút "⋯" bên phải mở menu thao tác (hành động không phụ thuộc vuốt — `swipe` phải có đường thay thế). Cả hàng là MỘT ô
 * trợ năng đọc đủ tiêu đề · chế độ · trạng thái · người sửa; nút "⋯" là ô riêng.
 *
 * ⚠️ `Text` cạnh nút trong `flex-row` có `flex-1` (không thì tiêu đề dài đẩy nút "⋯" ra ngoài màn) và hàng `min-h-[44px]` giữ vùng chạm ≥ 44dp.
 */
export function DocumentRow({ doc, onMenu, onOpen }: DocumentRowProps) {
  const archived = doc.status === 'ARCHIVED';

  return (
    <View className="flex-row items-center gap-xs border-b border-b-divider-1 pl-md pr-xs">
      <Pressable
        accessibilityLabel={documentRowLabel(doc)}
        accessibilityRole="button"
        className="min-h-[64px] flex-1 flex-row items-center gap-sm py-sm active:opacity-70"
        onPress={() => onOpen(doc)}
      >
        <IconTile name="document" tone={archived ? 'neutral' : 'brand'} />
        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-3xs">
            <Text className="flex-1 text-label-lg font-semibold text-fg-1" numberOfLines={2}>
              {doc.title}
            </Text>
            {doc.visibility === 'PRIVATE' ? <Icon color="fg-2" name="lock" size={16} /> : null}
          </View>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {lastEditedText(doc)}
          </Text>
          {archived || doc.myRole === 'VIEWER' ? (
            <View className="flex-row gap-3xs">
              {archived ? <Badge label="Đã lưu trữ" size="sm" variant="neutral" /> : null}
              {doc.myRole === 'VIEWER' ? (
                <Badge label={ROLE_LABEL.VIEWER} size="sm" variant="info" />
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Button
        accessibilityLabel={`Tuỳ chọn cho ${doc.title}`}
        iconLeft="more"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => onMenu(doc)}
      />
    </View>
  );
}
