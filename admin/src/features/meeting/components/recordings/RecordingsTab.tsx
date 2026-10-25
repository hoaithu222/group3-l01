import { lazy, memo, Suspense } from 'react';

import { RECORDING_URL_KEYS } from '@/features/workspace/constants/workspace-recordings.constants';
import { isMeetingIdParam } from '@/features/workspace/utils/workspace-recordings.utils';
import { useQueryParams } from '@/shared/hooks';
import { Badge, Button, Skeleton } from '@/shared/ui';

import { MEETING_URL_KEYS } from '../../constants/meeting.constants';
import WorkspaceFilter from '../common/WorkspaceFilter';

/**
 * Nội dung tab "Ghi hình" TÁI DÙNG nguyên của tab ghi hình workspace (`features/workspace`: thẻ tóm tắt, bộ lọc, bảng, ngăn kéo, xoá có lý do — admin.md
 * p2-06 §2), không viết lại. Nạp lười để phân hệ này không kéo cả bảng/ngăn kéo ghi hình vào bundle khi chưa mở tab.
 */
const WorkspaceRecordingsTab = lazy(
  () => import('@/features/workspace/components/tabs/WorkspaceRecordingsTab'),
);

/**
 * Tab "Ghi hình" toàn nền tảng (admin.md p2-07 §2.4): khung tab + bộ lọc workspace (`?workspaceId=`, đến từ ngăn kéo cuộc họp hoặc chọn tại đây) bọc quanh
 * tab ghi hình dùng chung. Bỏ trống workspace = toàn nền tảng (bảng có thêm cột Workspace). Bộ lọc riêng của bảng ghi hình dùng các khoá `rec*` nên
 * không dính bộ lọc của tab khác; `?recStatus=FAILED` mở thẳng danh sách bản lỗi (liên kết từ tab Hạ tầng media). `?meetingId=` (từ ngăn kéo/cột "Ghi hình"
 * của bảng cuộc họp) chỉ giữ bản ghi của MỘT cuộc họp — BE lọc phía server; id sai dạng bị bỏ qua và không hiện chip lọc.
 */
const RecordingsTab = memo(function RecordingsTab() {
  const qp = useQueryParams();
  const workspaceId = qp.getParam(MEETING_URL_KEYS.workspace);
  const meetingParam = qp.getParam(MEETING_URL_KEYS.meeting);
  const meetingId = isMeetingIdParam(meetingParam) ? meetingParam : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <WorkspaceFilter
          workspaceId={workspaceId}
          onChange={(next) =>
            qp.updateParams({ [MEETING_URL_KEYS.workspace]: next, [RECORDING_URL_KEYS.page]: null })
          }
        />
        {meetingId && (
          <>
            <Badge color="info" variant="tinted">
              Chỉ bản ghi của một cuộc họp
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                qp.updateParams({
                  [MEETING_URL_KEYS.meeting]: null,
                  [RECORDING_URL_KEYS.page]: null,
                })
              }
            >
              Bỏ lọc cuộc họp
            </Button>
          </>
        )}
      </div>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <WorkspaceRecordingsTab meetingId={meetingId} workspaceId={workspaceId || undefined} />
      </Suspense>
    </div>
  );
});

export default RecordingsTab;
