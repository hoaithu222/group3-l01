/**
 * FileList — wrapper hiển thị danh sách files dạng vertical stack.
 *
 * Forward mọi handler xuống FileCard. Hỗ trợ:
 *  - `title` hiển thị label trên list (thường là "File đã tải")
 *  - `emptyMessage` khi không có file (nullable — pass empty string để ẩn)
 *  - `density` truyền xuống FileCard (cozy/compact)
 *
 * Không có state — pure presentation.
 */
import { memo, type ReactNode } from 'react';
import Text from '@/shared/ui/primitives/Text';
import { cn } from '@/shared/utils/style/cn';
import FileCard, { type FileCardProps } from './FileCard';
import type { UploadFile } from './upload.types';
import type { FileCardDensity } from './upload.theme';

export interface FileListProps extends Pick<
  FileCardProps,
  | 'onRemove'
  | 'onCancel'
  | 'onRetry'
  | 'onClick'
  | 'variant'
  | 'showPercent'
  | 'showProgressBar'
  | 'showStatus'
  | 'showRemove'
  | 'showCancel'
  | 'showRetry'
  | 'disabled'
> {
  files: UploadFile[];
  title?: ReactNode;
  emptyMessage?: ReactNode;
  density?: FileCardDensity;
  /** Render custom mỗi item — nếu pass sẽ thay FileCard default */
  renderItem?: (file: UploadFile, index: number) => ReactNode;
  className?: string;
}

const FileList = memo(function FileList({
  files,
  title,
  emptyMessage,
  density = 'cozy',
  renderItem,
  className,
  ...cardProps
}: FileListProps) {
  const hasFiles = files.length > 0;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {title ? (
        <Text className="text-fg-1" size="small" weight="medium">
          {title}
        </Text>
      ) : null}
      {!hasFiles && emptyMessage ? (
        <Text size="tiny" skin="muted">
          {emptyMessage}
        </Text>
      ) : null}
      {hasFiles ? (
        <div className="flex w-full flex-col gap-2">
          {files.map((file, index) =>
            renderItem ? (
              <div key={file.id}>{renderItem(file, index)}</div>
            ) : (
              <FileCard key={file.id} density={density} file={file} {...cardProps} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
});

export default FileList;
