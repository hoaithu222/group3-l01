import { useMutation, useQueryClient } from '@tanstack/react-query';

import { studyModerationService } from '../api/study-moderation.service';
import type { ModerationKind, ModerationPayload, StudySetDetailDto } from '../api/study.types';
import { srKeys } from './sr.queries';
import { applySetToCache } from './study-sets.queries';
import { studyKeys } from './study.keys';

/**
 * Ẩn/khôi phục bộ của nhóm (chỉ khi `myPermissions.hide|unhide` từ SERVER). Thành công: ghi THẲNG bản trả về vào cache chi tiết (kèm
 * `myPermissions` tính lại — người vừa ẩn mất `hide`, được `unhide`) và làm cũ mọi danh sách (bộ đổi trạng thái/biến khỏi danh sách người khác).
 *
 * ⚠️ Người ẩn/khôi phục là OWNER/ADMIN chứ không phải tác giả: khi bộ ở trạng thái ẩn họ chỉ còn `meta` + `unhide` (be `resolveWith`), MẤT quyền
 * đọc nội dung ⇒ thẻ ôn theo lịch của bộ này ra/vào hàng đợi và số "N thẻ cần ôn" của CHÍNH họ (nên làm cũ `srKeys.all`, như `useDeleteSet`).
 *
 * ⚠️ Lỗi cũng làm cũ chi tiết: `404`/`409 STUDY_004` nghĩa là trạng thái bộ ĐÃ ĐỔI dưới chân mình (quản trị khác vừa ẩn/khôi phục, tác giả vừa
 * xoá) — không lấy lại thì nút vẫn hiện theo `myPermissions` cũ và lần bấm sau lại lỗi y hệt.
 */
function useModerationMutation(
  setId: string,
  call: (setId: string, payload: ModerationPayload) => Promise<StudySetDetailDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ModerationPayload) => call(setId, payload),
    onError: () => void queryClient.invalidateQueries({ queryKey: studyKeys.detail(setId) }),
    onSuccess: (set) => {
      applySetToCache(queryClient, set);
      void queryClient.invalidateQueries({ queryKey: srKeys.all });
    },
  });
}

/** `kind` cố định suốt vòng đời một tấm xác nhận (mỗi chiều một tấm) nên việc chọn hàm gọi ở đây không đổi thứ tự hook. */
export function useModerateSet(setId: string, kind: ModerationKind) {
  return useModerationMutation(
    setId,
    kind === 'hide' ? studyModerationService.hide : studyModerationService.unhide,
  );
}
