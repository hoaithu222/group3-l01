import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';

import type { ContributionReport, PeriodKey } from '../api/contribution.types';
import { formatDateTimeIn } from '../utils/zoned-format';
import { ExportStatusBanner } from './ExportStatusBanner';
import { StaleBanner } from './StaleBanner';

export interface ContributionBannersProps {
  archived: boolean;
  boardId: string;
  exportId: string | undefined;
  offline: boolean;
  period: PeriodKey;
  report: ContributionReport | undefined;
  timezone: string;
  onDismissExport: () => void;
  onReplaceExport: (exportId: string) => void;
}

/**
 * Dải banner đầu màn (app.md §3 "Contribution — đầu màn"): offline ("Dữ liệu lúc 10:32 15/09" — bản đã tải, chỉ đọc) · bảng đã lưu trữ · đang cập nhật số liệu
 * (`stale`) · trạng thái lượt xuất PDF. Không có banner nào thì KHÔNG dựng khối (một khối rỗng vẫn ăn một khe 24dp của cha).
 */
export function ContributionBanners({
  archived,
  boardId,
  exportId,
  offline,
  period,
  report,
  timezone,
  onDismissExport,
  onReplaceExport,
}: ContributionBannersProps) {
  const stale = Boolean(report?.stale);
  if (!offline && !archived && !stale && !exportId) return null;

  const computed = report?.computedAt ? ` Dữ liệu lúc ${formatDateTimeIn(report.computedAt, timezone)}.` : '';

  return (
    <View className="gap-xs">
      {offline ? <Alert description={`Không có kết nối — chỉ xem, không xuất PDF hay đổi trọng số được.${computed}`} tone="info" /> : null}
      {archived ? <Alert description="Bảng đã lưu trữ — chỉ xem, không đổi trọng số được." tone="warning" /> : null}
      {stale && report ? <StaleBanner computedAt={report.computedAt} timezone={timezone} /> : null}
      {exportId ? (
        <ExportStatusBanner
          boardId={boardId}
          exportId={exportId}
          period={period}
          timezone={timezone}
          onDismiss={onDismissExport}
          onReplace={onReplaceExport}
        />
      ) : null}
    </View>
  );
}
