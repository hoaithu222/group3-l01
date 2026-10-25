import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { formatSize } from '../utils/format-size';
import { queueStateLabel, type QueueRow, type QueueRowState } from '../utils/upload-queue';
import { ProgressBar } from './ProgressBar';

/** Ô icon theo trạng thái — trang trí, trạng thái bằng CHỮ vẫn nằm trong nhãn/dòng phụ. */
const STATE_ART: Record<QueueRowState, { icon: IconName; tone: IconTileTone }> = {
  cancelled: { icon: 'cancel', tone: 'neutral' },
  done: { icon: 'checkmark-circle', tone: 'success' },
  failed: { icon: 'alert-warning', tone: 'warning' },
  paused: { icon: 'pause', tone: 'warning' },
  processing: { icon: 'reload', tone: 'info' },
  queued: { icon: 'clock', tone: 'neutral' },
  uploading: { icon: 'upload', tone: 'info' },
};

export interface UploadQueueRowProps {
  /** Kẻ ngăn dưới hàng — nơi gọi bỏ ở hàng CUỐI (kẻ dưới hàng cuối là một vạch cụt sát vùng đáy tấm). */
  divider?: boolean;
  onCancel: (localId: string) => void;
  onDismiss: (localId: string) => void;
  onRetry: (row: QueueRow) => void;
  row: QueueRow;
}

/**
 * MỘT tệp trong hàng đợi (app.md p3-01 §3 "Upload chi tiết"): tên, dung lượng,
 * thanh tiến độ, trạng thái bằng CHỮ, và Huỷ / Thử lại / Bỏ theo trạng thái.
 * Lý do lỗi (MIME/quá dung lượng/đầy kho) hiện nguyên câu, không mã.
 */
export function UploadQueueRow({
  divider = false,
  onCancel,
  onDismiss,
  onRetry,
  row,
}: UploadQueueRowProps) {
  const label = queueStateLabel(row);
  const showBar = row.state === 'uploading' || row.state === 'processing' || row.state === 'queued';
  const art = STATE_ART[row.state];

  return (
    // ⛔ KHÔNG `accessible` ở khối gốc: phần tử `accessible` gộp CẢ cây con thành MỘT ô, nên "Thử lại" / "Huỷ" / "Bỏ" bên
    // trong hết đường lia tới bằng trình đọc màn hình (iOS ẩn hẳn con của một phần tử accessible). Gom nhãn vào ĐÚNG khối chữ
    // — câu đọc vẫn liền mạch, còn ba nút thành ô rời (cùng mẫu `ListItem`, `Alert`).
    <View className={cn('gap-xs py-sm', divider && 'border-b-hairline border-divider-1')}>
      <View className="flex-row items-center gap-sm">
        <IconTile name={art.icon} size="sm" tone={art.tone} />
        <View
          accessibilityLabel={`${row.name}, ${formatSize(row.size)}, ${label}`}
          accessible
          className="flex-1 gap-3xs"
        >
          <Text className="text-label-md text-fg-1" numberOfLines={1}>
            {row.name}
          </Text>
          <Text
            className={
              row.state === 'failed' ? 'text-caption-sm text-error' : 'text-caption-sm text-fg-2'
            }
          >
            {`${formatSize(row.size)} · ${label}`}
          </Text>
        </View>
        {row.retry ? (
          <Button
            accessibilityLabel={`Thử lại tải lên ${row.name}`}
            label="Thử lại"
            size="xs"
            variant="secondary"
            onPress={() => onRetry(row)}
          />
        ) : null}
        {row.canCancel ? (
          <Button
            accessibilityLabel={`Huỷ tải lên ${row.name}`}
            label="Huỷ"
            size="xs"
            variant="tertiary"
            onPress={() => onCancel(row.localId)}
          />
        ) : null}
        {row.state === 'failed' || row.state === 'cancelled' || row.state === 'done' ? (
          <Button
            accessibilityLabel={`Bỏ ${row.name} khỏi danh sách`}
            label="Bỏ"
            size="xs"
            variant="tertiary"
            onPress={() => onDismiss(row.localId)}
          />
        ) : null}
      </View>
      {showBar ? (
        <ProgressBar label={`Đang tải lên ${row.progress}%`} percent={row.progress} />
      ) : null}
    </View>
  );
}
