import { ScrollView } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { ZMode } from '../engine';

export interface SelectionBarProps {
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (mode: ZMode) => void;
}

/**
 * Thao tác trên vùng chọn (README §3 "Nhấn giữ phần tử: nhân bản, đưa lên/xuống, xoá"): hiện thành MỘT dải nút ngay trên thanh công cụ khi có phần tử
 * được chọn — dễ thấy hơn menu ẩn sau nhấn giữ và không phụ thuộc cử chỉ khó (trợ năng). Mọi nút gọi thẳng hàm engine trong một transaction.
 * `ScrollView` ngang `grow-0`: không thì nó ăn hết chiều cao của cột chứa nó.
 */
export function SelectionBar({ onDelete, onDuplicate, onReorder }: SelectionBarProps) {
  return (
    <ScrollView
      className="grow-0 border-t border-t-divider-1 bg-bg-1"
      contentContainerClassName="items-center gap-xs px-xs py-xs"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      testID="whiteboard-selection-bar"
    >
      <Button iconLeft="copy" label="Nhân bản" size="sm" variant="tertiary" onPress={onDuplicate} />
      <Button
        iconLeft="arrow-up-small"
        label="Lên trên"
        size="sm"
        variant="tertiary"
        onPress={() => onReorder('front')}
      />
      <Button
        iconLeft="arrow-down-small"
        label="Xuống dưới"
        size="sm"
        variant="tertiary"
        onPress={() => onReorder('back')}
      />
      <Button
        iconLeft="delete"
        label="Xoá"
        size="sm"
        variant="danger-secondary"
        onPress={onDelete}
      />
    </ScrollView>
  );
}
