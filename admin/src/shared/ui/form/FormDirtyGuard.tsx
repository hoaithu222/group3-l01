import type { FieldValues, UseFormReturn } from 'react-hook-form';

import ConfirmDialog from '@/shared/ui/overlays/ConfirmDialog';

import { useDirtyGuard } from './hooks/useDirtyGuard';

export interface FormDirtyGuardProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  /** Câu hỏi hiện trong hộp thoại; mặc định nói rõ rời đi sẽ mất dữ liệu. */
  message?: string;
}

/**
 * Hộp thoại "Bỏ thay đổi?" khi rời trang lúc form còn dữ liệu chưa lưu (`<Form dirtyGuard>`).
 *
 * Tách khỏi `Form` để `useBlocker` CHỈ được đăng ký khi guard bật: router chỉ hỗ trợ MỘT blocker
 * (đăng ký sau cùng thắng, và ghi cảnh báo "A router only supports one blocker at a time" mỗi lần
 * điều hướng), nên nếu mọi `Form` đều đăng ký thì trang có nhiều form vừa ồn cảnh báo vừa làm guard
 * của form này bị form khác che mất. Đồng thời `Form` không bật guard dùng được ngoài data router.
 */
export default function FormDirtyGuard<T extends FieldValues>({
  form,
  message,
}: FormDirtyGuardProps<T>) {
  const { isBlocked, proceed, cancel } = useDirtyGuard({ form });

  return (
    <ConfirmDialog
      actionLabel="Rời đi"
      cancelLabel="Ở lại"
      description={message ?? 'Bạn có thay đổi chưa lưu. Rời đi sẽ mất dữ liệu.'}
      open={isBlocked}
      title="Bỏ thay đổi?"
      variant="warning"
      onCancel={cancel}
      onConfirm={proceed}
      onOpenChange={(open) => !open && cancel()}
    />
  );
}
