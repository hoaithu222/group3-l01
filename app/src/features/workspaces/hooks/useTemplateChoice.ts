import { useCallback, useState } from 'react';

import type { TemplateSelection } from '@/shared/workspace-templates';

import { TEMPLATE_REJECTED_NOTICE } from '../utils/create-template';

/**
 * Lựa chọn mẫu của form tạo nhóm (p5-04): mẫu + kênh đang chọn (`null` = "Không dùng mẫu"), thông báo khi BE từ chối mẫu, và
 * `refreshToken` để bước chọn mẫu (nằm ở feature khác, nối qua slot) tải lại danh sách sau khi bị từ chối.
 */
export function useTemplateChoice() {
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const change = useCallback((next: TemplateSelection | null) => {
    setSelection(next);
    setNotice(null);
  }, []);

  /** BE từ chối mẫu (`TPL_001`/`CFG_005`) ⇒ về "Không dùng mẫu", báo rõ, và làm mới danh sách mẫu. */
  const reject = useCallback(() => {
    setSelection(null);
    setNotice(TEMPLATE_REJECTED_NOTICE);
    setRefreshToken((value) => value + 1);
  }, []);

  return { change, notice, refreshToken, reject, selection };
}
