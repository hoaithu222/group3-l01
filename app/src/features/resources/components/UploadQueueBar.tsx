import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';

import { useUploadQueue } from '../hooks/useUploadQueue';
import { ProgressBar } from './ProgressBar';
import { UploadQueueSheet } from './UploadQueueSheet';

export interface UploadQueueBarProps {
  wsId: string;
}

/**
 * Thanh nổi dưới FileExplorer: "n tệp đang tải" + tiến độ chung, chạm để mở
 * chi tiết (app.md p3-01 §2). Ẩn hẳn khi không còn gì đang chạy VÀ không có tệp
 * lỗi — tệp lỗi phải còn thấy được để Thử lại; tệp xong thì tự biến mất.
 */
export function UploadQueueBar({ wsId }: UploadQueueBarProps) {
  const queue = useUploadQueue(wsId);
  const [open, setOpen] = useState(false);
  const { active, failed, progress } = queue.summary;

  if (active === 0 && failed === 0 && !open) return null;

  const text = active > 0 ? `Đang tải ${active} tệp · ${progress}%` : `${failed} tệp tải lên lỗi`;
  const a11y = `${text}. Chạm để xem chi tiết`;

  return (
    <>
      {active > 0 || failed > 0 ? (
        <Pressable
          accessibilityLabel={a11y}
          accessibilityRole="button"
          className="mx-md mb-sm gap-xs rounded-md border-hairline border-border-1 bg-bg-1 px-md py-sm active:opacity-80"
          onPress={() => setOpen(true)}
        >
          <View className="flex-row items-center gap-sm">
            {/* Ô icon có tông: đang tải = `info`, có tệp lỗi = `warning` (chữ bên cạnh vẫn nói rõ trạng thái). */}
            <IconTile
              name={active > 0 ? 'upload' : 'alert-warning'}
              size="sm"
              tone={active > 0 ? 'info' : 'warning'}
            />
            <Text className="flex-1 text-label-md text-fg-1">{text}</Text>
            <Text className="text-link-md text-fg-brand">Chi tiết</Text>
          </View>
          {active > 0 ? (
            <ProgressBar label={`Đang tải lên ${progress}%`} percent={progress} />
          ) : null}
        </Pressable>
      ) : null}
      <UploadQueueSheet
        rows={queue.rows}
        visible={open}
        onCancel={queue.cancel}
        onClearFinished={queue.clearFinished}
        onClose={() => setOpen(false)}
        onDismiss={queue.dismiss}
        onRetry={queue.retry}
      />
    </>
  );
}
