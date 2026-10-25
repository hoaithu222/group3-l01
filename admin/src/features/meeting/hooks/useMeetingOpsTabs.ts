import { useCallback, useMemo } from 'react';
import { useMatches } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import type { RouteHandle } from '@/app/router/modules/types';
import { useQueryParams } from '@/shared/hooks';

import { MEETING_OPS_TAB, VOICE_FEATURE_FLAG } from '../constants/meeting.constants';

/**
 * Danh sách tab của `MeetingOpsPage` và tab đang chọn. Tên tab lấy từ `tabTitles` của route (khai ở `meeting.routes.tsx`).
 *
 * Tab "Cuộc gọi" ẨN khỏi dải tab khi cờ `voice` tắt — nhưng deep link `?tab=calls` vẫn vào được và nội dung nói rõ "Chưa bật gọi thoại" (KHÔNG tự
 * chuyển tab). Cờ chưa biết (`undefined`) coi như bật: `FeatureGate` của module đã chờ capabilities tải xong nên ca này hiếm.
 *
 * Đổi tab xoá SẠCH mọi khoá URL khác (bộ lọc/trang/sắp xếp/`?id=` của tab cũ dùng chung tên khoá `status`, `from`, `to`… với tab mới — để lại
 * thì tab mới bị lọc bởi giá trị của tab cũ).
 */
export function useMeetingOpsTabs() {
  const matches = useMatches();
  const qp = useQueryParams();
  const voiceOff = useFeature(VOICE_FEATURE_FLAG) === false;
  const { searchParams, updateParams } = qp;

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );

  const options = useMemo(
    () =>
      Object.entries(handle?.tabTitles ?? {})
        .filter(([key]) => key !== MEETING_OPS_TAB.calls || !voiceOff)
        .map(([key, label]) => ({ key, label })),
    [handle, voiceOff],
  );

  const known = Object.values<string>(MEETING_OPS_TAB);
  const requested = qp.tab || handle?.defaultTab || MEETING_OPS_TAB.meetings;
  const active = known.includes(requested) ? requested : MEETING_OPS_TAB.meetings;

  const changeTab = useCallback(
    (next: string) => {
      const reset: Record<string, string | null> = {};
      searchParams.forEach((_value, key) => {
        reset[key] = null;
      });
      updateParams({ ...reset, tab: next });
    },
    [searchParams, updateParams],
  );

  return { options, active, changeTab, voiceOff };
}
