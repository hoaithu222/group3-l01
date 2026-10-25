import { memo, useState } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { STUDY_HIDDEN_CODE } from '../../constants/study-set-moderation.constants';
import { useHideStudySet, useRestoreStudySet } from '../../service/study-set-moderation.queries';
import type { AdminStudySet } from '../../types/study-set-moderation.types';
import { errorCodeOf } from '../../utils/report-errors';

export interface StudySetHideActionsProps {
  set: AdminStudySet;
  /** `moderation:update` — không có thì không nút nào hiện. */
  canUpdate: boolean;
}

type Decision = 'HIDE' | 'RESTORE';

const HIDE_IMPACT =
  'Bộ học biến mất khỏi khám phá và người khác không xem được; tác giả thấy trạng thái "Đã ẩn" kèm lý do dưới đây. Mọi báo cáo đang mở của bộ được đóng (kết quả "Đã gỡ nội dung").';
const RESTORE_IMPACT = 'Bộ học hiển thị lại với mọi người đăng nhập.';

/**
 * Khối "Xử lý bộ học" (admin.md p4-01 §2.1 "Quyết định"): **Ẩn bộ học** / **Khôi phục** — chỉ với bộ
 * CÔNG KHAI (BE trả 403 với bộ WORKSPACE: chủ/quản trị nhóm tự xử lý bằng `hide/unhide` của họ) và chỉ
 * khi có `moderation:update`. Mọi quyết định đi qua `ConfirmWithReasonModal` (lý do ≥ 10 ký tự, khớp
 * `reasonSchema`) và BE ghi audit `study-set.hide|restore`.
 *
 * Đứng riêng khỏi `ReportDecisionBar` vì "Khôi phục" phải còn dùng được SAU khi báo cáo đã đóng (ẩn bộ
 * đóng luôn báo cáo mở), còn khối quyết định của báo cáo khi đó chỉ đọc.
 */
const StudySetHideActions = memo(function StudySetHideActions({
  set,
  canUpdate,
}: StudySetHideActionsProps) {
  // `decision` giữ nguyên khi đóng modal để nội dung không nháy sang quyết định kia lúc đang trượt ra.
  const [decision, setDecision] = useState<Decision>('HIDE');
  const { close, isOpen, open } = useDisclosure();
  const hide = useHideStudySet();
  const restore = useRestoreStudySet();

  const isPublic = set.visibility === 'PUBLIC';
  const canHide = isPublic && set.status === 'ACTIVE';
  const canRestore = isPublic && set.status === 'HIDDEN';

  if (!canUpdate) return null;

  let body;
  if (!isPublic) {
    body = (
      <Callout
        description="Bộ học trong nhóm — quản trị nền tảng chỉ xem thông tin chung. Chủ hoặc quản trị viên nhóm ẩn/khôi phục bộ này; hãy liên hệ họ nếu cần xử lý."
        intent="neutral"
      />
    );
  } else if (canHide || canRestore) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        {canHide && (
          <Button
            size="sm"
            skin="danger"
            startIcon={<SystemIcon name="eye-slash-outline" size={14} />}
            variant="stroke"
            onClick={() => {
              setDecision('HIDE');
              open();
            }}
          >
            Ẩn bộ học
          </Button>
        )}
        {canRestore && (
          <Button
            size="sm"
            startIcon={<SystemIcon name="eye-outline" size={14} />}
            variant="stroke"
            onClick={() => {
              setDecision('RESTORE');
              open();
            }}
          >
            Khôi phục bộ học
          </Button>
        )}
      </div>
    );
  } else {
    body = <Callout description="Bộ học đã bị xoá, không còn thao tác nào." intent="neutral" />;
  }

  /** Bộ đã đổi trạng thái do người khác (`STUDY_004`) — hook đã làm mới; giữ modal mở là vô nghĩa. */
  const run = async (reason: string) => {
    try {
      await (decision === 'HIDE' ? hide : restore).mutateAsync({ setId: set.id, reason });
    } catch (err) {
      if (errorCodeOf(err) !== STUDY_HIDDEN_CODE) throw err;
    }
  };

  return (
    <BoxPanel border="hairline" title="Xử lý bộ học">
      <div className="p-3">{body}</div>
      <ConfirmWithReasonModal
        confirmLabel={decision === 'HIDE' ? 'Ẩn bộ học' : 'Khôi phục'}
        confirmTone={decision === 'HIDE' ? 'danger' : 'primary'}
        impact={decision === 'HIDE' ? HIDE_IMPACT : RESTORE_IMPACT}
        open={isOpen}
        title={decision === 'HIDE' ? `Ẩn bộ học — ${set.title}` : `Khôi phục bộ học — ${set.title}`}
        onConfirm={run}
        onOpenChange={(next) => (next ? open() : close())}
      />
    </BoxPanel>
  );
});

export default StudySetHideActions;
