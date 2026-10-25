import { NameSheet } from './NameSheet';

export interface RenameTarget {
  kind: 'folder' | 'resource';
  name: string;
}

export interface RenameSheetProps {
  error?: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
  /** `null` ⇒ đóng. */
  target: RenameTarget | null;
}

/**
 * Đổi tên thư mục/tệp. Gửi kèm `expectedVersion` do nơi gọi lo; `RES_003` (đã bị
 * sửa chỗ khác) ⇒ nơi gọi làm mới và GIỮ tấm này (app.md §4) — ở đây chỉ hiện
 * câu lỗi.
 */
export function RenameSheet({ target, ...rest }: RenameSheetProps) {
  const isFolder = target?.kind === 'folder';
  return (
    <NameSheet
      {...rest}
      initialValue={target?.name ?? ''}
      label={isFolder ? 'Tên thư mục' : 'Tên tệp'}
      subject={isFolder ? 'thư mục' : 'tệp'}
      submitLabel="Lưu"
      title={isFolder ? 'Đổi tên thư mục' : 'Đổi tên tệp'}
      visible={target !== null}
    />
  );
}
