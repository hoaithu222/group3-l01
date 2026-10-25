import { memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useMatches } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import type { RouteHandle } from '@/app/router/modules/types';
import { ECONOMY_FEATURE_FLAG, EconomyTab } from '@/features/economy';
import { LIVE_QUIZ_FEATURE_FLAG, LiveQuizOpsTab } from '@/features/live-quiz-ops';
import { WELLBEING_FEATURE_FLAG, WellbeingTab } from '@/features/wellbeing';
import { EmptyState, PageBody, PageShell, Tabs } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';
import { PageHeader } from '@/shared/widgets/header';

import BadgesTab from '../components/BadgesTab';
import LeaderboardTab from '../components/LeaderboardTab';
import LevelsTab from '../components/LevelsTab';
import { TabErrorBoundary } from '../components/TabErrorBoundary';
import XpRulesTab from '../components/XpRulesTab';

/** Tab đã có màn hình; tab khác trong `tabTitles` chưa làm. `live-quiz` (p5-01), `economy` (p7-02) và `wellbeing` (p7-03) còn phụ thuộc cờ tính năng. */
const GAMIFICATION_TABS: Record<string, ComponentType> = {
  'xp-rules': XpRulesTab,
  badges: BadgesTab,
  levels: LevelsTab,
  leaderboard: LeaderboardTab,
  'live-quiz': LiveQuizOpsTab,
  economy: EconomyTab,
  wellbeing: WellbeingTab,
};

/**
 * Trang `/gamification?tab=` (admin.md p4-03 §1) — cùng khung tab URL-synced với `system-config`.
 * Quyền xem + cờ `gamification` do registry chặn; quyền ghi kiểm ở từng tab.
 */
const GamificationPage = memo(function GamificationPage() {
  const matches = useMatches();
  const qp = useQueryParams();
  // Cờ `live-quiz` (p5-01): `undefined` (chưa biết) coi như chưa bật — tab chỉ hiện khi BE xác nhận `true`. `FeatureGate` của module đã chờ
  // capabilities tải xong nên deep link `?tab=live-quiz` không chớp sang tab khác.
  const liveQuizEnabled = useFeature(LIVE_QUIZ_FEATURE_FLAG) === true;
  // Cờ `coins` (p7-02) — cùng cách: tab "Kinh tế xu" chỉ hiện khi BE xác nhận `true`; cờ tắt thì deep link `?tab=economy` rơi về tab đầu, không gọi API xu.
  const coinsEnabled = useFeature(ECONOMY_FEATURE_FLAG) === true;
  // Cờ `burnout` (p7-03) — cùng cách: tab "Sức khoẻ học tập" chỉ hiện khi BE xác nhận `true`; cờ tắt thì deep link `?tab=wellbeing` rơi về tab đầu, không gọi API sức khoẻ.
  const burnoutEnabled = useFeature(WELLBEING_FEATURE_FLAG) === true;

  const handle = useMemo(
    () => matches.map((m) => m.handle as RouteHandle | undefined).find((h) => h?.tabTitles),
    [matches],
  );

  const options = useMemo(
    () =>
      Object.entries(handle?.tabTitles ?? {})
        .filter(
          ([key]) =>
            key in GAMIFICATION_TABS &&
            (key !== 'live-quiz' || liveQuizEnabled) &&
            (key !== 'economy' || coinsEnabled) &&
            (key !== 'wellbeing' || burnoutEnabled),
        )
        .map(([key, label]) => ({ key, label })),
    [handle, liveQuizEnabled, coinsEnabled, burnoutEnabled],
  );

  const requested = qp.tab || handle?.defaultTab || 'xp-rules';
  const active = options.some((o) => o.key === requested) ? requested : options[0]?.key;
  const Active = active ? GAMIFICATION_TABS[active] : undefined;

  return (
    <PageShell>
      {/* Tiêu đề lên THANH HEADER. Dải tab (tới 7 tab theo cờ) vẫn ở vùng nội dung — quá dài để
          ghim quanh bảng tên canh giữa. */}
      <PageHeader title="Gamification" tone="yellow" />
      <PageBody overflow="scroll">
        {!Active ? (
          <EmptyState description="Chưa có tab nào." title="Chưa có dữ liệu" />
        ) : (
          <>
            <Tabs
              aria-label="Nhóm chức năng gamification"
              options={options}
              size="sm"
              value={active}
              onValueChange={qp.setTab}
            />
            <div className="mt-3">
              <TabErrorBoundary key={active}>
                <Active />
              </TabErrorBoundary>
            </div>
          </>
        )}
      </PageBody>
    </PageShell>
  );
});

export default GamificationPage;
