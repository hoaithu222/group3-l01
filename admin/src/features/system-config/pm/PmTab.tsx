import { memo, useCallback, type ReactNode } from 'react';

import { useAuthStore } from '@/app/store';
import { Callout, Skeleton } from '@/shared/ui';

import ConfigGroupList from '../components/ConfigGroupList';
import { useSystemConfigList } from '../service/system-config.queries';
import ContributionDefaultsCard from './components/ContributionDefaultsCard';
import DefaultColumnsCard from './components/DefaultColumnsCard';
import ReviewDefaultsCard from './components/ReviewDefaultsCard';
import {
  BOARD_LIMITS_KEY,
  CONTRIBUTION_DEFAULTS_KEY,
  PM_CONFIG_KEY,
  PM_TIMEZONE_PATH,
  REVIEW_DEFAULTS_KEY,
} from './constants/pm.constants';
import { timezoneOf } from './utils/contribution-defaults';
import { maxColumnsOf } from './utils/default-columns';

/** Khoá đã có thẻ riêng — form chung (`ConfigGroupList`) bỏ qua để không hiện hai thẻ cho một khoá (ổn định để khỏi tính lại danh sách). */
const DEDICATED_CARD_KEYS = [REVIEW_DEFAULTS_KEY] as const;

/**
 * Tab "Dự án" (`?tab=pm`, p3-02 admin.md §2.2 · p4-05/p4-06 admin.md §2.1). Bốn phần:
 *  - giới hạn số cột/số bảng/số thẻ và múi giờ tính ngày — thẻ nhóm sinh từ registry (`limits.board`,
 *    `limits.task`, `pm` field `timezone`), cùng khuôn với tab "Giới hạn" (`ConfigGroupList`);
 *  - mẫu cột mặc định (`pm.defaultColumns`, field `json`) — trình sửa riêng, vì form sinh từ `fields[]`
 *    chưa hiểu mảng có cấu trúc;
 *  - chấm chéo mặc định cho bảng mới (`pm.review`, p4-05 admin.md §2.1) — thẻ riêng (bật, số lượt duyệt, mốc nhắc);
 *    BE chưa khai khoá này thì ẩn thẻ;
 *  - công thức đóng góp mặc định cho bảng mới (`pm.contribution`, ba field `json`) — thẻ riêng có
 *    dòng tổng trọng số; BE chưa khai khoá này thì ẩn thẻ.
 * Tất cả lưu qua hộp thoại lý do + `expectedVersion` + audit như mọi tab khác. Tab chỉ mở khi cờ `project` bật.
 */
const PmTab = memo(function PmTab() {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const { data, isLoading, isError, refetch } = useSystemConfigList();

  const pm = data?.find((i) => i.key === PM_CONFIG_KEY);
  const boardLimits = data?.find((i) => i.key === BOARD_LIMITS_KEY);
  const contribution = data?.find((i) => i.key === CONTRIBUTION_DEFAULTS_KEY);
  const review = data?.find((i) => i.key === REVIEW_DEFAULTS_KEY);

  const reload = useCallback(
    async (key: string) => (await refetch()).data?.find((i) => i.key === key),
    [refetch],
  );

  // Lỗi tải danh sách đã có thông báo (kèm "Thử lại") ở `ConfigGroupList` — không lặp lại ở đây.
  let columnsCard: ReactNode = null;
  if (isLoading) {
    columnsCard = <Skeleton className="h-40 w-full" />;
  } else if (!isError) {
    columnsCard = pm ? (
      <DefaultColumnsCard
        canEdit={canEdit}
        item={pm}
        maxColumns={maxColumnsOf(boardLimits)}
        onReload={reload}
      />
    ) : (
      <Callout
        description="Hệ thống chưa khai báo khoá cấu hình mẫu cột (pm)."
        intent="warning"
        title="Không có cấu hình mẫu cột"
      />
    );
  }

  // Khoá `pm.review` có field bật/số (form chung sửa được) nhưng thẻ riêng mới có danh sách mốc nhắc — form chung bỏ qua khoá này.
  const reviewCard =
    !isLoading && !isError && review ? (
      <ReviewDefaultsCard canEdit={canEdit} item={review} onReload={reload} />
    ) : null;

  const contributionCard =
    !isLoading && !isError && contribution ? (
      <ContributionDefaultsCard
        canEdit={canEdit}
        item={contribution}
        timezone={timezoneOf(pm, PM_TIMEZONE_PATH)}
        onReload={reload}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <ConfigGroupList excludeKeys={DEDICATED_CARD_KEYS} hideWhenEmpty tab="pm" tabLabel="dự án" />
      {columnsCard}
      {reviewCard}
      {contributionCard}
    </div>
  );
});

export default PmTab;
