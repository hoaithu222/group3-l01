import { useMemo } from 'react';

import { useCapabilities } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';
import { userHasPermission } from '@/shell/store/slices/auth/permissions';
import { appConfig } from '@/core/config/env.config';

import { MODULE_REGISTRY } from './module-registry';
import {
  BAR_MODULE_LIMIT,
  type BarModuleConfig,
  type MenuModuleConfig,
  type ModuleConfig,
} from './types';

/**
 * Danh sách phân hệ người dùng hiện tại được vào.
 *
 * ⛔ ĐÂY LÀ NƠI DUY NHẤT lọc phân hệ theo quyền.
 *
 * Thanh tab, menu bên, ô tìm nhanh — mọi nơi hiển thị danh sách phân hệ đều
 * phải gọi hook này. Chỗ nào tự lọc riêng thì sớm muộn hai bộ luật sẽ lệch
 * nhau, và triệu chứng là: tab không hiện ra nhưng ô tìm nhanh vẫn liệt kê, bấm
 * vào thì màn hình trắng. Loại bug đó không ai báo vì trông như "app hơi lạ".
 *
 * ⚠️ Đây là lọc để HIỂN THỊ, không phải hàng rào bảo mật. Người dùng vẫn gõ
 * được đường dẫn hoặc mở deep link tới màn hình bị ẩn. Hàng rào thật nằm ở
 * backend — nó phải từ chối mọi request không đủ quyền, bất kể client vẽ gì.
 */
export function useAccessibleModules(): ModuleConfig[] {
  /**
   * Lấy chính `user` chứ KHÔNG lấy hàm `hasPermission` của store.
   *
   * `hasPermission` là tham chiếu CỐ ĐỊNH (zustand không tạo lại action), nên
   * nếu `useMemo` chỉ phụ thuộc vào nó thì danh sách sẽ KHÔNG tính lại khi quyền
   * của người dùng đổi — vd sau khi quản trị viên đổi vai trò và app làm mới hồ
   * sơ. Người dùng phải khởi động lại app mới thấy phân hệ mới.
   *
   * Phụ thuộc vào `user` thì tính lại đúng lúc, và `userHasPermission` là hàm
   * thuần nên vẫn dùng chung MỘT bộ luật với store.
   */
  const user = useAuthStore((state) => state.user);

  /**
   * `caps` chỉ để LỌC — không tự bắn request nào ở đây.
   *
   * `useCapabilities()` đã tự khoá bằng `enabled` (không gọi khi chưa đăng
   * nhập), nên gọi lại hook ở đây là dùng CHUNG một query, không nhân đôi.
   */
  const { data: caps } = useCapabilities();

  return useMemo(() => {
    // Tắt xác thực ⇒ hiện hết. Đây là chế độ dựng giao diện khi chưa có backend;
    // lọc theo quyền lúc này sẽ giấu sạch mọi phân hệ vì không có `user` nào.
    const byPermission = appConfig.authEnabled
      ? MODULE_REGISTRY.filter(
          (module) =>
            !module.permission ||
            userHasPermission(user, module.permission.resource, module.permission.action),
        )
      : MODULE_REGISTRY;

    /**
     * Lọc tiếp theo CỜ PHÂN HỆ ở backend (`capabilities.features`).
     *
     * ⛔ `!caps` (chưa có dữ liệu — đang tải lần đầu, kể cả lúc mất mạng và
     * chưa có bản cache) phải cho QUA, không phải chặn lại. Chặn lại thì mọi
     * lần mở app đều nháy ẩn hết các tab có `featureFlag` trong một nhịp trước
     * khi query xong — khó chịu hơn nhiều so với việc hiện tạm một tab mà lát
     * sau hoá ra bị tắt.
     */
    return byPermission.filter(
      (module) => !module.featureFlag || !caps || caps.features[module.featureFlag]?.enabled,
    );
  }, [user, caps]);
}

/**
 * Phân hệ CHÍNH hiện trên thanh tab (đã lọc quyền + cờ), theo thứ tự registry.
 *
 * ⛔ Cắt ở `BAR_MODULE_LIMIT`: registry có test chặn quá 4 mục `bar`, nhưng cắt thêm ở đây để
 * một lần sửa registry sai không làm thanh tab vỡ bố cục trước khi test kịp đỏ.
 */
export function useTabModules(): BarModuleConfig[] {
  const modules = useAccessibleModules();
  return useMemo(
    () =>
      modules
        .filter((module): module is BarModuleConfig => module.placement === 'bar')
        .slice(0, BAR_MODULE_LIMIT),
    [modules],
  );
}

/** Phân hệ PHỤ trong danh sách chọn phân hệ (đã lọc quyền + cờ) — Trang chủ và `ModulePickerSheet` cùng đọc. */
export function useMenuModules(): MenuModuleConfig[] {
  const modules = useAccessibleModules();
  return useMemo(
    () => modules.filter((module): module is MenuModuleConfig => module.placement === 'menu'),
    [modules],
  );
}
