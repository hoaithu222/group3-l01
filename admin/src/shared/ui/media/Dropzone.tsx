/**
 * @file Dropzone.tsx
 * @description Vùng nhận KÉO-THẢ bao quanh nội dung bất kỳ (overlay khi kéo vào).
 * Phân biệt THẢ TỆP vs THẢ THƯ MỤC qua FileSystemEntry (`readDirectoryDrop`):
 *  - Có thư mục được thả → `onDrop({ kind: 'folder', files })` (files kèm
 *    `webkitRelativePath` để dựng cây).
 *  - Chỉ tệp lẻ → `onDrop({ kind: 'file', files })`.
 * KHÔNG tự validate (accept/size) — caller/modal xử lý; Dropzone chỉ báo kind + files.
 */

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Text from '@/shared/ui/primitives/Text';
import { cn } from '@/shared/utils/style/cn';
import { readDirectoryDrop } from './drop.utils';

export type DropzoneKind = 'file' | 'folder';

export interface DropzonePayload {
  /** 'folder' nếu có thư mục được thả; ngược lại 'file'. */
  kind: DropzoneKind;
  /** Tệp thu được (folder → kèm `webkitRelativePath`). Thư mục rỗng → mảng rỗng. */
  files: File[];
  /**
   * Đường dẫn mọi thư mục vừa thả, KỂ CẢ rỗng (`kind: 'folder'` mới có).
   * Đây là nguồn duy nhất nhận ra thư mục không chứa tệp nào.
   */
  folderPaths: string[];
}

export interface DropzoneProps {
  /** Callback khi thả (đã phân loại kind). Thả rỗng (0 tệp) → không gọi. */
  onDrop: (payload: DropzonePayload) => void;
  /** Khoá nhận thả (vẫn render children, không hiện overlay). */
  disabled?: boolean;
  /** Tiêu đề overlay khi kéo vào. */
  overlayTitle?: ReactNode;
  /** Mô tả overlay khi kéo vào. */
  overlayDescription?: ReactNode;
  /** className container (luôn `relative`). */
  className?: string;
  children: ReactNode;
}

const Dropzone = ({
  onDrop,
  disabled,
  overlayTitle = 'Thả tệp / thư mục vào đây',
  overlayDescription,
  className,
  children,
}: DropzoneProps) => {
  const [dragging, setDragging] = useState(false);
  // Đếm enter/leave để overlay không nhấp nháy khi rê qua các phần tử con.
  const depthRef = useRef(0);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setDragging(false);
  }, []);

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // Chỉ nhận khi kéo TỆP (bỏ qua kéo text/element nội bộ).
      if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      depthRef.current += 1;
      setDragging(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled || !dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [disabled, dragging],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled || !dragging) return;
      e.preventDefault();
      depthRef.current -= 1;
      if (depthRef.current <= 0) reset();
    },
    [disabled, dragging, reset],
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      reset();
      const dt = e.dataTransfer;
      // Snapshot tệp lẻ ĐỒNG BỘ (DataTransfer hết hiệu lực sau await).
      const loose = Array.from(dt.files ?? []);
      const { files: folderFiles, folderPaths } = await readDirectoryDrop(dt);
      // Xét theo `folderPaths` chứ KHÔNG theo số tệp: thả một thư mục rỗng thì
      // `folderFiles` rỗng, nếu bám vào nó thì cú thả rơi vào hư không.
      if (folderPaths.length > 0) {
        onDrop({ kind: 'folder', files: folderFiles, folderPaths });
      } else if (loose.length > 0) {
        onDrop({ kind: 'file', files: loose, folderPaths: [] });
      }
    },
    [disabled, onDrop, reset],
  );

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary-5 bg-bg-1/80 backdrop-blur-[2px]">
          <SystemIcon className="text-primary-5" name="upload-outline" size={40} />
          <Text className="text-fg-1" size="medium" weight="medium">
            {overlayTitle}
          </Text>
          {overlayDescription && (
            <Text size="small" skin="muted">
              {overlayDescription}
            </Text>
          )}
        </div>
      )}
    </div>
  );
};

export default Dropzone;
