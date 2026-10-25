import { useState } from 'react';

import { useZodForm } from '@/shared/ui';

import {
  burnoutRulesFormSchema,
  type BurnoutRulesFormValues,
} from '../schemas/burnout-rules.schema';
import { usePutBurnoutRules } from '../service/wellbeing.mutations';
import type { BurnoutRules } from '../types/wellbeing.types';
import { applyRulesServerErrors, isVersionConflict } from '../utils/wellbeing-errors';
import {
  defaultsToFormValues,
  hasRulesChanges,
  rulesToFormValues,
  toPutPayload,
} from '../utils/rules-form.utils';

/**
 * Trạng thái + lệnh lưu của form sửa bộ luật. Chụp bộ luật LÚC MỞ form (`base`): form được dựng từ bản đó nên `expectedVersion` cũng phải là `version` của bản đó — nếu lấy
 * version mới hơn khi danh sách tự tải lại giữa chừng, form (cũ) sẽ âm thầm ghi đè thay đổi của người khác. Nơi dùng CHỈ dựng form khi đang mở (mount mới mỗi lần mở).
 * `RES_003` (luật vừa bị sửa ở nơi khác) → đóng form, bộ luật tự tải lại, interceptor đã toast; lỗi `WELL_*`/`VAL_001` gắn vào ô tương ứng và giữ form mở để sửa.
 */
export function useBurnoutRulesForm(rules: BurnoutRules) {
  const [base] = useState(rules);
  const form = useZodForm<BurnoutRulesFormValues>(burnoutRulesFormSchema, {
    defaultValues: rulesToFormValues(base),
  });
  const put = usePutBurnoutRules();
  const unchanged = !hasRulesChanges(base, form.watch());

  const submit = async (data?: BurnoutRulesFormValues): Promise<void> => {
    if (!data) return;
    try {
      await put.mutateAsync(toPutPayload(data, base.version));
    } catch (err) {
      if (isVersionConflict(err)) return;
      applyRulesServerErrors(form, err);
      throw err;
    }
  };

  /** Nút "Về mặc định" — điền lại form bằng bộ luật mặc định (`base.defaults`), KHÔNG lưu ngay (vẫn phải bấm "Lưu bộ luật" + nhập lý do). */
  const resetToDefaults = (): void => {
    form.reset(defaultsToFormValues(base));
  };

  return { form, unchanged, submit, baseVersion: base.version, resetToDefaults };
}
