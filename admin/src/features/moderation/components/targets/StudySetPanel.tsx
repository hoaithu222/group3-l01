import type { AxiosError } from 'axios';
import { memo } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import { STUDY_FEATURE_OFF_CODE } from '../../constants/study-set-moderation.constants';
import { useAdminStudySet } from '../../service/study-set-moderation.queries';
import StudySetHideActions from './StudySetHideActions';
import StudySetItemsTable from './StudySetItemsTable';
import StudySetReportContext from './StudySetReportContext';

export interface StudySetPanelProps {
  /** Id bộ học. */
  setId: string;
  /** `moderation:update` — ẩn/khôi phục. */
  canUpdate: boolean;
}

/**
 * Khối xem + xử lý MỘT bộ học theo id (admin.md p4-01 §2.1): ngữ cảnh bộ học → nội dung (CHỈ bộ PUBLIC) →
 * ẩn/khôi phục. Dùng ở trang chi tiết báo cáo (`StudySetTargetPanel`) và ngăn kéo của tab `content`
 * (`StudySetDetailDrawer`).
 *
 * Riêng tư (admin-plan §3.4): nội dung mục chỉ được TẢI và hiển thị khi BE báo `canViewContent` VÀ bộ là
 * PUBLIC — bộ WORKSPACE chỉ hiện thông tin chung (không gọi route mục, nên dù BE lỡ trả cũng không có gì
 * để lộ). Bộ PRIVATE/đã xoá BE trả 404 → trạng thái "không còn khả dụng"; cờ `study` tắt → 404 `CFG_005`.
 */
const StudySetPanel = memo(function StudySetPanel({ setId, canUpdate }: StudySetPanelProps) {
  const { data: set, isLoading, isError, error, refetch } = useAdminStudySet(setId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (isError || !set) {
    const code = extractErrorCode(error as AxiosError);
    const status = (error as AxiosError | null)?.response?.status;
    if (code === STUDY_FEATURE_OFF_CODE) {
      return (
        <BoxPanel border="hairline" title="Bộ học bị báo cáo">
          <EmptyState
            description="Phân hệ Học tập đang tắt trên hệ thống nên chưa xem được bộ học. Bật lại ở Cấu hình → Tính năng."
            size="sm"
            title="Học tập đang tắt"
          />
        </BoxPanel>
      );
    }
    if (status === 404) {
      return (
        <BoxPanel border="hairline" title="Bộ học bị báo cáo">
          <EmptyState
            description="Bộ học đã bị xoá hoặc chuyển sang riêng tư nên không còn thuộc phạm vi kiểm duyệt."
            size="sm"
            title="Bộ học không còn khả dụng"
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
        title="Không tải được bộ học"
      />
    );
  }

  const showContent = set.canViewContent && set.visibility === 'PUBLIC';

  return (
    <div className="flex flex-col gap-3">
      <StudySetReportContext set={set} />
      {showContent ? (
        <StudySetItemsTable setId={set.id} />
      ) : (
        <BoxPanel border="hairline" title="Nội dung bộ học">
          <div className="p-3">
            <Callout
              description="Bộ học trong nhóm — chỉ hiển thị thông tin chung. Nội dung các mục là dữ liệu của nhóm nên quản trị nền tảng không xem; hãy liên hệ chủ nhóm nếu cần xử lý."
              icon="lock-bold"
              intent="neutral"
            />
          </div>
        </BoxPanel>
      )}
      <StudySetHideActions canUpdate={canUpdate} set={set} />
    </div>
  );
});

export default StudySetPanel;
