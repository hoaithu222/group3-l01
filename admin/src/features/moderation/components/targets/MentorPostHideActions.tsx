import { memo, useState } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  useHideMentorPost,
  useUnhideMentorPost,
} from '../../service/mentor-post-moderation.queries';
import type { AdminMentorPost } from '../../types/mentor-post-moderation.types';

export interface MentorPostHideActionsProps {
  post: AdminMentorPost;
  /** `moderation:update` — không có thì không nút nào hiện. */
  canUpdate: boolean;
}

type Decision = 'HIDE' | 'UNHIDE';

const HIDE_IMPACT =
  'Bài biến mất khỏi bảng tin, đơn đang chờ hết hạn, người đăng nhận thông báo. Mọi báo cáo đang mở của bài được đóng (kết quả "Đã gỡ nội dung"). Cố vấn đang hoạt động KHÔNG tự bị kết thúc.';
const UNHIDE_IMPACT =
  'Bài hiện lại trên bảng tin với mọi người đăng nhập (đơn đã hết hạn không khôi phục).';

/**
 * Khối "Xử lý bài" (p6-03 admin.md §2.1 "Quyết định"): **Ẩn bài** / **Khôi phục** (`moderation:update`, lý do ≥ 10 ký tự qua
 * `ConfirmWithReasonModal`, audit `mentor.post-hide|unhide`). Còn cố vấn đang hoạt động → cảnh báo bằng chữ: ẩn bài không kết
 * thúc đợt cố vấn (quyết định của nhóm); "Kết thúc cấp nền tảng" ở tab `mentor` của drawer workspace (`workspace:update`).
 * Đứng riêng khỏi `ReportDecisionBar` để "Khôi phục" còn dùng được SAU khi báo cáo đã đóng.
 */
const MentorPostHideActions = memo(function MentorPostHideActions({
  post,
  canUpdate,
}: MentorPostHideActionsProps) {
  const [decision, setDecision] = useState<Decision>('HIDE');
  const { close, isOpen, open } = useDisclosure();
  const hide = useHideMentorPost();
  const unhide = useUnhideMentorPost();

  if (!canUpdate) return null;
  const hidden = !!post.hiddenAt;

  const choose = (next: Decision) => {
    setDecision(next);
    open();
  };

  return (
    <BoxPanel border="hairline" title="Xử lý bài tìm cố vấn">
      <div className="flex flex-col gap-2 p-3">
        {post.activeEngagements > 0 && (
          <Callout
            description={`Còn ${post.activeEngagements} cố vấn đang hoạt động trong nhóm — ẩn bài không kết thúc các đợt này.`}
            intent="warning"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {hidden ? (
            <Button
              size="sm"
              startIcon={<SystemIcon name="eye-outline" size={14} />}
              variant="stroke"
              onClick={() => choose('UNHIDE')}
            >
              Khôi phục bài
            </Button>
          ) : (
            <Button
              size="sm"
              skin="danger"
              startIcon={<SystemIcon name="eye-slash-outline" size={14} />}
              variant="stroke"
              onClick={() => choose('HIDE')}
            >
              Ẩn bài
            </Button>
          )}
        </div>
      </div>
      <ConfirmWithReasonModal
        confirmLabel={decision === 'HIDE' ? 'Ẩn bài' : 'Khôi phục'}
        confirmTone={decision === 'HIDE' ? 'danger' : 'primary'}
        impact={decision === 'HIDE' ? HIDE_IMPACT : UNHIDE_IMPACT}
        open={isOpen}
        title={decision === 'HIDE' ? `Ẩn bài — ${post.title}` : `Khôi phục bài — ${post.title}`}
        onConfirm={async (reason) => {
          await (decision === 'HIDE' ? hide : unhide).mutateAsync({ postId: post.id, reason });
        }}
        onOpenChange={(next) => (next ? open() : close())}
      />
    </BoxPanel>
  );
});

export default MentorPostHideActions;
