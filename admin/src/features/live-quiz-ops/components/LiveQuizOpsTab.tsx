import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useNavHref, useQueryParams } from '@/shared/hooks';
import { Button, Callout, Dropdown, Table, Toolbar } from '@/shared/ui';

import {
  ALL_FILTER,
  LIVE_QUIZ_PAGE_SIZE,
  LIVE_QUIZ_PAGE_SIZE_OPTIONS,
  LIVE_QUIZ_STATUS_FILTER_OPTIONS,
  LIVE_QUIZ_STATUSES,
} from '../constants/live-quiz-ops.constants';
import { useLiveQuizSessions } from '../service/live-quiz-ops.queries';
import type { AdminLiveQuizListParams, AdminLiveQuizSession } from '../types/live-quiz-ops.types';
import LiveQuizSessionDrawer from './LiveQuizSessionDrawer';
import { buildLiveQuizSessionColumns } from './live-quiz-session-table.columns';

/** BE (`adminSessionsQuerySchema`) chặn `limit` ở 100. */
const LIMIT_MAX = 100;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Tab "Thi đấu trực tiếp" của trang Gamification (admin.md p5-01 §2.1): danh sách phiên Live Quiz, mới nhất trước, phân trang server. Chỉ
 * giám sát vận hành (metadata) — không PIN, nội dung câu hỏi hay đáp án. Trạng thái lọc, trang và ngăn kéo (`?sessionId=`) sống trên URL.
 * BE chỉ lọc được MỘT trạng thái (không có ngày/workspace/host), nên bộ lọc chỉ có ô trạng thái. Còn phiên đang mở trong trang thì làm mới
 * mỗi 15 giây. Bấm dòng mở ngăn kéo có nút "Kết thúc khẩn cấp" (cần `gamification:update`).
 */
const LiveQuizOpsTab = memo(function LiveQuizOpsTab() {
  const qp = useQueryParams({ defaultPageSize: LIVE_QUIZ_PAGE_SIZE });
  const buildHref = useNavHref();
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const canViewWorkspace = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  const { getParam, updateParams } = qp;

  const rawStatus = getParam('status');
  const status = LIVE_QUIZ_STATUSES.find((s) => s === rawStatus);
  const rawSessionId = getParam('sessionId');
  const sessionId = OBJECT_ID.test(rawSessionId) ? rawSessionId : null;
  const limit = Math.min(qp.pageSize, LIMIT_MAX);

  const params = useMemo<AdminLiveQuizListParams>(
    () => ({ page: qp.page, limit, ...(status && { status }) }),
    [qp.page, limit, status],
  );
  const { data, isLoading, isError, refetch } = useLiveQuizSessions(params);

  const openSession = useCallback(
    (id: string | null) => updateParams({ sessionId: id }),
    [updateParams],
  );
  const columns = useMemo(
    () =>
      buildLiveQuizSessionColumns({
        hrefFor: (s) => buildHref({ sessionId: s.id }),
        onOpen: (s) => openSession(s.id),
        userHref: canViewUser ? (id) => `/user/${encodeURIComponent(id)}` : undefined,
        workspaceHref: canViewWorkspace
          ? (id) => `/workspace/${encodeURIComponent(id)}`
          : undefined,
      }),
    [buildHref, canViewUser, canViewWorkspace, openSession],
  );
  const rowKey = useCallback((s: AdminLiveQuizSession) => s.id, []);

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Trang quản trị chỉ giám sát vận hành và can thiệp khẩn cấp. Không hiển thị mã PIN, nội dung câu hỏi hay đáp án của người chơi."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      <Toolbar
        left={
          <Dropdown
            aria-label="Lọc theo trạng thái phiên"
            className="w-44"
            options={LIVE_QUIZ_STATUS_FILTER_OPTIONS}
            size="sm"
            value={status ?? ALL_FILTER}
            onValueChange={(v) => updateParams({ status: v === ALL_FILTER ? null : v, page: null })}
          />
        }
        right={
          status ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateParams({ status: null, page: null })}
            >
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
          title="Không tải được danh sách phiên Live Quiz"
        />
      )}
      {(!isError || data) && (
        <Table
          columns={columns}
          currentPage={qp.page}
          data={data?.data ?? []}
          emptyMessage={
            status ? 'Không có phiên nào ở trạng thái này' : 'Chưa có phiên Live Quiz nào'
          }
          loading={isLoading}
          pageSize={limit}
          pageSizeOptions={LIVE_QUIZ_PAGE_SIZE_OPTIONS}
          rowKey={rowKey}
          total={data?.meta?.total ?? 0}
          onPageChange={qp.setPage}
          onPageSizeChange={qp.setPageSize}
        />
      )}
      <LiveQuizSessionDrawer sessionId={sessionId} onClose={() => openSession(null)} />
    </div>
  );
});

export default LiveQuizOpsTab;
