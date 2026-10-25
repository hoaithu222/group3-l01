import type { BoardLabel } from '../api/boards.types';
import { LabelForm } from './LabelForm';

export interface LabelSheetProps {
  /** Nhãn đang sửa; `null` = thêm nhãn mới; `undefined` = đóng. */
  editing: BoardLabel | null | undefined;
  error: unknown;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: { color: string; name: string }) => void;
}

/**
 * Tấm thêm/sửa nhãn. Cả tấm (form + nút lưu ở `footer` + lỗi ở `alert`) nằm trong `LabelForm` — vì nút lưu đọc state
 * của form mà `footer` là prop của `BottomSheet`, nên tấm phải được dựng BÊN TRONG component giữ state.
 *
 * ⚠️ Đóng thì KHÔNG dựng gì, mở thì dựng mới theo `key`: mỗi lần mở là một form mới tinh (tên/màu của nhãn đang sửa,
 * không dính chữ gõ dở lần trước) mà không cần effect đồng bộ. Hiệu ứng đóng không mất: ✕/nền mờ/vuốt chạy trượt xuống
 * XONG rồi mới gọi `onClose`.
 */
export function LabelSheet({ editing, error, pending, onClose, onSubmit }: LabelSheetProps) {
  if (editing === undefined) return null;
  return (
    <LabelForm
      key={editing?.id ?? 'new'}
      editing={editing}
      error={error}
      pending={pending}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
