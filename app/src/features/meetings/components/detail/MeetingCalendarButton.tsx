import { Button } from '@/shared/ui/button';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { useAddToCalendar } from '../../hooks/useAddToCalendar';
import { canAddToCalendar } from '../../utils/meeting-ics';

/**
 * "Thêm vào lịch" ngay dưới giờ họp: tải `.ics` từ BE rồi mở bảng chia sẻ hệ điều hành để chọn ứng dụng lịch (hook `useAddToCalendar`). Nút thứ cấp,
 * nhỏ, dồn trái — hành động phụ của khối giờ, không tranh với nút "Vào họp" cố định ở đáy màn. Không hiện khi không có gì để thêm (`canAddToCalendar`).
 * ⚠️ Hook chạy TRƯỚC lần `return null` để số hook không đổi khi trạng thái họp đổi (SCHEDULED → LIVE lúc tới giờ).
 */
export function MeetingCalendarButton({ meeting }: { meeting: MeetingDetailDto }) {
  const calendar = useAddToCalendar(meeting);
  if (!canAddToCalendar(meeting)) return null;

  return (
    <Button
      iconLeft="calendar"
      label="Thêm vào lịch"
      loading={calendar.pending}
      pressableClassName="self-start"
      size="sm"
      variant="secondary"
      onPress={calendar.addToCalendar}
    />
  );
}
