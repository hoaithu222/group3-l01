/**
 * progress-toast — thẻ thông báo tiến trình neo góc màn hình.
 *
 * Dùng chung cho `UploadCenter` (tải tệp lên) và `ImportProgressCenter` (tác vụ
 * chạy dài phía máy chủ). Hai panel đó bên dự án PMS chép NGUYÊN thẻ này: cùng
 * khung `rounded-lg border p-4 shadow-lg`, cùng ba icon trạng thái, cùng một
 * thanh tiến độ tự vẽ. Gộp về đây để sửa một lần là cả hai đổi theo.
 *
 * ⛔ Thanh tiến độ dùng `<Progress>` của kit2, KHÔNG tự vẽ lại bằng hai `div`
 * lồng nhau: bản tự vẽ thiếu `role="progressbar"` + `aria-valuenow` nên trình
 * đọc màn hình không đọc được đang tải tới đâu.
 */

import { memo, type ReactNode } from 'react';

import { Progress, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

/** Trạng thái quyết định icon + tone của thẻ. */
export type ProgressToastStatus = 'running' | 'success' | 'error';

const STATUS_ICON: Record<
  ProgressToastStatus,
  { name: 'arrows-rotate-bold' | 'circle-check-bold' | 'circle-xmark-bold'; className: string }
> = {
  running: { name: 'arrows-rotate-bold', className: 'animate-spin text-primary-5' },
  success: { name: 'circle-check-bold', className: 'text-success' },
  error: { name: 'circle-xmark-bold', className: 'text-error' },
};

export interface ProgressToastProps {
  status: ProgressToastStatus;
  /** Dòng đầu — việc đang làm ("Đang tải lên", "Nhập vật tư chính"). */
  title: string;
  /** Dòng phụ — tên tệp / đối tượng đang xử lý. */
  subtitle?: string;
  /** Dòng thông điệp chi tiết (lỗi, tổng kết). */
  message?: string;
  /** 0–100. Bỏ trống → không hiện thanh tiến độ. */
  progress?: number;
  /** Hàng nút cuối thẻ. */
  actions?: ReactNode;
  className?: string;
}

const ProgressToast = memo(function ProgressToast({
  status,
  title,
  subtitle,
  message,
  progress,
  actions,
  className,
}: ProgressToastProps) {
  const icon = STATUS_ICON[status];

  return (
    <div className={cn('rounded-lg border border-border-1 bg-bg-1 p-4 shadow-lg', className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex shrink-0">
          <SystemIcon className={icon.className} name={icon.name} size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <Text className="block truncate" size="small" weight="medium">
            {title}
          </Text>
          {subtitle && (
            <Text className="block truncate" size="tiny" skin="muted">
              {subtitle}
            </Text>
          )}
          {message && (
            <Text
              className={cn('mt-1 block truncate', status === 'error' && 'text-error')}
              size="tiny"
              skin={status === 'error' ? undefined : 'muted'}
            >
              {message}
            </Text>
          )}
        </div>
      </div>

      {typeof progress === 'number' && (
        <Progress className="mt-3" showValue size="sm" value={progress} />
      )}

      {actions && <div className="mt-3 flex justify-end gap-2">{actions}</div>}
    </div>
  );
});

export default ProgressToast;
