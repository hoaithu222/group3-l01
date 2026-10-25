import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

import type { QueueRow } from '../utils/upload-queue';
import { UploadQueueRow } from './UploadQueueRow';

export interface UploadQueueSheetProps {
  onCancel: (localId: string) => void;
  onClearFinished: () => void;
  onClose: () => void;
  onDismiss: (localId: string) => void;
  onRetry: (row: QueueRow) => void;
  rows: readonly QueueRow[];
  visible: boolean;
}

/**
 * Danh sách hàng đợi tải lên của workspace (app.md p3-01 §3). Cuộn khi dài.
 *
 * Kẻ ngăn CHỈ giữa hai hàng (bỏ ở hàng cuối — trước đây mọi hàng đều kẻ dưới nên hàng cuối có một vạch cụt sát nút đáy).
 * Hàng đợi rỗng (vừa "Xoá mục đã xong" hết, hoặc mọi tệp đã bỏ) thì nói rõ bằng `EmptyState` thay vì một tấm trắng.
 */
export function UploadQueueSheet({
  onCancel,
  onClearFinished,
  onClose,
  onDismiss,
  onRetry,
  rows,
  visible,
}: UploadQueueSheetProps) {
  const hasFinished = rows.some((row) => row.state === 'done' || row.state === 'cancelled');

  return (
    <BottomSheet
      footer={
        hasFinished ? (
          <Button fullWidth label="Xoá mục đã xong" variant="secondary" onPress={onClearFinished} />
        ) : undefined
      }
      // Tấm DANH SÁCH (tràn viền): `SheetList` lo lề 16 cho hàng, `EmptyState` tự có lề nên đứng ngoài nó.
      padded={false}
      scrollable
      title="Đang tải lên"
      visible={visible}
      onClose={onClose}
    >
      {rows.length === 0 ? (
        <EmptyState
          description="Không còn tệp nào trong hàng đợi tải lên."
          icon="upload"
          size="compact"
          tone="neutral"
        />
      ) : (
        // Không `pb-md` khi có nút đáy ("Xoá mục đã xong") — khe dưới hàng cuối do vùng đáy lo.
        <SheetList accessibilityRole="list" className={hasFinished ? undefined : 'pb-md'}>
          {rows.map((row, index) => (
            <UploadQueueRow
              key={row.localId}
              divider={index < rows.length - 1}
              row={row}
              onCancel={onCancel}
              onDismiss={onDismiss}
              onRetry={onRetry}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
