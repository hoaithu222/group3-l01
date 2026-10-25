import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import { describeItem } from '../utils/describe-item';
import type { ExplorerItem } from '../utils/explorer-items';
import type { ItemAction, ItemActionKey } from '../utils/item-actions';

export interface ResourceActionsSheetProps {
  actions: readonly ItemAction[];
  /** `null` ⇒ đóng. */
  item: ExplorerItem | null;
  onClose: () => void;
  onSelect: (key: ItemActionKey, item: ExplorerItem) => void;
}

/**
 * Menu "⋯" của một tệp/thư mục (app.md p3-01 §2). Danh sách hành động do
 * `buildItemActions` quyết theo QUYỀN — sheet chỉ vẽ.
 *
 * Là sheet THEO NGỮ CẢNH của feature (danh sách hành động phụ thuộc quyền từng mục) nên không dùng thẳng `ActionMenu`
 * (nút "⋯" + tấm), nhưng vẽ hàng bằng CHÍNH `ListItem` mà `ActionMenu` dùng — cùng icon dẫn đầu, kẻ ngăn và màu đỏ cho
 * thao tác phá huỷ ("Xoá", nằm CUỐI): mọi menu "⋯" của app trông và bấm như nhau. Trước đây là hàng `Pressable` tự dựng
 * không kẻ ngăn.
 */
export function ResourceActionsSheet({
  actions,
  item,
  onClose,
  onSelect,
}: ResourceActionsSheetProps) {
  const title = item ? describeItem(item).title : '';

  return (
    <BottomSheet padded={false} title={title} visible={item !== null} onClose={onClose}>
      {/* `SheetList`: `ListItem` không tự có lề, tấm `padded={false}` cũng không — thiếu lớp này icon dính sát mép tấm. */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {item
          ? actions.map((action, index) => (
              <ListItem
                key={action.key}
                divider={index < actions.length - 1}
                emphasis={action.danger ? 'danger' : 'title'}
                label={action.label}
                leading={<Icon color={action.danger ? 'error' : 'fg-2'} name={action.icon} />}
                tone={action.danger ? 'error' : 'default'}
                onPress={() => {
                  onClose();
                  onSelect(action.key, item);
                }}
              />
            ))
          : null}
      </SheetList>
    </BottomSheet>
  );
}
