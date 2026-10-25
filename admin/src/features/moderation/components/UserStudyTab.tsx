import type { AxiosError } from 'axios';
import { memo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { Button, Callout, EmptyState, Skeleton } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { STUDY_FEATURE_OFF_CODE } from '../constants/study-set-moderation.constants';
import { useUserStudySummary } from '../service/study-set-moderation.queries';

export interface UserStudyTabProps {
  userId: string;
}

/**
 * Tab "Học tập" trong ngăn kéo người dùng (admin.md p4-01 §1, P1) — `GET /admin/users/:id/study-summary` (`moderation:view`): CHỈ SỐ LIỆU — tổng số bộ
 * học, số bộ công khai / trong nhóm / riêng tư và số bộ đang bị ẩn. Không có tiêu đề hay nội dung bộ nào (bộ riêng tư/trong nhóm là dữ liệu của người dùng/nhóm,
 * quản trị nền tảng chỉ xử lý bộ công khai bị báo cáo — xem tab `content` của `/moderation`). `total` không tính bộ đã xoá. Cờ `study` tắt → `404 CFG_005`.
 */
const UserStudyTab = memo(function UserStudyTab({ userId }: UserStudyTabProps) {
  const { data, isError, error, refetch } = useUserStudySummary(userId);

  if (!data) {
    if (isError) {
      const status = (error as AxiosError | null)?.response?.status;
      if (extractErrorCode(error as AxiosError) === STUDY_FEATURE_OFF_CODE) {
        return (
          <EmptyState
            description="Phân hệ Học tập đang tắt trên hệ thống. Bật lại ở Cấu hình → Tính năng."
            size="sm"
            title="Học tập đang tắt"
          />
        );
      }
      // 404 = người dùng không còn — thử lại vẫn 404 nên không có nút.
      if (status === 404) {
        return <EmptyState size="sm" title="Không tìm thấy người dùng" />;
      }
      return (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          description="Kiểm tra kết nối và quyền xem kiểm duyệt rồi thử lại."
          intent="error"
          title="Không tải được số liệu học tập"
        />
      );
    }
    return <Skeleton className="w-full" height={120} />;
  }

  const stats = [
    { label: 'Tổng số bộ học', value: data.total },
    { label: 'Công khai', value: data.public },
    { label: 'Trong nhóm', value: data.workspace },
    { label: 'Riêng tư', value: data.private },
    { label: 'Đang bị ẩn', value: data.hidden },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <dt className="text-body-13 text-fg-3">{s.label}</dt>
            <dd className="tabular-nums text-body-14-semibold text-fg-1">{formatNumber(s.value)}</dd>
          </div>
        ))}
      </dl>
      <Callout
        description="Chỉ hiển thị số liệu. Nội dung bộ học riêng tư và bộ trong nhóm là dữ liệu của người dùng/nhóm nên quản trị nền tảng không xem; bộ công khai bị báo cáo nhiều xử lý ở Kiểm duyệt → Nội dung công khai."
        icon="lock-bold"
        intent="neutral"
      />
    </div>
  );
});

export default UserStudyTab;
