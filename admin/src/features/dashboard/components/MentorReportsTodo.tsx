import { useQuery } from '@tanstack/react-query';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import { apiClient } from '@/core/api/client';
import { Callout } from '@/shared/ui';
import type { ApiResponse } from '@/shared/types/api.types';

/** Hàng đợi kiểm duyệt lọc sẵn bài tìm cố vấn đang mở (khoá URL khớp `useReportFilters` của `moderation`). */
const QUEUE_HREF = '/moderation?status=OPEN&targetType=MENTOR_POST';

const MENTOR_REPORTS_TODO_KEY = ['dashboard', 'mentor-reports-open'] as const;

/**
 * Khối "Việc cần làm" (p6-03 admin.md §1 Dashboard): số bài `MENTOR_POST` bị báo cáo còn OPEN — đếm NHÓM báo cáo (một bài
 * nhiều người báo cáo = một mục, IR-25) qua `GET /admin/reports?targetType=MENTOR_POST&status=OPEN&limit=1` (`meta.total`).
 * Ẩn khi cờ `mentor` tắt, thiếu `moderation:view` hoặc không có gì cần làm — KHÔNG hiện "0".
 */
const MentorReportsTodo = memo(function MentorReportsTodo() {
  const enabled = useFeature('mentor');
  const canView = useAuthStore((s) => s.hasPermission('moderation', 'view'));
  const { data: total } = useQuery({
    queryKey: MENTOR_REPORTS_TODO_KEY,
    queryFn: async () =>
      (
        await apiClient.get<ApiResponse<unknown[]>>('/admin/reports', {
          params: { limit: 1, page: 1, status: 'OPEN', targetType: 'MENTOR_POST' },
        })
      ).data.meta?.total ?? 0,
    enabled: enabled === true && canView,
    staleTime: 60_000,
  });

  if (!total) return null;
  return (
    <Callout
      action={
        <Link className="text-link hover:underline" to={QUEUE_HREF}>
          Mở hàng đợi
        </Link>
      }
      description={`${total} bài tìm cố vấn bị báo cáo đang chờ xử lý.`}
      intent="warning"
      title="Việc cần làm — Mentor Connect"
    />
  );
});

export default MentorReportsTodo;
