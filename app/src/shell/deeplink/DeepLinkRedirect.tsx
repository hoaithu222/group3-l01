import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config';

import type { DeepLinkIntent } from './deep-link.types';
import { resolveIntentHref } from './intent-handlers';

const NEUTRAL_MESSAGE = 'Liên kết không còn hiệu lực hoặc bạn không có quyền mở.';

/**
 * Thân của file route "chỉ chuyển tiếp" cho liên kết (`app/c/[conversationId].tsx`, `app/w/[wsId]/c/[chId].tsx`…):
 * ý định → `Href` qua `intent-handlers` → `<Redirect>` (replace — Back không quay về route trung gian).
 *
 * ── Chưa đăng nhập ───────────────────────────────────────────────────────────
 * Route nằm NGOÀI `(app)` nhưng đích thì TRONG `(app)`: hàng rào đăng nhập của `(app)/_layout.tsx` áp dụng ở đích, và
 * đường dẫn được nhớ qua đăng nhập bởi `shell/session/post-login-intent.ts` (`use-post-login-intent-capture`) — file này
 * không phải làm gì thêm.
 *
 * ── Không mở được ────────────────────────────────────────────────────────────
 * `resolveIntentHref` trả `null` (tham số hỏng, bộ xử lý từ chối) ⇒ về Trang chủ kèm thông báo TRUNG TÍNH — không nói vì
 * sao (không lộ link đúng/sai). Còn 404/403 từ API thì do màn đích hiện trạng thái "không còn khả dụng".
 */
export function DeepLinkRedirect({ intent }: { intent: DeepLinkIntent }) {
  const href = resolveIntentHref(intent);

  useEffect(() => {
    if (href === null) showToast('info', NEUTRAL_MESSAGE);
  }, [href]);

  // if/else chứ không `href ?? PATHS.HOME`: `Href` là union rất lớn (mỗi route thêm hàng chục dạng), biểu thức `??`/`?:`
  // trên nó chạm giới hạn của TypeScript (TS2590) khi số route vượt ~180 — đây là lỗi THẬT, không phải bảng route bị Metro làm bẩn.
  if (href === null) return <Redirect href={PATHS.HOME} />;
  return <Redirect href={href} />;
}
