import { memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useMatches } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import type { RouteHandle } from '@/app/router/modules/types';
import { PageShell } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader, useQueryTabNav } from '@/shared/widgets/header';

import ReportedStudySetsTab from '../components/ReportedStudySetsTab';
import ReportsTab from '../components/ReportsTab';
import { STUDY_FEATURE_FLAG } from '../constants/study-set-moderation.constants';

const FALLBACK_TAB = 'reports';

/** Tab đã có màn hình; `content` (bộ học bị báo cáo nhiều, p4-01) còn phụ thuộc cờ `study`. */
const MODERATION_TABS: Record<string, ComponentType> = {
  reports: ReportsTab,
  content: ReportedStudySetsTab,
};

/** Nhãn rút gọn cho màn < 1024px / máy chạm — chip tab trên header không co được (`PageHeaderNavItem.shortLabel`). */
const SHORT_LABELS = { content: 'Công khai' } as const;

/**
 * Trang `/moderation?tab=` — khung tab URL-synced (cùng mẫu `gamification`): `reports` = hàng đợi báo cáo gộp theo đích (admin.md p1-08 §2.1),
 * `content` = bộ học công khai bị báo cáo nhiều (admin.md p4-01 §1). Danh sách tab = giao của `tabTitles` (đọc từ route `handle`) và
 * `MODERATION_TABS`; `content` chỉ hiện khi BE xác nhận cờ `study` bật (tắt → mọi route `/admin/study-sets` trả 404 `CFG_005`). Tiêu đề +
 * dải tab nằm trên THANH HEADER (`<PageHeader nav>`); chỉ một tab thì KHÔNG vẽ dải tab. Quyền vào trang (`moderation:view`) và cờ
 * `communication` do registry chặn.
 */
const ModerationQueuePage = memo(function ModerationQueuePage() {
  const matches = useMatches();
  const qp = useQueryParams();
  // `undefined` (chưa biết) coi như chưa bật — tab chỉ hiện khi BE xác nhận `true`.
  const studyEnabled = useFeature(STUDY_FEATURE_FLAG) === true;

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );

  const options = useMemo(() => {
    const listed = Object.entries(handle?.tabTitles ?? {})
      .filter(([key]) => key in MODERATION_TABS && (key !== 'content' || studyEnabled))
      .map(([key, label]) => ({ key, label }));
    // Registry chưa khai tab nào (test dựng trang trần) → vẫn có hàng đợi báo cáo.
    return listed.length > 0 ? listed : [{ key: FALLBACK_TAB, label: 'Báo cáo' }];
  }, [handle, studyEnabled]);

  const requested = qp.tab || handle?.defaultTab || FALLBACK_TAB;
  const active = options.some((o) => o.key === requested) ? requested : options[0].key;
  const Active = MODERATION_TABS[active];
  const nav = useQueryTabNav({
    active,
    minItems: 2,
    onSelect: qp.setTab,
    options,
    shortLabels: SHORT_LABELS,
  });

  return (
    <PageShell>
      <PageHeader nav={nav} title="Kiểm duyệt" tone="orange" />
      <Active />
    </PageShell>
  );
});

export default ModerationQueuePage;
