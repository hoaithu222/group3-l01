import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

import { useStorageUsage } from '../queries/workspace-access.queries';
import { describeStorageUsage } from '../utils/storage-usage';
import { ProgressBar } from './ProgressBar';

export interface StorageUsageBannerProps {
  /** Chỉ OWNER/ADMIN — `GET /storage` 403 với MEMBER nên không gọi. */
  enabled: boolean;
  wsId: string;
}

/**
 * Cảnh báo kho tài liệu đầy (≥ 90 % hạn mức, README p3-01 §6: OWNER/ADMIN).
 * Dưới ngưỡng, MEMBER, hoặc lỗi gọi `storage` ⇒ KHÔNG vẽ gì (không có gì cần
 * báo — đừng để một endpoint phụ làm hỏng màn chính).
 *
 * `warning` ở 90–99 % và `error` khi đầy: tông kèm ICON mặc định của `Alert`
 * (màu `warning` không đạt AA, nên icon + chữ là dấu hiệu chính).
 */
export function StorageUsageBanner({ enabled, wsId }: StorageUsageBannerProps) {
  const { data } = useStorageUsage(wsId, enabled);
  if (!enabled || !data) return null;

  const usage = describeStorageUsage(data.usedBytes, data.quotaBytes);
  if (usage.level === 'ok') return null;

  return (
    <View className="px-md">
      <Alert
        description={
          usage.level === 'full'
            ? `Kho tài liệu đã đầy (${usage.summary}). Xoá bớt tệp trong thùng rác để tải lên tiếp.`
            : `Đã dùng ${usage.percent}% dung lượng (${usage.summary}). Hãy dọn bớt tệp cũ.`
        }
        title={usage.level === 'full' ? 'Kho tài liệu đã đầy' : 'Sắp hết dung lượng'}
        tone={usage.level === 'full' ? 'error' : 'warning'}
      />
      <View className="pt-xs">
        <ProgressBar label={`Đã dùng ${usage.percent}% dung lượng`} percent={usage.percent} />
      </View>
    </View>
  );
}
