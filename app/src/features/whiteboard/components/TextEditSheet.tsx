import { useZodForm } from '@/shared/form/useZodForm';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import { elementTextSchema, type ElementTextValues } from '../schemas/whiteboard.schemas';

export interface TextEditSheetProps {
  /** `sticky` = giấy nhớ; `text` = chữ tự do — chỉ khác tiêu đề. */
  kind: 'sticky' | 'text';
  onClose: () => void;
  onSubmit: (text: string) => void;
  /** Chữ hiện có của phần tử đang sửa; rỗng khi tạo mới. */
  text: string;
  visible: boolean;
}

/**
 * Soạn chữ cho phần tử `text`/`sticky` (app.md §2: thay `TextEditOverlay` bằng TẤM — `TextInput` đè lên vị trí phần tử phải theo camera ở mỗi frame và
 * bàn phím che canvas; tấm bàn phím + nút "Xong" đơn giản và trợ năng hơn, đổi lại không sửa "tại chỗ"). Tạo mới: chỉ ghi vào Y.Doc khi bấm Xong với
 * chữ không trống. `.trim()` không áp lên chữ — người dùng có thể cố ý xuống dòng/dấu cách đầu dòng trong giấy nhớ; engine tự cắt ở 2000 ký tự.
 * ⚠️ Ô nhập đặt THẲNG vào thân (không bọc `py-*`): tấm đã có khe 16 dưới tiêu đề và 12 trên nút "Xong".
 */
export function TextEditSheet({ kind, onClose, onSubmit, text, visible }: TextEditSheetProps) {
  const form = useZodForm<ElementTextValues, ElementTextValues>(elementTextSchema, {
    defaultValues: { text },
    values: { text },
  });
  const submit = form.handleSubmit((values) => {
    onSubmit(values.text);
    onClose();
  });

  return (
    <BottomSheet
      footer={<Button fullWidth label="Xong" onPress={submit} />}
      scrollable
      title={kind === 'sticky' ? 'Giấy nhớ' : 'Chữ'}
      visible={visible}
      onClose={onClose}
    >
      <FormInput<ElementTextValues>
        autoFocus
        control={form.control}
        label="Nội dung"
        maxLength={2000}
        multiline
        name="text"
        placeholder={kind === 'sticky' ? 'Ghi chú nhanh…' : 'Nhập chữ…'}
      />
    </BottomSheet>
  );
}
