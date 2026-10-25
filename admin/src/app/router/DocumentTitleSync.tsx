/**
 * DocumentTitleSync — đổi tên tab trình duyệt theo route + tab nội bộ đang mở.
 *
 * Mount MỘT LẦN ở root router (`create-router.tsx`), cạnh `<AppShell />`, nên
 * phủ cả những route nằm ngoài `AuthGuard`: trang đăng nhập, `/404`, `/403`.
 *
 * ⛔ KHÔNG gắn trong layout hay từng page:
 *  - Layout: `AppShellLayout` chỉ phủ nhánh đã đăng nhập → tab ở màn đăng nhập
 *    và 404 giữ nguyên tên cũ.
 *  - Page: mỗi phân hệ tự set là quay lại cảnh khai tên rải rác, lệch với
 *    registry — đúng thứ `module-registry` sinh ra để dẹp.
 */
import { memo, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { resolveDocumentTitle } from './document-title';

export const DocumentTitleSync = memo(function DocumentTitleSync() {
  const { pathname, search } = useLocation();

  /**
   * Tính tên tab trong `useMemo`, GHI trong `useEffect` phụ thuộc chuỗi kết quả.
   *
   * `search` đổi mỗi lần user gõ ô tìm kiếm, sang trang, chọn filter, gạt
   * `?display=tv` — nhưng chỉ `?tab=` mới đổi được tên tab. Tách hai bước như
   * vậy thì `document.title` chỉ bị ghi khi tên THỰC SỰ khác, không ghi lại
   * cùng một chuỗi hàng chục lần mỗi phút.
   */
  const title = useMemo(() => resolveDocumentTitle(pathname, search), [pathname, search]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
});
