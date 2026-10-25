import { memo } from 'react';
import type { ReactNode } from 'react';

import { Badge, BoxPanel, Callout, Text } from '@/shared/ui';
import { statusBadge } from '@/shared/utils/format';

import type { HealthState } from '../../types/media-health.types';

export interface MediaHealthRow {
  label: string;
  value: ReactNode;
}

export interface MediaHealthBlockProps {
  title: string;
  /** Bỏ trống khi BE không trả trạng thái riêng cho khối (hàng đợi — chỉ có số đếm). */
  status?: HealthState;
  rows: readonly MediaHealthRow[];
  /** Lỗi ĐÃ LÀM SẠCH của riêng khối này (BE không trả URL/khoá) — hiện ngay trong khối, không kéo cả trang vỡ (OPC-07). */
  error?: string;
  /** Ghi chú dưới các dòng (vd "Chưa có dữ liệu thăm dò"). */
  note?: string;
}

/** Một khối sức khoẻ (LiveKit, Egress, Webhook, TURN, Hàng đợi): tiêu đề + huy hiệu trạng thái, các dòng nhãn/giá trị, lỗi riêng nếu có. Chỉ đọc. */
const MediaHealthBlock = memo(function MediaHealthBlock({
  title,
  status,
  rows,
  error,
  note,
}: MediaHealthBlockProps) {
  const meta = status ? statusBadge('mediaHealth', status) : null;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        meta && (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        )
      }
      title={title}
    >
      <div className="flex flex-col gap-2 p-3">
        {error && <Callout description={error} intent="error" variant="ghost" />}
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
              <dt className="text-body-13 text-fg-3">{row.label}</dt>
              <dd className="text-right text-body-14 text-fg-1 tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        {note && (
          <Text size="tiny" skin="muted">
            {note}
          </Text>
        )}
      </div>
    </BoxPanel>
  );
});

export default MediaHealthBlock;
