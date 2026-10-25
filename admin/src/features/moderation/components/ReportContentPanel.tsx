import { memo, useState } from 'react';
import type { ReactNode } from 'react';

import { BoxPanel, Callout, ConfirmWithReasonModal, EmptyState } from '@/shared/ui';

import { useRemoveMessage } from '../service/moderation.queries';
import type { AdminReportGroup, ModerationMessage } from '../types/moderation.types';
import ModerationMessageList from './ModerationMessageList';
import PrivateContentGate from './PrivateContentGate';

export interface ReportContentPanelProps {
  group: AdminReportGroup;
  /** Báo cáo đại diện (`:id` của trang) — khoá gọi `GET .../content`. */
  reportId: string;
  /** `detail.publicContent` — CHỈ có với tin trong kênh public. */
  publicContent?: readonly ModerationMessage[];
  /** `moderation:approve` — xem nội dung riêng tư (D-06). */
  canApprove: boolean;
  /** `moderation:update` — gỡ tin nhanh. */
  canUpdate: boolean;
}

/**
 * Khối "Nội dung" của trang chi tiết (admin.md p1-08 §2.2):
 *  - đích KHÔNG phải tin nhắn → không có gì để hiện;
 *  - tin trong kênh PUBLIC → hiện ngay tin bị báo cáo ±3 tin (`detail.publicContent`);
 *  - tin trong kênh riêng tư/nhóm chat/1-1 → `PrivateContentGate` (xác nhận + ghi nhật ký, D-06).
 * Cùng một hộp thoại "Gỡ tin nhanh" (`POST /admin/messages/:id/remove`) phục vụ cả hai nhánh.
 */
const ReportContentPanel = memo(function ReportContentPanel({
  group,
  reportId,
  publicContent,
  canApprove,
  canUpdate,
}: ReportContentPanelProps) {
  const [removing, setRemoving] = useState<ModerationMessage | null>(null);
  const removeMessage = useRemoveMessage(reportId);

  let body: ReactNode;
  if (group.targetType !== 'MESSAGE') {
    body = (
      <EmptyState
        description="Đích của báo cáo không phải tin nhắn nên không có nội dung để hiển thị. Xem mô tả của từng báo cáo ở trên."
        size="sm"
        title="Không có nội dung tin nhắn"
      />
    );
  } else if (group.scope.isPrivate) {
    body = (
      <PrivateContentGate
        key={reportId}
        canApprove={canApprove}
        canRemove={canUpdate}
        reportId={reportId}
        onRemove={setRemoving}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <Callout
          description="Kênh công khai — hiển thị tin bị báo cáo và các tin xung quanh."
          icon="message-bold"
          intent="neutral"
          variant="ghost"
        />
        <ModerationMessageList
          canRemove={canUpdate}
          messages={publicContent ?? []}
          onRemove={setRemoving}
        />
      </div>
    );
  }

  return (
    <BoxPanel border="hairline" title="Nội dung">
      <div className="p-3">{body}</div>
      <ConfirmWithReasonModal
        confirmLabel="Gỡ tin"
        confirmTone="danger"
        impact="Tin hiển thị là đã bị gỡ với mọi người; tác giả được thông báo."
        open={removing !== null}
        title={`Gỡ tin nhắn — ${removing?.authorName ?? 'tin nhắn'}`}
        onConfirm={async (reason) => {
          if (!removing) return;
          await removeMessage.mutateAsync({ messageId: removing.id, reason });
        }}
        onOpenChange={(next) => !next && setRemoving(null)}
      />
    </BoxPanel>
  );
});

export default ReportContentPanel;
