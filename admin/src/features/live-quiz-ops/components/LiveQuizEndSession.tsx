import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import { useDisclosure } from '@/shared/hooks';
import { Button, ConfirmWithReasonModal } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import { isLiveQuizOpen } from '../constants/live-quiz-ops.constants';
import { useEndLiveQuizSession } from '../service/live-quiz-ops.queries';
import type { AdminLiveQuizSession } from '../types/live-quiz-ops.types';

const END_IMPACT =
  'Phiên chuyển sang "Đã huỷ" (lý do: quản trị nền tảng), mọi người chơi bị đưa ra khỏi phòng và nhận thông báo phiên đã kết thúc. Bảng kết quả không được lưu và không ai nhận XP. Không thể hoàn tác.';

export interface LiveQuizEndSessionProps {
  session: Pick<AdminLiveQuizSession, 'id' | 'status' | 'setTitle'>;
}

/**
 * Nút "Kết thúc khẩn cấp" (admin.md p5-01 §2.2): cần `gamification:update` VÀ phiên còn mở (WAITING/IN_PROGRESS — phiên đã đóng thì BE
 * trả `QUIZ_007`, nên không hiện nút). Lý do ≥ 10 ký tự qua `ConfirmWithReasonModal` → `POST …/end` (audit `live-quiz.admin-end`).
 * Thiếu quyền hoặc phiên đã đóng → không render gì.
 */
const LiveQuizEndSession = memo(function LiveQuizEndSession({ session }: LiveQuizEndSessionProps) {
  const canUpdate = useAuthStore((s) => s.hasPermission('gamification', 'update'));
  const { close, isOpen, open } = useDisclosure();
  const end = useEndLiveQuizSession();

  if (!canUpdate || !isLiveQuizOpen(session.status)) return null;

  return (
    <>
      <div>
        <Button
          size="sm"
          skin="danger"
          startIcon={<SystemIcon name="ban-outline" size={14} />}
          variant="stroke"
          onClick={open}
        >
          Kết thúc khẩn cấp
        </Button>
      </div>
      <ConfirmWithReasonModal
        confirmLabel="Kết thúc phiên"
        confirmTone="danger"
        impact={END_IMPACT}
        open={isOpen}
        title={`Kết thúc khẩn cấp — ${session.setTitle}`}
        onConfirm={async (reason) => {
          await end.mutateAsync({ sessionId: session.id, reason });
        }}
        onOpenChange={(next) => (next ? open() : close())}
      />
    </>
  );
});

export default LiveQuizEndSession;
