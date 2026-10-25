import { useMutation, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { wellbeingKeys } from './wellbeing.queries';
import { wellbeingService } from './wellbeing.service';

/**
 * `PUT /admin/wellbeing/rules` — CAS theo `expectedVersion`: thành công hay lỗi đều làm mới bộ luật. Lỗi `RES_003` = bộ luật vừa bị sửa ở nơi khác, cần `version` mới
 * (interceptor đã toast "dữ liệu đã thay đổi, vui lòng tải lại"). Mỗi lần lưu có dòng nhật ký quản trị mới → làm mới cả nhật ký.
 */
export const usePutBurnoutRules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: wellbeingService.putRules,
    onSuccess: () => showToast('success', 'Đã lưu bộ luật — áp dụng cho lần đánh giá kế tiếp'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: wellbeingKeys.rules() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};
