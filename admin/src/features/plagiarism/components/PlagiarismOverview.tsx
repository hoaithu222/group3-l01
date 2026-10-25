import { memo } from 'react';

import { BoxPanel, Button, Callout, EmptyState, Skeleton, SummaryCard, Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { usePlagiarismOverview } from '../service/plagiarism.queries';
import type { PlagiarismRange } from '../service/plagiarism.types';

export interface PlagiarismOverviewProps {
  range: PlagiarismRange;
}

const FINGERPRINT_STATUS_LABELS: Record<string, string> = {
  READY: 'Sẵn sàng',
  PENDING: 'Đang chuẩn bị',
  NO_TEXT: 'Không trích được chữ',
  UNSUPPORTED: 'Chưa hỗ trợ',
  TOO_LARGE: 'Quá lớn',
  FAILED: 'Lỗi',
};

const LEVEL_LABELS: Record<string, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', NONE: 'Chưa có mức' };

/** Thống kê tổng hợp (admin.md §2.1) — chỉ số đếm, KHÔNG tên tệp/id tài liệu/điểm theo tệp (PLAG-12). */
const PlagiarismOverview = memo(function PlagiarismOverview({ range }: PlagiarismOverviewProps) {
  const { data, isLoading, isError, refetch } = usePlagiarismOverview(range);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được số liệu"
      />
    );
  }
  if (data.scans.total === 0) {
    return <EmptyState description="Chưa có lượt kiểm tra nào trong khoảng thời gian này" title="Chưa có dữ liệu" />;
  }

  const fpEntries = Object.entries(data.fingerprints.byStatus);
  const levelEntries = Object.entries(data.levelDistribution);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard color="blue" icon="chart-line-bold" label="Tổng số lượt quét" value={data.scans.total} />
        <SummaryCard color="green" icon="circle-check-bold" label="Hoàn tất" value={data.scans.completed} />
        <SummaryCard color="red" icon="circle-xmark-bold" label="Lỗi / hết hạn chờ" value={data.scans.failed} />
        <SummaryCard color="gray" icon="ban-bold" label="Đã huỷ" value={data.scans.cancelled} />
      </div>
      <SummaryCard
        color="yellow"
        description="Tính trên lượt HOÀN TẤT trong khoảng thời gian đã chọn"
        icon="clock-bold"
        label="Thời gian quét (p95)"
        value={data.p95DurationSec !== null ? `${formatNumber(data.p95DurationSec)} giây` : '—'}
      />

      <BoxPanel border="hairline" title="Trạng thái chỉ mục (toàn hệ thống)">
        <div className="flex flex-wrap gap-4 p-3">
          {fpEntries.length === 0 ? (
            <Text size="small" skin="muted">
              Chưa có tệp nào được lập chỉ mục.
            </Text>
          ) : (
            fpEntries.map(([status, count]) => (
              <div className="flex flex-col" key={status}>
                <Text size="small" skin="muted">
                  {FINGERPRINT_STATUS_LABELS[status] ?? status}
                </Text>
                <Text weight="bold">{formatNumber(count)}</Text>
              </div>
            ))
          )}
        </div>
      </BoxPanel>

      <BoxPanel border="hairline" title="Phân bố mức (theo số tệp đích)">
        <div className="flex flex-wrap gap-4 p-3">
          {levelEntries.length === 0 ? (
            <Text size="small" skin="muted">
              Chưa có kết quả nào trong khoảng thời gian này.
            </Text>
          ) : (
            levelEntries.map(([level, count]) => (
              <div className="flex flex-col" key={level}>
                <Text size="small" skin="muted">
                  {LEVEL_LABELS[level] ?? level}
                </Text>
                <Text weight="bold">{formatNumber(count)}</Text>
              </div>
            ))
          )}
        </div>
      </BoxPanel>

      <BoxPanel border="hairline" title="Top nhóm theo số lượt quét">
        <div className="flex flex-col gap-2 p-3">
          {data.topWorkspaces.length === 0 ? (
            <Text size="small" skin="muted">
              Chưa có dữ liệu.
            </Text>
          ) : (
            data.topWorkspaces.map((ws) => (
              <div className="flex items-center justify-between" key={ws.workspaceId}>
                <Text size="small">{ws.name}</Text>
                <Text size="small" weight="bold">
                  {formatNumber(ws.scans)} lượt
                </Text>
              </div>
            ))
          )}
        </div>
      </BoxPanel>
    </div>
  );
});

export default PlagiarismOverview;
