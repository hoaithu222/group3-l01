import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';

import type { StudyItemType } from '../../api/study.types';
import { ITEM_TYPE_META } from '../../constants/study.constants';
import { ITEM_TYPE_HINT, ITEM_TYPE_TONE } from '../../utils/editor-type-meta';

export interface ItemTypeHeaderProps {
  type: StudyItemType;
  onChangeType: () => void;
}

/**
 * Đầu form một mục: dạng ĐANG dùng (icon tông màu + tên + mô tả) và nút "Đổi dạng" mở `ItemTypePicker`. Thay hàng năm chip
 * chữ "Loại mục" trước đây — đổi dạng là việc hiếm (dạng đã chọn lúc thêm mục), nên chỉ chiếm một hàng thay vì năm lựa chọn
 * lúc nào cũng phơi ra ở đầu form.
 */
export function ItemTypeHeader({ onChangeType, type }: ItemTypeHeaderProps) {
  const meta = ITEM_TYPE_META[type];
  return (
    <View className="flex-row items-center gap-sm rounded-sm border-hairline border-border-1 bg-bg-1 p-sm">
      <IconTile name={meta.icon} tone={ITEM_TYPE_TONE[type]} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-md font-semibold text-fg-1">{meta.label}</Text>
        <Text className="text-caption-sm text-fg-2">{ITEM_TYPE_HINT[type]}</Text>
      </View>
      <Button
        accessibilityLabel={`Đổi dạng mục, hiện là ${meta.label}`}
        label="Đổi dạng"
        size="sm"
        variant="secondary"
        onPress={onChangeType}
      />
    </View>
  );
}
