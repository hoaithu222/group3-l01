import { memo, useCallback } from 'react';

import {
  DashboardBoard,
  DashboardToolbar,
  useInsights,
  useInsightsRange,
  useOverview,
} from '@/features/dashboard';
import { Button, Callout, PageBody, PageShell } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

/**
 * Trang tổng quan (`docs/plan/admin-plan.md §3.1`) — màn theo dõi, từ trên xuống:
 *
 *   ┌ Thanh điều khiển (ghim): khoảng thời gian · ● trực tuyến · Cập nhật lúc · Làm mới ─┐
 *   │  ↓ vùng CUỘN ─────────────────────────────────────────────────────────────────  │
 *   ├ Dải KPI: số lớn · ▲▼ so với kỳ trước · sparkline (+ 3 số tức thời)                ┤
 *   ├ Điều đáng chú ý (câu nhận xét tự động) · [Việc cần làm]                           ┤
 *   ├ HERO: xu hướng nhiều chỉ số, kỳ này vs kỳ trước ─┬ Gọi & họp (cột phải)           ┤
 *   └ Lưới phân bổ: donut · thanh ngang · bản đồ nhiệt · top workspace ──────────────────┘
 *
 * Hai nguồn số liệu: `GET /admin/overview` (số tức thời + realtime qua Socket.IO) và `GET /admin/overview/insights?range=` (xu hướng, so kỳ trước,
 * phân bổ — khoảng thời gian sống trên URL `?range=`). Cả hai render khung trang NGAY, không chặn bố cục; "Làm mới" tải lại cả hai.
 *
 * Tải lỗi mà chưa có số liệu thì báo lỗi + "Thử lại" và KPI hiện "—": trước đây rơi về `?? 0` nên sự cố API trông như "0 người dùng mới, 0 báo cáo
 * chờ xử lý" — một con số nói dối đúng lúc cần tin nó. Chỉ `insights` lỗi (đã có `overview`) thì cảnh báo nhỏ riêng, xem `DashboardBoard`.
 *
 * Tiêu đề nằm trên THANH HEADER (`<PageHeader>` portal lên cụm tâm), không chiếm dòng nào của vùng nội dung.
 */
const HomePage = memo(function HomePage() {
  const overview = useOverview();
  const { range, setRange } = useInsightsRange();
  const insights = useInsights(range);
  const { refetch: refetchOverview } = overview;
  const { refetch: refetchInsights } = insights;

  const handleRefresh = useCallback(() => {
    void refetchOverview();
    void refetchInsights();
  }, [refetchOverview, refetchInsights]);
  const handleRetryInsights = useCallback(() => {
    void refetchInsights();
  }, [refetchInsights]);

  return (
    <PageShell>
      <PageHeader title="Tổng quan" tone="sky" />
      <DashboardToolbar
        generatedAt={insights.data?.generatedAt}
        onlineUsers={overview.data?.realtime.onlineUsers}
        range={range}
        refreshing={overview.isFetching || insights.isFetching}
        onRangeChange={setRange}
        onRefresh={handleRefresh}
      />
      <PageBody>
        {overview.isError && !overview.data && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={handleRefresh}>
                Thử lại
              </Button>
            }
            className="shrink-0"
            description="Số liệu tổng quan chưa có — kiểm tra kết nối rồi thử lại."
            intent="error"
            title="Không tải được số liệu tổng quan"
          />
        )}
        <DashboardBoard
          insights={insights.data}
          insightsFailed={insights.isError && !insights.data}
          insightsLoading={insights.isLoading}
          insightsStale={insights.isPlaceholderData}
          overview={overview.data}
          overviewLoading={overview.isLoading}
          onRetryInsights={handleRetryInsights}
        />
      </PageBody>
    </PageShell>
  );
});

export default HomePage;
