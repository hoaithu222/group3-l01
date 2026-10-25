import { memo, useState } from 'react';

import {
  BoxPanel,
  Button,
  Callout,
  PageBody,
  RangeDatePicker,
  Toolbar,
} from '@/shared/ui';

import { STATS_MAX_DIFF_DAYS, useStatsRange } from '../hooks/useStatsRange';
import { useRecruiterStats } from '../service/recruiter.queries';
import RecruiterMonthlyChart from './RecruiterMonthlyChart';
import RecruiterMonthlyTable from './RecruiterMonthlyTable';
import RecruiterStatsKpis from './RecruiterStatsKpis';
import RecruiterTopCompanies from './RecruiterTopCompanies';

/**
 * Đích của liên kết "top doanh nghiệp": tab Doanh nghiệp, bỏ lọc trạng thái (`status=all`) rồi mở ngăn kéo — không kế thừa khoá lọc của tab Thống kê
 * và không bị kéo về "Chờ duyệt" mặc định.
 */
const companyHref = (id: string): string =>
  `?tab=companies&status=all&companyId=${encodeURIComponent(id)}`;

/**
 * Tab `stats` của `/recruiter` (admin.md p6-08 §2.2): khoảng ngày (≤ 366 ngày, Asia/Ho_Chi_Minh) → KPI + biểu đồ theo tháng (kèm bảng thay thế) + top doanh nghiệp.
 * CHỈ số đếm — không có tên/nội dung ứng viên hay lời mời (BE cũng không trả). Khoảng sai (đảo ngược / quá dài) → cảnh báo, KHÔNG gọi BE. Xuất CSV là P1, chưa làm.
 * Lỗi tải mà chưa có số → Callout + "Thử lại"; KPI hiện "—" chứ không "0".
 */
const RecruiterStatsPanel = memo(function RecruiterStatsPanel() {
  const { params, range, setRange, invalid, tooLong } = useStatsRange();
  const { data, isLoading, isError, refetch } = useRecruiterStats(params);
  // Ngày tối đa của lịch: chốt một lần để prop không đổi identity mỗi lần render.
  const [today] = useState(() => new Date());

  return (
    <>
      <Toolbar
        left={
          <RangeDatePicker
            className="w-64"
            maxDate={today}
            placeholder="Khoảng ngày thống kê"
            range={range}
            showQuickSelect
            size="sm"
            onRangeChange={setRange}
          />
        }
      />
      <PageBody overflow="scroll">
        <div className="flex flex-col gap-3">
          {invalid || tooLong ? (
            <Callout
              description={
                tooLong
                  ? `Khoảng thống kê tối đa ${STATS_MAX_DIFF_DAYS + 1} ngày. Chọn khoảng ngắn hơn.`
                  : 'Ngày kết thúc phải sau ngày bắt đầu.'
              }
              intent="warning"
              title="Khoảng ngày không hợp lệ"
            />
          ) : null}
          {isError && !data ? (
            <Callout
              action={
                <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                  Thử lại
                </Button>
              }
              description="Kiểm tra kết nối rồi thử lại."
              intent="error"
              title="Không tải được thống kê"
            />
          ) : null}
          <RecruiterStatsKpis loading={isLoading} stats={data} />
          <BoxPanel border="hairline" title="Lời mời theo tháng gửi">
            <div className="flex flex-col gap-3 p-3">
              <RecruiterMonthlyChart data={data?.byMonth ?? []} />
              <RecruiterMonthlyTable data={data?.byMonth ?? []} />
            </div>
          </BoxPanel>
          <BoxPanel
            border="hairline"
            description={
              data ? `${data.companiesAtQuota} doanh nghiệp đã chạm hạn mức tháng này` : undefined
            }
            title="Top 10 doanh nghiệp gửi nhiều lời mời"
          >
            <RecruiterTopCompanies companyHref={companyHref} data={data?.topCompanies ?? []} />
          </BoxPanel>
        </div>
      </PageBody>
    </>
  );
});

export default RecruiterStatsPanel;
