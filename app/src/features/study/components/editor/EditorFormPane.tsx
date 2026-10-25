import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { EmptyState } from '@/shared/ui/empty-state';

import type { StudyLimits } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';
import type { ItemProblem } from '../../utils/item-validation';
import type { ItemErrors } from '../../utils/map-bulk-errors';
import { ItemForm } from './ItemForm';

export interface EditorFormPaneProps {
  /** Bộ còn chỗ cho mục mới — chuyển xuống nút "Thêm tiếp" của form. */
  canAddNext: boolean;
  /** Mục đang mở; `undefined` ⇒ (tablet) cột phải hiện lời mời chọn mục. */
  item?: DraftItem;
  limits: StudyLimits;
  problems: readonly ItemProblem[];
  serverErrors?: ItemErrors;
  setId: string;
  onAddNext: () => void;
  onChange: (update: Partial<DraftItem> | ((item: DraftItem) => DraftItem)) => void;
  onDone: () => void;
  onRemove: () => void;
}

/**
 * Vùng form của trình soạn: cuộn được, né bàn phím (`KeyboardAwareScrollView` cuộn ô đang gõ vào tầm nhìn — ⛔ không dùng
 * `KeyboardAvoidingView`, xem `mobile-ux.md`), `keyboardShouldPersistTaps="handled"` để cú chạm đầu tiên vào nút không chỉ đóng bàn phím.
 * Trên tablet, chưa chọn mục thì cột phải không được để trống trơn — hiện lời mời chọn/thêm mục.
 *
 * `key={clientItemKey}`: mỗi mục một lần dựng riêng, nên trạng thái cục bộ của form (đang đổi dạng, mở/đóng xem trước, dòng nào có sẵn
 * lúc mở) không rò từ mục này sang mục khác khi chọn lại trên tablet.
 */
export function EditorFormPane({
  canAddNext,
  item,
  limits,
  onAddNext,
  onChange,
  onDone,
  onRemove,
  problems,
  serverErrors,
  setId,
}: EditorFormPaneProps) {
  if (!item) {
    return (
      <EmptyState
        description="Chọn một mục ở danh sách bên trái để sửa, hoặc thêm mục mới."
        icon="edit"
        size="compact"
        title="Chưa chọn mục nào"
        // `neutral`: lời nhắc chọn mục (không lỗi, không phải lời mời tạo bộ) — nền xám dịu cạnh danh sách mục nhiều màu.
        tone="neutral"
      />
    );
  }
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <ItemForm
        key={item.clientItemKey}
        canAddNext={canAddNext}
        item={item}
        limits={limits}
        problems={problems}
        serverErrors={serverErrors}
        setId={setId}
        onChange={onChange}
        onDone={onDone}
        onDoneAndNext={onAddNext}
        onRemove={onRemove}
      />
    </KeyboardAwareScrollView>
  );
}
