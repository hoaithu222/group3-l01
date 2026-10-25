import { useState } from 'react';

import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { Select, SelectSheet, type SelectOption } from '@/shared/ui/select';

export interface ArchiveChannelSheetProps {
  /** Kênh mặc định BẮT BUỘC chọn kênh thay thế trước khi lưu trữ (be.md §5.3, `CH_005`). */
  isDefault: boolean;
  loading?: boolean;
  onArchive: (replacementDefaultChannelId?: string) => void;
  onClose: () => void;
  /** Kênh TEXT/PUBLIC/ACTIVE khác trong nhóm — màn gọi tự lọc theo be.md §5.3. */
  replacementOptions: SelectOption[];
  visible: boolean;
}

/**
 * Xác nhận lưu trữ — chọn kênh mặc định thay thế khi cần (app.md §2).
 *
 * ✅ `ConfirmSheet` (ô biểu tượng + câu hỏi + mô tả canh giữa, [Huỷ | Lưu trữ]) thay cho hai `Button fullWidth` trần trong
 * `flex-row`: hai khối `width: 100%` không co nên nút "Lưu trữ" bị đẩy ra ngoài mép tấm và bị cắt mất. Đang lưu trữ thì "Huỷ"
 * và nền mờ bị khoá (huỷ giữa lúc yêu cầu đang bay là đóng tấm mà việc vẫn xảy ra).
 * ✅ Kênh thay thế chọn bằng `Select` (ô có nhãn, trông như ô nhập) thay cho một nút viền — người dùng thấy ngay đây là TRƯỜNG
 * phải điền trước khi nút chính sáng lên. ⚠️ `SelectSheet` mở CHỒNG lên tấm này như trước; chọn xong là quay về đúng chỗ.
 */
export function ArchiveChannelSheet({
  isDefault,
  loading,
  onArchive,
  onClose,
  replacementOptions,
  visible,
}: ArchiveChannelSheetProps) {
  const [replacementId, setReplacementId] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const replacementLabel = replacementOptions.find(
    (option) => option.value === replacementId,
  )?.label;

  function handleClose(): void {
    setReplacementId(undefined);
    onClose();
  }

  return (
    <>
      <ConfirmSheet
        confirmDisabled={isDefault && !replacementId}
        confirmLabel="Lưu trữ"
        description={
          isDefault
            ? 'Đây là kênh mặc định của nhóm — chọn kênh khác thay thế trước khi lưu trữ.'
            : 'Kênh sẽ chuyển sang chỉ đọc. Bạn có thể khôi phục lại sau.'
        }
        icon="history"
        loading={loading}
        title="Lưu trữ kênh này?"
        tone="danger"
        visible={visible}
        onClose={handleClose}
        onConfirm={() => onArchive(replacementId)}
      >
        {isDefault ? (
          <Select
            label="Kênh mặc định mới"
            placeholder="Chọn kênh thay thế"
            required
            value={replacementLabel}
            onPress={() => setPickerOpen(true)}
          />
        ) : null}
      </ConfirmSheet>

      <SelectSheet
        options={replacementOptions}
        title="Chọn kênh mặc định mới"
        value={replacementId ?? ''}
        visible={pickerOpen}
        onChange={(value) => {
          setReplacementId(value);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
