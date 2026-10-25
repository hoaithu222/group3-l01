import { memo } from 'react';

import { SummaryCard } from '@/shared/ui';

import { NO_DATA } from '../constants/collab-ops.constants';
import type { CollabStatsView } from '../types/collab-ops.types';
import { countOf, sumCounts } from '../utils/collab-ops.utils';

export interface CollabStatsCardsProps {
  /** `undefined` = đang tải hoặc tải lỗi. */
  stats: CollabStatsView | undefined;
}

/**
 * Bốn thẻ số liệu TỨC THỜI (admin.md p6-01 §2.1): kết nối đang mở, tài liệu đang mở, bảng trắng đang mở, state chờ lưu. BE chỉ có số tức thời
 * (không có chuỗi 24 giờ nên chưa có biểu đồ). Chưa có số (đang tải / lỗi / dịch vụ không phản hồi → `live: null`) hiện "—", KHÔNG bao giờ `0`:
 * "0 kết nối" đọc ra như "yên ổn" đúng lúc dịch vụ sập.
 */
const CollabStatsCards = memo(function CollabStatsCards({ stats }: CollabStatsCardsProps) {
  const live = stats?.live ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        animate={false}
        color="blue"
        icon="bolt-bold"
        label="Kết nối đang mở"
        value={live ? sumCounts(live.connections) : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="green"
        icon="file-lines-bold"
        label="Tài liệu đang mở"
        value={live ? countOf(live.documents, 'document') : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="green"
        icon="pen-bold"
        label="Bảng trắng đang mở"
        value={live ? countOf(live.documents, 'whiteboard') : NO_DATA}
      />
      <SummaryCard
        animate={false}
        color="yellow"
        description="Đã chỉnh sửa, chưa lưu xuống backend"
        icon="clock-bold"
        label="State chờ lưu"
        value={live ? live.pendingStates : NO_DATA}
      />
    </div>
  );
});

export default CollabStatsCards;
