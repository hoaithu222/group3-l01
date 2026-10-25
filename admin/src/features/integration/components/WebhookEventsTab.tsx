import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useNavHref } from '@/shared/hooks';
import { Button, Callout, Dropdown, RangeDatePicker, Table, Toolbar } from '@/shared/ui';
import { WorkspacePicker } from '@/shared/widgets/workspace-picker';

import {
  EVENTS_PAGE_SIZE,
  PROVIDER_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from '../constants/integration.labels';
import { useEventFilters } from '../hooks/useEventFilters';
import { useWebhookEvents } from '../service/integration.queries';
import type { AdminWebhookEvent } from '../types/integration.types';
import WebhookEventDrawer from './WebhookEventDrawer';
import { buildWebhookEventColumns } from './webhook-events.columns';

/**
 * Tab "Sự kiện webhook" (admin.md p5-03 §2.1): bảng phân trang server (50/trang), lọc nhà cung cấp · trạng thái · workspace · khoảng ngày — mọi
 * bộ lọc và ngăn kéo chi tiết (`?eventId=`, deep link `/integration/events/:id` chuyển về đây) sống trên URL. CHỈ metadata — payload (đã che) chỉ
 * có trong ngăn kéo. Ô workspace cần `workspace:view` (gọi `GET /admin/workspaces`).
 */
const WebhookEventsTab = memo(function WebhookEventsTab() {
  const f = useEventFilters();
  const buildHref = useNavHref();
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const { data, isLoading, isError, refetch } = useWebhookEvents(f.params);
  const { openEvent } = f;

  const columns = useMemo(
    () =>
      buildWebhookEventColumns({
        hrefFor: (e) => buildHref({ eventId: e.id }),
        onOpen: (e) => openEvent(e.id),
        workspaceHref: canViewWorkspace
          ? (id) => `/workspace/${encodeURIComponent(id)}`
          : undefined,
      }),
    [buildHref, canViewWorkspace, openEvent],
  );
  const rowKey = useCallback((e: AdminWebhookEvent) => e.id, []);
  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col gap-3">
      <Toolbar
        left={
          <>
            <Dropdown
              aria-label="Lọc theo nhà cung cấp"
              className="w-44"
              options={PROVIDER_FILTER_OPTIONS}
              size="sm"
              value={f.values.provider}
              onValueChange={f.setProvider}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-40"
              options={STATUS_FILTER_OPTIONS}
              size="sm"
              value={f.values.status}
              onValueChange={f.setStatus}
            />
            {canViewWorkspace && (
              <WorkspacePicker
                allLabel="Mọi workspace"
                value={f.values.workspace}
                onChange={f.setWorkspace}
              />
            )}
            <RangeDatePicker
              align="end"
              className="w-64"
              placeholder="Khoảng ngày nhận"
              range={f.values.range}
              showQuickSelect
              size="sm"
              onRangeChange={f.setRange}
            />
          </>
        }
        right={
          f.hasActiveFilter ? (
            <Button size="sm" variant="ghost" onClick={f.clear}>
              Xoá bộ lọc
            </Button>
          ) : null
        }
      />
      {isError && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối rồi thử lại."
          intent="error"
          title="Không tải được sự kiện webhook"
        />
      )}
      {(!isError || data) && (
        <Table
          columns={columns}
          currentPage={f.page}
          data={rows}
          emptyMessage={
            f.hasActiveFilter ? 'Không có sự kiện nào khớp bộ lọc' : 'Chưa nhận sự kiện webhook nào'
          }
          loading={isLoading}
          pageSize={EVENTS_PAGE_SIZE}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={f.setPage}
        />
      )}
      <WebhookEventDrawer
        eventId={f.eventId}
        onClose={() => openEvent(null)}
        onOpenEvent={openEvent}
      />
    </div>
  );
});

export default WebhookEventsTab;
