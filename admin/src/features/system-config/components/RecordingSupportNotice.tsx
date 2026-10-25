import { memo } from 'react';

import { useCapabilities } from '@/app/capabilities';
import { Callout } from '@/shared/ui';

import { SUB_FEATURE_UNAVAILABLE_REASONS } from '../constants/sub-features';

/**
 * Cảnh báo "ghi hình cuộc họp chưa khả dụng" (admin.md p2-06 §2.5) cho nhóm cấu hình ghi hình (tab Tính năng + tab Giới hạn): phân hệ họp
 * ĐÃ có mã nhưng cờ phụ `meetingRecording` vẫn `available=false` — nghĩa là thiếu hạ tầng (storage không phải S3/MinIO, chưa cấu hình LiveKit
 * Egress, hoặc Egress ghi sang bucket khác bucket tài sản). Không hiện khi phân hệ họp CHƯA có mã: khi đó nguyên nhân là "chưa có mã", đổ lỗi
 * cho storage sẽ sai.
 */
const RecordingSupportNotice = memo(function RecordingSupportNotice() {
  const { data } = useCapabilities();
  const meeting = data?.features.meeting;
  const recording = data?.features.meetingRecording;
  if (!meeting?.available || !recording || recording.available) return null;

  return (
    <Callout
      description={`${SUB_FEATURE_UNAVAILABLE_REASONS.meetingRecording} Nút ghi hình sẽ không hiện với người dùng cho tới khi cấu hình đủ; bản ghi đã có không bị ảnh hưởng.`}
      intent="warning"
      title="Ghi hình cuộc họp chưa khả dụng"
    />
  );
});

export default RecordingSupportNotice;
