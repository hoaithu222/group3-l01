import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import { labelOf, STORAGE_TYPE_LABELS } from '../constants/storage.constants';
import type { StorageStats } from '../types/storage.types';

export interface StorageSummaryProps {
  stats: StorageStats;
}

/**
 * Bốn thẻ tổng quan (admin.md p0-05 §2.1). Dải 4 thẻ là một bộ đọc cùng nhau nên số cột
 * là ý đồ (gãy 2×2 khi hẹp), không dùng `BoxGrid` tự co cột.
 */
const StorageSummary = memo(function StorageSummary({ stats }: StorageSummaryProps) {
  const hasOrphan = stats.orphan.count > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        color="blue"
        description="Không tính tệp đã xoá"
        icon="layer-group-bold"
        label="Tổng dung lượng"
        value={formatFileSize(stats.totals.bytes)}
      />
      <SummaryCard
        color="green"
        description="Không tính tệp đã xoá"
        icon="files-bold"
        label="Số tệp"
        value={stats.totals.count}
      />
      <SummaryCard
        color={hasOrphan ? 'yellow' : 'gray'}
        description={
          hasOrphan
            ? `${formatFileSize(stats.orphan.bytes)} sẽ được giải phóng`
            : 'Không có tệp nào chờ dọn'
        }
        icon="trash-can-bold"
        label="Tệp mồ côi (chờ dọn)"
        value={formatNumber(stats.orphan.count)}
      />
      <SummaryCard
        color="gray"
        description="Chỉ đọc — đổi bằng biến môi trường"
        icon="boxes-bold"
        label="Loại storage"
        value={labelOf(STORAGE_TYPE_LABELS, stats.storageType)}
      />
    </div>
  );
});

export default StorageSummary;
