import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  BoxPanel,
  Button,
  Callout,
  EmptyState,
  PageBody,
  PageShell,
  Skeleton,
  Toolbar,
} from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

import AuditLogDetailDrawer from '../components/AuditLogDetailDrawer';
import AuditLogFilters from '../components/AuditLogFilters';
import AuditLogTable from '../components/AuditLogTable';
import { useAuditLogFilters } from '../hooks';
import { useAuditLogList } from '../service/audit-log.queries';
import type { AuditLogDto } from '../types/audit-log.types';

const SKELETON_ROWS = 6;

/**
 * Nhật ký quản trị toàn hệ thống (`GET /audit-logs`) — CHỈ ĐỌC. Bộ lọc đồng bộ URL
 * (`useAuditLogFilters`), phân trang cursor bằng nút "Tải thêm" (không `Table pagination`),
 * bấm dòng mở drawer chi tiết. Quyền vào trang (`audit-log:view`) do `PermissionGuard` của
 * registry chặn (thiếu → `/403`).
 */
const AuditLogPage = memo(function AuditLogPage() {
  const state = useAuditLogFilters();
  const { setText, clear, hasActiveFilter } = state;

  const query = useAuditLogList(state.filters);
  const { isLoading, isError, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = query;
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const handleCloseDrawer = useCallback(() => setSelected(null), []);
  const handleFilterActor = useCallback(
    (actorId: string) => setText('actorId', actorId),
    [setText],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const handleLoadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const actorName = useMemo(
    () => rows.find((r) => r.actorId === state.values.actorId)?.actor?.name,
    [rows, state.values.actorId],
  );

  const errorCallout = (
    <Callout
      action={
        <Button size="sm" variant="stroke" onClick={handleRetry}>
          Thử lại
        </Button>
      }
      description="Kiểm tra kết nối rồi thử lại."
      intent="error"
      title="Không tải được nhật ký"
    />
  );

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} className="w-full" height={36} />
        ))}
      </div>
    );
  } else if (rows.length === 0 && isError) {
    body = <div className="p-2">{errorCallout}</div>;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        action={
          hasActiveFilter ? (
            <Button size="sm" variant="stroke" onClick={clear}>
              Xoá bộ lọc
            </Button>
          ) : undefined
        }
        icon="history-bold"
        title="Không có nhật ký phù hợp bộ lọc"
      />
    );
  } else {
    body = (
      <>
        {isError && <div className="shrink-0 p-2">{errorCallout}</div>}
        <AuditLogTable rows={rows} onFilterActor={handleFilterActor} onRowClick={setSelected} />
      </>
    );
  }

  return (
    <PageShell>
      <PageHeader title="Nhật ký" tone="indigo" />
      <Toolbar left={<AuditLogFilters actorName={actorName} state={state} />} />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel
          bodyOverflow="hidden"
          border="hairline"
          description={
            rows.length > 0
              ? `Đã tải ${rows.length} dòng${hasNextPage ? ' — còn nữa' : ''}`
              : undefined
          }
          footer={
            hasNextPage ? (
              <Button
                className="mx-auto"
                loading={isFetchingNextPage}
                size="sm"
                variant="stroke"
                onClick={handleLoadMore}
              >
                Tải thêm
              </Button>
            ) : undefined
          }
          title="Nhật ký thao tác quản trị"
        >
          {body}
        </BoxPanel>
      </PageBody>

      <AuditLogDetailDrawer row={selected} onClose={handleCloseDrawer} />
    </PageShell>
  );
});

export default AuditLogPage;
