import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';

import { STUDY_ITEM_TYPES, type StudyItemType } from '../../api/study.types';
import { ITEM_TYPE_META } from '../../constants/study.constants';
import { ITEM_TYPE_HINT, ITEM_TYPE_TONE } from '../../utils/editor-type-meta';
import { SelectCard } from './SelectCard';

export interface ItemTypePickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (type: StudyItemType) => void;
  /** Chế độ ĐỔI dạng của mục đang soạn: thẻ của dạng hiện tại có vòng chọn. Bỏ trống = thêm mục MỚI (chạm là đi tiếp). */
  selected?: StudyItemType;
  title?: string;
}

/**
 * Chọn DẠNG cho mục (app.md p4-01 §2 `ItemTypePicker`): lưới thẻ hai cột, mỗi thẻ có icon tông màu + tên + mô tả một dòng —
 * người soạn nhận ra dạng bằng mắt trước khi đọc chữ. Dùng cho "Thêm mục" (chạm là thêm) và "Đổi dạng" (đánh dấu dạng hiện tại).
 *
 * ⚠️ Ô lưới `grow basis-[45%]`: hai thẻ một hàng ở mọi bề rộng ≥ 320dp, thẻ lẻ cuối (5 dạng ⇒ hàng thứ ba) giãn hết hàng. `scrollable`
 * vì ba hàng thẻ cao hơn tấm ở máy 568dp hoặc khi người dùng phóng cỡ chữ.
 */
export function ItemTypePicker({
  onClose,
  onPick,
  selected,
  title = 'Thêm mục',
  visible,
}: ItemTypePickerProps) {
  const changing = selected !== undefined;
  return (
    <BottomSheet
      description={changing ? undefined : 'Chọn dạng mục muốn thêm vào bộ.'}
      scrollable
      title={title}
      visible={visible}
      onClose={onClose}
    >
      <View
        accessibilityRole={changing ? 'radiogroup' : 'menu'}
        className="flex-row flex-wrap gap-sm pb-md"
      >
        {STUDY_ITEM_TYPES.map((type) => (
          <View key={type} className="grow basis-[45%]">
            <SelectCard
              description={ITEM_TYPE_HINT[type]}
              icon={ITEM_TYPE_META[type].icon}
              label={ITEM_TYPE_META[type].label}
              layout="stacked"
              role={changing ? 'radio' : 'button'}
              selected={selected === type}
              tone={ITEM_TYPE_TONE[type]}
              onPress={() => {
                onClose();
                onPick(type);
              }}
            />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}
