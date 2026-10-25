import { memo } from 'react';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import { CALL_MEDIA_LABELS, MESSAGE_SCOPE_LABELS } from '../constants/breakdown.constants';
import { colorOfCallMedia, colorOfMessageScope, sumCounts } from '../utils/breakdown.utils';
import BreakdownDonutLegend from './BreakdownDonutLegend';

export interface CallsPanelBodyProps {
  /** `breakdowns.callMedia` — vắng khi cờ `voice`/`meeting` tắt. */
  callMedia: readonly InsightsBreakdownItem[] | undefined;
  /** `breakdowns.messageScope` — vắng khi cờ `communication` tắt. */
  messageScope: readonly InsightsBreakdownItem[] | undefined;
}

/**
 * Thân panel "Cuộc gọi & tin nhắn": hai donut nhỏ xếp dọc, ngăn bằng một đường kẻ — loại cuộc gọi (Thoại/Video) và phạm vi tin nhắn (Kênh/Hội thoại).
 * Không cần tiêu đề phụ: nhãn dưới số tổng ở tâm ("cuộc gọi" / "tin nhắn") đã nói donut nào đếm gì. Mỗi nhóm có cờ riêng nên có thể vắng một trong hai — khi đó
 * donut còn lại chiếm cả chiều cao panel (căn giữa) thay vì để nửa panel trống.
 */
const CallsPanelBody = memo(function CallsPanelBody({
  callMedia,
  messageScope,
}: CallsPanelBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col divide-y divide-border-1">
      {callMedia && (
        <BreakdownDonutLegend
          centerLabel="cuộc gọi"
          centerValue={sumCounts(callMedia)}
          className="min-h-0 flex-1"
          colorOf={colorOfCallMedia}
          items={callMedia}
          labels={CALL_MEDIA_LABELS}
        />
      )}
      {messageScope && (
        <BreakdownDonutLegend
          centerLabel="tin nhắn"
          centerValue={sumCounts(messageScope)}
          className="min-h-0 flex-1"
          colorOf={colorOfMessageScope}
          items={messageScope}
          labels={MESSAGE_SCOPE_LABELS}
        />
      )}
    </div>
  );
});

export default CallsPanelBody;
