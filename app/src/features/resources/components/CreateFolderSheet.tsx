import { NameSheet } from './NameSheet';

export interface CreateFolderSheetProps {
  error?: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => void;
  pending: boolean;
  visible: boolean;
}

/**
 * Tạo thư mục (app.md p3-01 §3). `RSC_002` (trùng tên, không phân biệt hoa/dấu)
 * và `RSC_001` (quá 8 cấp) hiện dưới ô tên, giữ nội dung — không toast.
 */
export function CreateFolderSheet(props: CreateFolderSheetProps) {
  return (
    <NameSheet
      {...props}
      initialValue=""
      label="Tên thư mục"
      subject="thư mục"
      submitLabel="Tạo"
      title="Tạo thư mục"
    />
  );
}
