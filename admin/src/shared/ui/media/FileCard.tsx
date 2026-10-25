/**
 * FileCard — 1 file row với 5 trạng thái (Figma node 1392:5648).
 *
 * Layout: [Badge icon] [name + meta row] [actions]
 * Meta row: "4.9 MB | 50% | • Status text" (mỗi item ngăn bởi divider).
 * Khi `status === "uploading"`, render progress bar mỏng dưới cùng card.
 *
 * Actions default theo status:
 *   - uploading : cancel (xmark) + delete (trash)
 *   - paused    : resume (rotate-right) + delete (trash)
 *   - success   : delete (trash)
 *   - error     : retry (rotate-right) + delete (trash)
 *   - pending   : delete (trash)
 *
 * Caller có thể override toàn bộ via `actions` slot, hoặc tắt từng action qua
 * `showRemove={false}`, `showCancel={false}`, `showRetry={false}`.
 */
import { memo, useCallback, type ReactNode } from 'react';
import Spinner from '@/shared/ui/feedback/Spinner';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';
import FileBadge from './FileBadge';
import type { UploadFile, UploadFileStatus } from './upload.types';
import { formatFileSize } from './upload.utils';
import {
  actionButtonStyles,
  fileCardStyles,
  type FileCardDensity,
  type FileCardVariant,
} from './upload.theme';

interface StatusIndicator {
  icon: ReactNode;
  text: string;
}

const STATUS_LABELS: Record<UploadFileStatus, string> = {
  pending: 'Đang chờ',
  uploading: 'Đang tải file',
  paused: 'Đã tạm dừng',
  success: 'Đã tải xong',
  error: 'Lỗi tải file',
};

function getStatusIndicator(status: UploadFileStatus, customLabel?: string): StatusIndicator {
  const text = customLabel ?? STATUS_LABELS[status];
  switch (status) {
    case 'uploading':
      return { icon: <Spinner color="warning" size="sm" />, text };
    case 'paused':
      return {
        icon: <SystemIcon className="size-4" name="clock-outline" />,
        text,
      };
    case 'success':
      return {
        icon: <SystemIcon className="size-4" name="circle-check-outline" />,
        text,
      };
    case 'error':
      return {
        icon: <SystemIcon className="size-4" name="do-not-enter-outline" />,
        text,
      };
    default:
      return {
        icon: <SystemIcon className="size-4" name="clock-outline" />,
        text,
      };
  }
}

export interface FileCardProps {
  file: UploadFile;
  density?: FileCardDensity;
  /** `detailed` (badge + meta + progress) hoặc `simple` (paperclip + tên + xoá). */
  variant?: FileCardVariant;
  /** Hiển thị % bên cạnh size khi đang upload/pause */
  showPercent?: boolean;
  /** Hiển thị progress bar dưới cùng khi uploading */
  showProgressBar?: boolean;
  /** Hiển thị status text + icon */
  showStatus?: boolean;
  /** Toggle action buttons */
  showRemove?: boolean;
  showCancel?: boolean;
  showRetry?: boolean;
  /** Disable mọi tương tác (read-only mode) */
  disabled?: boolean;
  /** Custom status label, override default theo locale */
  statusLabel?: string;
  /** Custom actions slot — nếu pass sẽ thay thế default actions */
  actions?: ReactNode;
  onRemove?: (file: UploadFile) => void;
  /** Cancel upload đang chạy */
  onCancel?: (file: UploadFile) => void;
  /** Retry / resume */
  onRetry?: (file: UploadFile) => void;
  /** Click vào card (preview) */
  onClick?: (file: UploadFile) => void;
  className?: string;
}

const FileCard = memo(function FileCard({
  file,
  density = 'cozy',
  variant = 'detailed',
  showPercent = true,
  showProgressBar = true,
  showStatus = true,
  showRemove = true,
  showCancel = true,
  showRetry = true,
  disabled,
  statusLabel,
  actions,
  onRemove,
  onCancel,
  onRetry,
  onClick,
  className,
}: FileCardProps) {
  const slots = fileCardStyles({ status: file.status, density, variant });
  const indicator = getStatusIndicator(file.status, statusLabel);
  const isSimple = variant === 'simple';
  const isActive = file.status === 'uploading';
  const isErrored = file.status === 'error';
  const isPaused = file.status === 'paused';
  const progress = Math.min(100, Math.max(0, Math.round(file.progress)));

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.(file);
    },
    [file, onRemove],
  );
  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCancel?.(file);
    },
    [file, onCancel],
  );
  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRetry?.(file);
    },
    [file, onRetry],
  );
  const handleRootClick = useCallback(() => onClick?.(file), [file, onClick]);

  return (
    <div
      className={slots.root({ class: cn(onClick && 'cursor-pointer', className) })}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? handleRootClick : undefined}
    >
      <div className={slots.body()}>
        {isSimple ? (
          <SystemIcon className="shrink-0 text-primary-5" name="paperclip-bold" size={20} />
        ) : (
          <FileBadge
            name={file.name}
            previewUrl={file.previewUrl}
            size={density === 'compact' ? 'sm' : 'md'}
          />
        )}
        <div className={slots.info()}>
          <p className={slots.name()} title={file.name}>
            {file.name}
          </p>
          {!isSimple && (
            <div className={slots.metaRow()}>
              <span>{formatFileSize(file.size)}</span>
              {showPercent && (isActive || isPaused) ? (
                <>
                  <span className={slots.metaDivider()} />
                  <span>{progress}%</span>
                </>
              ) : null}
              {showStatus ? (
                <>
                  <span className={slots.metaDivider()} />
                  <span className={slots.statusGroup()}>
                    <span className={cn(slots.statusIcon(), slots.statusText())}>
                      {indicator.icon}
                    </span>
                    <span className={slots.statusText()}>{file.error ?? indicator.text}</span>
                  </span>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className={slots.actions()}>
        {actions ?? (
          <>
            {showCancel && isActive ? (
              <button
                aria-label="Huỷ tải"
                className={actionButtonStyles({ skin: 'neutral' })}
                disabled={disabled}
                type="button"
                onClick={handleCancel}
              >
                <SystemIcon name="xmark-outline" size={14} />
              </button>
            ) : null}
            {showRetry && (isPaused || isErrored) ? (
              <button
                aria-label={isErrored ? 'Tải lại' : 'Tiếp tục'}
                className={actionButtonStyles({ skin: 'primary' })}
                disabled={disabled}
                type="button"
                onClick={handleRetry}
              >
                <SystemIcon name="arrow-rotate-right-outline" size={14} />
              </button>
            ) : null}
            {showRemove ? (
              <button
                aria-label="Xoá tệp"
                className={actionButtonStyles({ skin: 'danger' })}
                disabled={disabled}
                type="button"
                onClick={handleRemove}
              >
                <SystemIcon name="trash-outline" size={14} />
              </button>
            ) : null}
          </>
        )}
      </div>

      {!isSimple && showProgressBar && (isActive || isPaused) ? (
        <span aria-hidden className={slots.progress()}>
          <span className={slots.progressFill()} style={{ width: `${progress}%` }} />
        </span>
      ) : null}
    </div>
  );
});

export default FileCard;
