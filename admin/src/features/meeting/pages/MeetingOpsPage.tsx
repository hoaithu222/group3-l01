import { lazy, memo, Suspense } from 'react';
import type { ComponentType } from 'react';

import { EmptyState, PageBody, PageShell, Skeleton } from '@/shared/ui';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import { MEETING_OPS_TAB } from '../constants/meeting.constants';
import { useAdminMediaSocket, useMeetingOpsTabs } from '../hooks';

/** Mỗi tab một chunk riêng — chỉ nạp khi mở (bảng, biểu đồ, ngăn kéo không nằm trong bundle của trang khác). */
const MeetingsTab = lazy(() => import('../components/meetings/MeetingsTab'));
const CallsTab = lazy(() => import('../components/calls/CallsTab'));
const RecordingsTab = lazy(() => import('../components/recordings/RecordingsTab'));
const MediaInfraTab = lazy(() => import('../components/infra/MediaInfraTab'));

const TAB_CONTENT: Record<string, ComponentType> = {
  [MEETING_OPS_TAB.meetings]: MeetingsTab,
  [MEETING_OPS_TAB.calls]: CallsTab,
  [MEETING_OPS_TAB.recordings]: RecordingsTab,
  [MEETING_OPS_TAB.infra]: MediaInfraTab,
};

/** Nhãn rút gọn cho màn < 1024px / máy chạm — chip tab trên header không co được (`PageHeaderNavItem.shortLabel`). */
const SHORT_LABELS = { [MEETING_OPS_TAB.infra]: 'Hạ tầng' };

/**
 * Trang `/meeting?tab=` — Vận hành gọi & họp (admin.md p2-07 §2.1): bốn tab Cuộc họp / Cuộc gọi / Ghi hình / Hạ tầng media, CHỈ metadata vận hành (không
 * agenda, người tham dự, nội dung cuộc gọi). Quyền vào `meeting:view` + cờ `meeting` do registry chặn; "Kết thúc khẩn cấp" cần `meeting:update` và
 * xoá bản ghi `meeting:delete` — kiểm ở từng tab. Vào phòng realtime `admin:media` khi mở trang (rời khi đóng) để bảng tự làm mới
 * (`useAdminMediaSocket`). Tab "Cuộc gọi" ẨN khi cờ `voice` tắt; mở thẳng `?tab=calls` lúc đó → "Chưa bật gọi thoại" (không điều hướng).
 *
 * Tiêu đề + dải tab nằm trên THANH HEADER (`<PageHeader nav>`). Đổi tab xoá SẠCH mọi khoá URL khác (`useMeetingOpsTabs.changeTab`) nên `href`
 * của chip cũng chỉ còn `?tab=` (`resetKeys: 'all'`).
 */
const MeetingOpsPage = memo(function MeetingOpsPage() {
  const { options, active, changeTab, voiceOff } = useMeetingOpsTabs();
  useAdminMediaSocket();

  const callsOff = active === MEETING_OPS_TAB.calls && voiceOff;
  const Active = TAB_CONTENT[active];
  const nav = useQueryTabNav({
    active,
    onSelect: changeTab,
    options,
    resetKeys: 'all',
    shortLabels: SHORT_LABELS,
  });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Gọi & họp" tone="fuchsia" />
      <PageBody overflow="scroll">
        {callsOff ? (
          <EmptyState
            description="Gọi thoại/video đang tắt trên hệ thống nên chưa có dữ liệu cuộc gọi. Bật cờ Gọi thoại/video ở Cấu hình hệ thống để dùng."
            icon="phone-bold"
            title="Chưa bật gọi thoại"
          />
        ) : (
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Active />
          </Suspense>
        )}
      </PageBody>
    </PageShell>
  );
});

export default MeetingOpsPage;
