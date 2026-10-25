import { memo } from 'react';
import type { ReactNode } from 'react';

import { Badge, BoxPanel, Callout, Skeleton, Text } from '@/shared/ui';
import { formatDate, formatRelativeTime } from '@/shared/utils/format';

import { COLLAB_STATUS_META, NO_DATA } from '../constants/collab-ops.constants';
import type { CollabHealthView } from '../types/collab-ops.types';
import { formatUptime, kindsLabel } from '../utils/collab-ops.utils';

export interface CollabHealthPanelProps {
  /** `undefined` = đang tải lần đầu hoặc tải lỗi. */
  health: CollabHealthView | undefined;
  loading: boolean;
}

interface RowProps {
  label: string;
  children: ReactNode;
}

const Row = memo(function Row({ label, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Text size="small" skin="muted">
        {label}
      </Text>
      <div className="text-body-14-medium text-fg-1">{children}</div>
    </div>
  );
});

/** "12:03 21/09/2026 (5 phút trước)" — `null` (chưa từng) → `—`. */
const when = (iso: string | null | undefined): string =>
  iso ? `${formatDate(iso, 'HH:mm DD/MM/YYYY')} (${formatRelativeTime(iso)})` : NO_DATA;

/**
 * Sức khoẻ service `collab/` (admin.md p6-01 §2.1): trạng thái luôn kèm CHỮ cạnh màu (Hoạt động / Suy giảm / Không phản hồi / Chưa cấu
 * hình), phiên bản, thời gian chạy, loại tài nguyên và mốc liên lạc BE↔collab. Không hiện bí mật nội bộ hay URL: BE không trả chúng.
 * Không phản hồi/suy giảm/chưa cấu hình → Callout hướng dẫn kiểm hạ tầng thay vì chỉ một Badge.
 */
const CollabHealthPanel = memo(function CollabHealthPanel({
  health,
  loading,
}: CollabHealthPanelProps) {
  const meta = health ? COLLAB_STATUS_META[health.status] : undefined;
  const detail = health?.detail;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        meta ? (
          <Badge color={meta.color} dot size="sm" variant="tinted">
            {meta.label}
          </Badge>
        ) : null
      }
      title="Sức khoẻ dịch vụ soạn thảo cộng tác"
    >
      <div className="flex flex-col gap-2 p-2">
        {loading && !health ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {health?.status === 'disabled' && (
              <Callout
                description="Backend chưa có COLLAB_INTERNAL_URL / COLLAB_SHARED_SECRET nên không gọi được dịch vụ. Cấu hình xong, tab này tự cập nhật ở lượt làm mới kế tiếp."
                intent="warning"
                title="Dịch vụ soạn thảo cộng tác chưa được cấu hình"
              />
            )}
            {health?.status === 'down' && (
              <Callout
                description="Backend đã được cấu hình nhưng không nhận được phản hồi từ dịch vụ collab trong 3 giây: kiểm tra container collab và mạng nội bộ (docker compose ps / logs collab, xem runbook vận hành trong deploy/runbooks). Soạn thảo cộng tác thời gian thực sẽ không hoạt động."
                intent="error"
                title="Dịch vụ soạn thảo cộng tác không phản hồi"
              />
            )}
            {health?.status === 'degraded' && (
              <Callout
                description="Dịch vụ còn chạy nhưng đang gặp sự cố (Redis lỗi, không lưu được xuống backend, hoặc đang tắt dần). Kiểm tra log dịch vụ collab."
                intent="warning"
                title="Dịch vụ soạn thảo cộng tác đang suy giảm"
              />
            )}

            {health && (
              <>
                <Row label="Phiên bản">{detail?.version ?? NO_DATA}</Row>
                <Row label="Thời gian chạy">{formatUptime(detail?.uptimeSeconds)}</Row>
                <Row label="Loại tài nguyên phục vụ">{kindsLabel(detail?.kinds)}</Row>
                <Row label="Redis">{detail?.redis ?? NO_DATA}</Row>
                <Row label="Backend phản hồi gần nhất">{when(detail?.be?.lastOkAt)}</Row>
                {detail?.be?.lastErrorAt && (
                  <Row label="Lỗi gọi backend gần nhất">{when(detail.be.lastErrorAt)}</Row>
                )}
              </>
            )}
          </>
        )}
      </div>
    </BoxPanel>
  );
});

export default CollabHealthPanel;
