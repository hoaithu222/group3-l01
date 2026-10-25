import { MODULE_REGISTRY } from '@/app/router/modules';
import type { ModuleConfig } from '@/app/router/modules';

/**
 * ⛔ VÌ SAO CÓ NHÁNH DỰ PHÒNG NÀY — DOCK TỪNG "BIẾN MẤT" HOÀN TOÀN.
 *
 * `useAccessibleModules()` mở đầu bằng `if (!user) return []`. Base xuất xưởng
 * với `VITE_AUTH_ENABLED` để trống, nghĩa là `appConfig.authEnabled === false`,
 * nghĩa là `AuthGuard` cho qua thẳng mà KHÔNG có phiên đăng nhập nào — nên
 * `user` là `null`, danh sách phân hệ rỗng, và `Dock` (rỗng thì `return null`)
 * không vẽ ra một pixel nào. Nhìn màn hình thì y như Dock bị hỏng, trong khi
 * mọi thứ đều đang chạy đúng như đã viết.
 *
 * Nhánh dự phòng CHỈ mở khi kiểm đăng nhập ĐANG TẮT. Bật `VITE_AUTH_ENABLED`
 * lên (bắt buộc ở mọi môi trường thật) là nó đóng lại ngay: từ đó Dock chỉ hiện
 * đúng những gì `useAccessibleModules` cho phép, KHÔNG có đường nào rò một phân
 * hệ ngoài quyền ra menu.
 *
 * Lọc ở đây lặp lại đúng hai điều kiện "không phụ thuộc quyền" của
 * `useAccessibleModules` (`enabled !== false`, `!hideInMenu`, sắp theo `order`)
 * — phần khác nhau duy nhất là bước kiểm quyền, thứ vốn vô nghĩa khi chưa có
 * người dùng nào.
 */
export function listVisibleModules(): ModuleConfig[] {
  return MODULE_REGISTRY.filter((m) => m.enabled !== false && !m.hideInMenu).sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );
}
