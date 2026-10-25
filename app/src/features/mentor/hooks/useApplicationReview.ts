import { useState } from 'react';

import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { AcceptPayload, MentorApplication } from '../api/mentor.types';
import { useAcceptApplication, useRejectApplication } from '../queries/mentor.mutations';
import { invalidChannelIdsOf, mentorErrorCode, mentorErrorMessage } from '../utils/mentor-errors';
import { newIdempotencyKey } from '../utils/mentor-format';

/**
 * Chấp nhận / từ chối đơn (app.md §3 "Duyệt đơn"). 409 `MENTOR_005` (bài vừa đủ cố vấn hoặc đổi phiên bản — IR-22) → toast +
 * đóng tấm, mutation đã làm mới bài/đơn (`onSettled`) nên lần thử sau dùng `version` mới. Lỗi khác (kênh `MENTOR_008`…) hiện
 * TRONG tấm. `Idempotency-Key` sinh MỘT LẦN mỗi lần mở tấm cho một đơn.
 */
export function useApplicationReview(wsId: string, postId: string) {
  const accept = useAcceptApplication(wsId, postId);
  const reject = useRejectApplication(wsId, postId);
  const [target, setTarget] = useState<{ application: MentorApplication; key: string } | null>(
    null,
  );

  const acceptError =
    accept.error && mentorErrorCode(accept.error) !== 'MENTOR_005' ? accept.error : null;

  return {
    acceptBusy: accept.isPending,
    acceptError: acceptError ? mentorErrorMessage(acceptError) : null,
    invalidChannelIds: acceptError ? invalidChannelIdsOf(acceptError) : [],
    rejectBusy: reject.isPending,
    target: target?.application ?? null,
    close: () => {
      accept.reset();
      setTarget(null);
    },
    open: (application: MentorApplication) => {
      accept.reset();
      setTarget({ application, key: newIdempotencyKey('mentor-accept') });
    },
    reject: (application: MentorApplication) =>
      reject.mutate(
        { applicationId: application.id },
        { onSuccess: () => showToast('success', 'Đã từ chối đơn') },
      ),
    submit: (payload: AcceptPayload) => {
      if (!target) return;
      accept.mutate(
        { applicationId: target.application.id, idempotencyKey: target.key, payload },
        {
          onError: (error) => {
            if (mentorErrorCode(error) !== 'MENTOR_005') return;
            showToast('warning', mentorErrorMessage(error));
            setTarget(null);
          },
          onSuccess: () => {
            // Rung "xong": nhận cố vấn là việc nhiều bước (kênh, nhóm chat, thời hạn) vừa hoàn tất phía server.
            hapticSuccess();
            showToast('success', `Đã chấp nhận ${target.application.applicant.name} làm cố vấn`);
            setTarget(null);
          },
        },
      );
    },
  };
}
