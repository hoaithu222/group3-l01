import { memo } from 'react';

import { BoxPanel, Button, SummaryCard } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import { NO_DATA, RECORDING_EXPIRING_DAYS } from '../constants/workspace-recordings.constants';
import type { AdminRecordingSummary } from '../types/workspace-recordings.types';
import { storageDeltaText } from '../utils/workspace-recordings.utils';

export interface RecordingSummaryPanelProps {
  /** `undefined` = đang tải hoặc tải lỗi → thẻ hiện `—` (không bao giờ `0`, vì `0` là một con số thật). */
  summary: AdminRecordingSummary | undefined;
  /** Lọc bảng theo trạng thái Lỗi. */
  onShowFailed: () => void;
  /** Lọc bảng "chỉ bản sắp hết hạn". */
  onShowExpiring: () => void;
}

/**
 * Bốn thẻ tóm tắt đầu tab "Ghi hình" (admin.md p2-06 §2.1): tổng dung lượng (so 30 ngày trước), số bản sẵn sàng, sắp hết hạn 7 ngày, lỗi 24 giờ.
 * TOÀN BỘ là số đo — không tên cuộc họp/người dùng. Hai nút dưới thẻ đưa người xem tới danh sách đã lọc tương ứng.
 */
const RecordingSummaryPanel = memo(function RecordingSummaryPanel({
  summary,
  onShowFailed,
  onShowExpiring,
}: RecordingSummaryPanelProps) {
  return (
    <BoxPanel border="hairline" className="h-auto" title="Tổng quan ghi hình">
      <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          animate={false}
          color="blue"
          description={
            summary
              ? storageDeltaText(
                  summary.recordingStorageBytes,
                  summary.storageBytes30dAgo,
                  formatFileSize,
                )
              : undefined
          }
          icon="boxes-stacked-bold"
          label="Tổng dung lượng"
          value={summary ? formatFileSize(summary.recordingStorageBytes) : NO_DATA}
        />
        <SummaryCard
          animate={false}
          color="green"
          icon="circle-check-bold"
          label="Bản ghi sẵn sàng"
          value={summary ? summary.readyCount : NO_DATA}
        />
        <SummaryCard
          animate={false}
          color={summary && summary.expiringIn7d > 0 ? 'yellow' : 'gray'}
          icon="clock-bold"
          label={`Sắp hết hạn ${RECORDING_EXPIRING_DAYS} ngày`}
          value={summary ? summary.expiringIn7d : NO_DATA}
        />
        <SummaryCard
          animate={false}
          color={summary && summary.failed24h > 0 ? 'red' : 'gray'}
          icon="triangle-exclamation-bold"
          label="Lỗi 24 giờ"
          value={summary ? summary.failed24h : NO_DATA}
        />
      </div>
      {summary && (summary.expiringIn7d > 0 || summary.failed24h > 0) && (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {summary.expiringIn7d > 0 && (
            <Button size="sm" variant="ghost" onClick={onShowExpiring}>
              {`Xem ${formatNumber(summary.expiringIn7d)} bản sắp hết hạn`}
            </Button>
          )}
          {summary.failed24h > 0 && (
            <Button size="sm" variant="ghost" onClick={onShowFailed}>
              {`Xem các bản lỗi (${formatNumber(summary.failed24h)} trong 24 giờ)`}
            </Button>
          )}
        </div>
      )}
    </BoxPanel>
  );
});

export default RecordingSummaryPanel;
