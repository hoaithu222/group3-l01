import type { AxiosError } from 'axios';
import { memo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import { MENTOR_FEATURE_OFF_CODE } from '../../service/mentor-post-moderation.api';
import { useAdminMentorPost } from '../../service/mentor-post-moderation.queries';
import type { AdminReportGroup } from '../../types/moderation.types';
import MentorPostHideActions from './MentorPostHideActions';
import MentorPostReportContext from './MentorPostReportContext';

export interface MentorPostTargetPanelProps {
  /** Nhóm báo cáo có `targetType = MENTOR_POST` — `targetId` là id bài. */
  group: AdminReportGroup;
  /** `moderation:update` — ẩn/khôi phục. */
  canUpdate: boolean;
}

/**
 * Phần riêng của báo cáo `MENTOR_POST` trên trang chi tiết (p6-03 admin.md §2.1): ngữ cảnh + nội dung bài (bài công khai với
 * người đăng nhập → hiển thị đầy đủ) → ẩn/khôi phục. Bài không còn → 404; cờ `mentor` tắt → 404 `CFG_005`.
 */
const MentorPostTargetPanel = memo(function MentorPostTargetPanel({
  group,
  canUpdate,
}: MentorPostTargetPanelProps) {
  const { data: post, isLoading, isError, error, refetch } = useAdminMentorPost(group.targetId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (isError || !post) {
    const code = extractErrorCode(error as AxiosError);
    const status = (error as AxiosError | null)?.response?.status;
    if (code === MENTOR_FEATURE_OFF_CODE || status === 404) {
      return (
        <BoxPanel border="hairline" title="Bài tìm cố vấn bị báo cáo">
          <EmptyState
            description={
              code === MENTOR_FEATURE_OFF_CODE
                ? 'Phân hệ Cố vấn đang tắt trên hệ thống nên chưa xem được bài. Bật lại ở Cấu hình → Tính năng.'
                : 'Bài không còn tồn tại nên không còn thuộc phạm vi kiểm duyệt.'
            }
            size="sm"
            title={code === MENTOR_FEATURE_OFF_CODE ? 'Cố vấn đang tắt' : 'Bài không còn khả dụng'}
          />
        </BoxPanel>
      );
    }
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được bài tìm cố vấn"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <MentorPostReportContext post={post} />
      <MentorPostHideActions canUpdate={canUpdate} post={post} />
    </div>
  );
});

export default MentorPostTargetPanel;
