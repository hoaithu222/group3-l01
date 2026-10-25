import { Badge } from '@/shared/ui/badge';

import type { RecordingStatus } from '../../api/meeting-recap.types';
import { RECORDING_STATUS_LABEL, RECORDING_STATUS_TONE } from '../../utils/recording-format.utils';

/** Trạng thái bản ghi bằng CHỮ + màu (app.md §3): Đang ghi / Đang xử lý / Sẵn sàng / Lỗi… — không bao giờ chỉ màu. */
export function RecordingStatusBadge({ status }: { status: RecordingStatus }) {
  return (
    <Badge
      accessibilityLabel={`Trạng thái: ${RECORDING_STATUS_LABEL[status]}`}
      appearance="soft"
      label={RECORDING_STATUS_LABEL[status]}
      size="sm"
      variant={RECORDING_STATUS_TONE[status]}
    />
  );
}
