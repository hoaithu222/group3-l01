import { router, useLocalSearchParams } from 'expo-router';

import { ALL_PERIOD, isPeriodKey } from '../utils/period-labels';

/** Id thành viên hợp lệ (ObjectId 24 hex) — `?heat=` là dữ liệu không đáng tin, sai thì rơi về "Cả bảng" thay vì gọi API với nó. */
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Trạng thái của màn nằm trên URL (app.md §5): kỳ đang chọn `?period=M:2026-09`, thành viên của biểu đồ hoạt động `?heat=<userId>` và
 * lượt xuất đang theo dõi `?exportId=` — để chia sẻ link, giữ khi quay lại từ chi tiết thẻ, và để thông báo "báo cáo đã sẵn sàng" đưa người
 * dùng về đúng chỗ. Giá trị mặc định (`ALL`, "Cả bảng", chưa xuất) được XOÁ khỏi URL thay vì ghi `period=ALL`.
 */
export function useContributionParams() {
  const raw = useLocalSearchParams<{
    boardId: string;
    exportId?: string;
    heat?: string;
    period?: string;
    wsId: string;
  }>();

  return {
    boardId: raw.boardId,
    exportId: typeof raw.exportId === 'string' && raw.exportId.length > 0 ? raw.exportId : undefined,
    heat: typeof raw.heat === 'string' && OBJECT_ID_RE.test(raw.heat) ? raw.heat : 'all',
    period: isPeriodKey(raw.period) ? raw.period : ALL_PERIOD,
    setExportId: (exportId: string | undefined) => router.setParams({ exportId }),
    setHeat: (userId: string) => router.setParams({ heat: userId === 'all' ? undefined : userId }),
    setPeriod: (period: string) => router.setParams({ period: period === ALL_PERIOD ? undefined : period }),
    wsId: raw.wsId,
  };
}
