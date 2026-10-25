import { memo, useMemo } from 'react';

import type { AdminInsights, AdminOverview } from '@/core/api/admin';
import { Text } from '@/shared/ui';

import { useModerationQueueHref } from '../hooks/useModerationQueueHref';
import { deriveHighlights } from '../utils/insight-derive.utils';
import HighlightChip from './HighlightChip';

export interface SmartHighlightsProps {
  overview: AdminOverview | undefined;
  insights: AdminInsights | undefined;
}

/**
 * Dải "Điều đáng chú ý": vài câu nhận xét tự động suy từ số liệu thật (`deriveHighlights`) — người điều hành đọc câu trước khi đọc biểu đồ.
 * ẨN HẲN khi không có gì để nói: một dải "Không có gì đáng chú ý" chiếm chỗ mà không trả lời câu hỏi nào.
 *
 * Chip báo cáo chờ xử lý là liên kết sang hàng đợi kiểm duyệt CHỈ khi có quyền + phân hệ bật (`useModerationQueueHref`) — thiếu quyền thì chỉ là chữ.
 */
const SmartHighlights = memo(function SmartHighlights({ overview, insights }: SmartHighlightsProps) {
  const moderationHref = useModerationQueueHref();
  const items = useMemo(
    () => deriveHighlights(overview, insights, { moderationHref }),
    [overview, insights, moderationHref],
  );

  if (items.length === 0) return null;
  return (
    <section aria-label="Điều đáng chú ý" className="flex shrink-0 flex-wrap items-center gap-2">
      <Text className="uppercase tracking-wide" size="tiny" skin="muted" weight="medium">
        Điều đáng chú ý
      </Text>
      {items.map((item) => (
        <HighlightChip key={item.id} highlight={item} />
      ))}
    </section>
  );
});

export default SmartHighlights;
