import { Alert } from '@/shared/ui/alert';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { RecapDto } from '../../api/meeting-recap.types';

/**
 * Dải trạng thái đầu màn biên bản (app.md §3 `RecapStatusBanner`) — nói bằng CHỮ ai thấy được gì:
 *  · chưa công bố → "Bản nháp — chỉ người viết biên bản thấy" (người xem thường không bao giờ tới đây: BE trả 404);
 *  · đã công bố nhưng người sửa có thay đổi sau đó → "Có thay đổi chưa công bố";
 *  · đã công bố → "Đã công bố lúc …".
 */
export function RecapStatusBanner({ recap }: { recap: RecapDto }) {
  if (!recap.publishedAt) {
    return (
      <Alert
        description="Mọi người trong cuộc họp chỉ thấy biên bản sau khi chủ trì công bố."
        title="Bản nháp — chỉ người viết biên bản thấy"
        tone="warning"
      />
    );
  }
  const at = formatDateTime(recap.publishedAt);
  if (recap.hasUnpublishedChanges) {
    return (
      <Alert
        description={`Mọi người đang thấy bản công bố lúc ${at}. Công bố lại để cập nhật.`}
        title="Có thay đổi chưa công bố"
        tone="info"
      />
    );
  }
  return <Alert description={`Đã công bố lúc ${at}.`} tone="success" />;
}
