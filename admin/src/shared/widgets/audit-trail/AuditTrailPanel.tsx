import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useAuditLogByTarget } from '@/features/audit-log';
import type { AuditLogDto } from '@/features/audit-log';
import { auditActionLabel } from '@/shared/constants/audit-actions';
import { Button, Callout, EmptyState, Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format/format.utils';

export interface AuditTrailPanelProps {
  /** Loại đối tượng (`targetType` BE ghi). Bỏ trống cùng `targetId` để chỉ lọc theo `workspaceId`/`actions`. */
  targetType?: string;
  targetId?: string;
  /** Gom mọi bản ghi của một workspace (thành viên, lời mời, khách… có `targetType` khác nhau). */
  workspaceId?: string;
  /** Chỉ hiện các mã hành động này (BE lọc `IN`, tối đa 30). Bỏ trống = mọi hành động. */
  actions?: readonly string[];
  /** Số dòng mỗi lượt tải. Mặc định 20. */
  limit?: number;
}

/**
 * Nhật ký audit của MỘT đối tượng cụ thể — dùng trong drawer chi tiết (user,
 * workspace, cấu hình…). Đọc `GET /audit-logs?targetType=&targetId=` qua CHUNG service
 * + key factory với trang `/audit-log` (`useAuditLogByTarget`, `useInfiniteQuery`).
 *
 * BE trả `at` (thời gian) và `actor { id, name, role }` — panel đọc đúng hai trường
 * đó (bản cũ đọc `createdAt`/`actorName` không tồn tại ⇒ cột thời gian trống, tên rơi về id).
 *
 * BE phân trang kiểu CURSOR (không phải `page`/`limit`) nên panel này KHÔNG dùng
 * `Table pagination` — chỉ nút "Tải thêm" khi còn trang sau, dồn dòng mới xuống dưới dòng
 * cũ (đọc nhật ký theo dòng thời gian liên tục tự nhiên hơn lật trang).
 */
const AuditTrailPanel = memo(function AuditTrailPanel({
  targetType,
  targetId,
  workspaceId,
  actions,
  limit = 20,
}: AuditTrailPanelProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('audit-log', 'view');

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useAuditLogByTarget(targetType, targetId, { limit, enabled: canView, workspaceId, actions });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const columns = useMemo<TableColumn<AuditLogDto>[]>(
    () => [
      {
        key: 'at',
        header: 'Thời gian',
        width: 132,
        cell: (row) => (
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(row.at, 'HH:mm DD/MM/YYYY')}
          </span>
        ),
      },
      {
        key: 'actor',
        header: 'Người thực hiện',
        width: 160,
        cell: (row) => row.actor?.name ?? row.actorId,
      },
      {
        key: 'action',
        header: 'Hành động',
        width: 180,
        cell: (row) => {
          const label = auditActionLabel(row.action);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-fg-1">{label}</span>
              {label !== row.action && (
                <span className="truncate font-mono text-caption-12 text-fg-4">{row.action}</span>
              )}
            </div>
          );
        },
      },
      {
        key: 'reason',
        header: 'Lý do',
        cell: (row) => <span className="whitespace-pre-wrap text-fg-2">{row.reason ?? '—'}</span>,
      },
    ],
    [],
  );

  const rowKey = useCallback((row: AuditLogDto) => row.id, []);
  const handleLoadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const handleRetry = useCallback(() => void refetch(), [refetch]);

  if (!canView) {
    return (
      <Text size="tiny" skin="muted">
        Bạn không có quyền xem nhật ký quản trị.
      </Text>
    );
  }

  if (isError && rows.length === 0) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={handleRetry}>
            Thử lại
          </Button>
        }
        description="Không tải được nhật ký — thử lại sau."
        intent="error"
      />
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <EmptyState
        description="Chưa có thao tác quản trị nào trên đối tượng này."
        icon="history-bold"
        size="sm"
        title="Chưa có nhật ký"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Table
        columns={columns}
        data={rows}
        emptyMessage="Chưa có nhật ký"
        loading={isLoading && rows.length === 0}
        pagination={false}
        rowKey={rowKey}
      />
      {hasNextPage && (
        <Button
          className="self-center"
          loading={isFetchingNextPage}
          size="sm"
          variant="ghost"
          onClick={handleLoadMore}
        >
          Tải thêm
        </Button>
      )}
    </div>
  );
});

export default AuditTrailPanel;
