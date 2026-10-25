import type { AxiosError } from 'axios';
import { memo, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Callout, ConfirmWithReasonModal, EmptyState, Table } from '@/shared/ui';

import { MENTOR_FEATURE_OFF_CODE } from '../../constants/workspace-mentor.constants';
import { useEndMentorEngagement, useWorkspaceMentor } from '../../service/workspace-mentor.queries';
import type {
  WorkspaceMentorEngagement,
  WorkspaceMentorPost,
} from '../../types/workspace-mentor.types';
import {
  buildMentorEngagementColumns,
  buildMentorPostColumns,
} from '../workspace-mentor-table.columns';
import WorkspaceLoadError from '../WorkspaceLoadError';

export interface WorkspaceMentorTabProps {
  workspaceId: string;
}

const END_IMPACT =
  'Đợt cố vấn kết thúc ngay: cố vấn bị thu hồi quyền khách vào nhóm, rời các nhóm chat liên quan và nhận thông báo. Chỗ trên bài đăng được trả lại (bài có thể nhận đơn lại nếu chưa hết hạn). Không thể hoàn tác.';

const postKey = (p: WorkspaceMentorPost) => p.id;
const engagementKey = (e: WorkspaceMentorEngagement) => e.id;

/**
 * Tab "Cố vấn" của `WorkspaceDetailPage` (p6-03 admin.md §2.2): bài tìm cố vấn của nhóm và các đợt cố vấn. Hành động duy nhất là "Kết thúc cấp nền
 * tảng" một đợt ACTIVE (`workspace:update`, lý do ≥ 10 ký tự qua `ConfirmWithReasonModal`, audit `mentor.engagement-end-platform`). Ẩn/khôi phục bài
 * làm ở trang kiểm duyệt. KHÔNG hiển thị lời nhắn ứng tuyển (dữ liệu giữa hai bên) — chỉ số lượng đơn.
 *
 * Cờ `mentor` tắt giữa chừng (404 `CFG_005`) → "Cố vấn đang tắt". Lỗi tải khác có trạng thái riêng, không vẽ bảng rỗng.
 */
const WorkspaceMentorTab = memo(function WorkspaceMentorTab({
  workspaceId,
}: WorkspaceMentorTabProps) {
  const canEnd = useAuthStore((s) => s.hasPermission('workspace', 'update'));
  const { data, isLoading, error, refetch } = useWorkspaceMentor(workspaceId);
  const overview = data?.data;
  const endEngagement = useEndMentorEngagement(workspaceId);
  const { close, isOpen, open } = useDisclosure();
  const [target, setTarget] = useState<WorkspaceMentorEngagement | null>(null);

  const postColumns = useMemo(() => buildMentorPostColumns(), []);
  const engagementColumns = useMemo(
    () =>
      buildMentorEngagementColumns({
        canEnd,
        onEnd: (e) => {
          setTarget(e);
          open();
        },
      }),
    [canEnd, open],
  );

  let body;
  if (!overview && !isLoading) {
    const featureOff = error
      ? extractErrorCode(error as AxiosError) === MENTOR_FEATURE_OFF_CODE
      : false;
    body = featureOff ? (
      <EmptyState
        description="Phân hệ cố vấn đang tắt trên hệ thống nên chưa có dữ liệu."
        icon="user-check-bold"
        title="Cố vấn đang tắt"
      />
    ) : (
      <WorkspaceLoadError
        error={error}
        title="Không tải được dữ liệu cố vấn"
        onRetry={() => void refetch()}
      />
    );
  } else {
    body = (
      <>
        <BoxPanel border="hairline" title="Đợt cố vấn">
          <Table
            columns={engagementColumns}
            data={overview?.engagements ?? []}
            emptyMessage="Nhóm chưa có đợt cố vấn nào"
            loading={isLoading}
            pagination={false}
            rowKey={engagementKey}
          />
        </BoxPanel>
        <BoxPanel border="hairline" title="Bài tìm cố vấn">
          <Table
            columns={postColumns}
            data={overview?.posts ?? []}
            emptyMessage="Nhóm chưa đăng bài tìm cố vấn nào"
            loading={isLoading}
            pagination={false}
            rowKey={postKey}
          />
        </BoxPanel>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Không hiển thị lời nhắn ứng tuyển (dữ liệu giữa hai bên), chỉ số lượng đơn. Ẩn hoặc khôi phục bài đăng làm ở trang Kiểm duyệt."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {body}
      {target && (
        <ConfirmWithReasonModal
          confirmLabel="Kết thúc đợt"
          confirmTone="danger"
          impact={END_IMPACT}
          open={isOpen}
          title={`Kết thúc cấp nền tảng — ${target.mentor.name || 'cố vấn'}`}
          onConfirm={async (reason) => {
            await endEngagement.mutateAsync({ engagementId: target.id, reason });
          }}
          onOpenChange={(next) => !next && close()}
        />
      )}
    </div>
  );
});

export default WorkspaceMentorTab;
