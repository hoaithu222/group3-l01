import { Outlet } from 'react-router-dom';

// Import trực tiếp để tránh vòng import qua barrel `./index.ts`.
import BackgroundLayout from './BackgroundLayout';

/**
 * Layout cho mọi route ĐÃ ĐĂNG NHẬP: `BackgroundLayout` đầy đủ (Header + Dock)
 * bọc `<Outlet />`.
 *
 * `AuthGuard` cố ý là guard THUẦN — nó chỉ trả lời "đã đăng nhập chưa", không
 * tự chọn layout. Nhờ vậy dự án kế thừa thêm được nhánh layout khác (toàn màn
 * hình, không Dock…) mà không phải sửa guard.
 */
export default function AppShellLayout() {
  return (
    <BackgroundLayout>
      <Outlet />
    </BackgroundLayout>
  );
}
