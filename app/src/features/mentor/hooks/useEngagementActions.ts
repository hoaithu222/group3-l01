import { useState } from 'react';

import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { MentorEngagement } from '../api/mentor.types';
import { useEndEngagement, useExtendEngagement } from '../queries/mentor.mutations';
import { mentorErrorMessage } from '../utils/mentor-errors';

/**
 * Gia hạn / kết thúc đợt cố vấn ở màn quản lý của nhóm — gom trạng thái tấm/hộp thoại + mutation để màn chỉ còn phần vẽ.
 * Lỗi gia hạn (`MENTOR_007`, 409 version) hiện TRONG tấm; kết thúc lỗi thì interceptor đã toast.
 */
export function useEngagementActions(wsId: string) {
  const extend = useExtendEngagement(wsId);
  const end = useEndEngagement(wsId);
  const [extending, setExtending] = useState<MentorEngagement | null>(null);
  const [ending, setEnding] = useState<MentorEngagement | null>(null);

  return {
    ending,
    endBusy: end.isPending,
    extendBusy: extend.isPending,
    extendError: extend.error ? mentorErrorMessage(extend.error) : null,
    extending,
    closeEnd: () => setEnding(null),
    closeExtend: () => {
      extend.reset();
      setExtending(null);
    },
    confirmEnd: () => {
      if (!ending) return;
      end.mutate(
        { engagementId: ending.id },
        {
          onSuccess: () => {
            showToast('success', 'Đã kết thúc đợt cố vấn');
            setEnding(null);
          },
        },
      );
    },
    openEnd: setEnding,
    openExtend: setExtending,
    submitExtend: (engagement: MentorEngagement, addDays: number) =>
      extend.mutate(
        { addDays, engagementId: engagement.id, expectedVersion: engagement.version },
        {
          onSuccess: () => {
            hapticSuccess();
            showToast('success', `Đã gia hạn thêm ${addDays} ngày`);
            setExtending(null);
          },
        },
      ),
  };
}
