import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

export interface ToggleActiveTarget {
  /** Tên hiển thị của mục đang bật/tắt. */
  label: string;
  /** Trạng thái sẽ đặt (`true` = bật). */
  next: boolean;
}

export interface ToggleActiveConfirmProps {
  /** `null` = đóng. */
  target: ToggleActiveTarget | null;
  /** "vật phẩm" / "nhiệm vụ" — ghép vào tiêu đề. */
  noun: string;
  /** Hệ quả nói rõ cho người bấm (vd "Người dùng không còn mua được…"). */
  effect: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/** Bật/tắt một mục danh mục — thay đổi ảnh hưởng người dùng nên BẮT BUỘC lý do (10–500, vào nhật ký), tắt dùng nút đỏ. */
const ToggleActiveConfirm = memo(function ToggleActiveConfirm({
  target,
  noun,
  effect,
  onConfirm,
  onClose,
}: ToggleActiveConfirmProps) {
  const turningOn = target?.next ?? true;
  return (
    <ConfirmWithReasonModal
      confirmTone={turningOn ? 'primary' : 'danger'}
      impact={
        target ? (
          <div className="flex flex-col gap-1">
            <span>
              {turningOn ? 'Bật' : 'Tắt'} {noun} “{target.label}”.
            </span>
            <span className="text-fg-4">{effect}</span>
          </div>
        ) : null
      }
      open={!!target}
      title={`${turningOn ? 'Bật' : 'Tắt'} ${noun}`}
      onConfirm={onConfirm}
      onOpenChange={(open) => !open && onClose()}
    />
  );
});

export default ToggleActiveConfirm;
