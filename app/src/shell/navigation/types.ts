import type { Href } from 'expo-router';

import type { IconName, IconVariant } from '@/shared/ui/icon';

/** Quyền cần có để nhìn thấy và vào một phân hệ. */
export interface ModulePermission {
  resource: string;
  action: string;
}

/**
 * Số phân hệ TỐI ĐA trên thanh tab dưới (nút Trang chủ ở giữa không tính).
 * Phân hệ thứ năm trở đi vào danh sách chọn phân hệ — có test chặn.
 */
export const BAR_MODULE_LIMIT = 4;

/** Phần chung của mọi phân hệ. Phần khác nhau theo `placement` ở `BarModuleConfig` / `MenuModuleConfig`. */
interface ModuleBase {
  /**
   * Định danh phân hệ. Cũng dùng làm `resource` mặc định khi kiểm quyền, nên
   * đặt theo danh từ nghiệp vụ (`report`, `contract`) chứ không phải theo màn
   * hình (`report-screen`).
   */
  id: string;

  /** Đường dẫn để điều hướng tới. Được kiểm kiểu nhờ `experiments.typedRoutes`. */
  href: Href;

  /** Nhãn trên thanh tab, trong danh sách chọn phân hệ và trên tiêu đề màn hình. */
  title: string;

  /** Dòng mô tả ngắn dưới nhãn trong danh sách chọn phân hệ / Trang chủ. Thanh tab không dùng. */
  description?: string;

  /**
   * Biểu tượng, lấy từ bộ icon của repo (`@/shared/ui/icon`).
   *
   * ⛔ KHÔNG dùng `@expo/vector-icons` nữa. Nét của Ionicons lệch hẳn với bản
   * thiết kế, và để hai bộ icon song song thì thanh tab là chỗ lộ ra rõ nhất:
   * icon tab một kiểu, icon trong màn hình một kiểu.
   *
   * Gõ sai tên là `tsc` đỏ ngay — `IconName` là union thật của 303 tên sinh ra
   * từ `assets/icons/` (`npm run generate:icons`). ⛔ Đừng chép con số này đi
   * chỗ khác: thêm/bớt một file `.svg` là nó đổi, và
   * `src/shared/ui/icon/icon-names.generated.ts` mới là nguồn duy nhất.
   */
  icon: IconName;

  /**
   * Kiểu nét lúc tab ĐANG MỞ. Mặc định `twotone` — icon được TÔ ĐẶC thêm một tầng.
   *
   * Đây không phải trang trí. Trên màn hình nhỏ, khác biệt MÀU giữa tab đang mở
   * và tab thường là quá tinh tế dưới nắng ngoài trời (và với người mù màu thì
   * gần như không thấy). Đổi hẳn hình khối rỗng → đặc là tín hiệu đọc được
   * trong mọi điều kiện.
   *
   * ⚠️ Không phải icon nào cũng đủ bốn nét. Thiếu thì `<Icon>` tự rơi về
   * `linear` — lúc đó tab đang mở chỉ khác nhau ở màu, nên hãy tra
   * `assets/icons/system` trước khi chọn tên cho một phân hệ mới.
   */
  activeVariant?: IconVariant;

  /**
   * Quyền cần có. Bỏ trống ⇒ ai đăng nhập cũng vào được.
   * Người có vai trò `admin` luôn qua — xem `hasPermission` ở auth store.
   */
  permission?: ModulePermission;

  /**
   * Cờ phân hệ ở BE (`capabilities.features.<flag>.enabled`).
   *
   * Tắt ⇒ ẩn khỏi thanh tab VÀ danh sách chọn phân hệ (theo DỮ LIỆU thay vì cố
   * định trong code) — route vẫn vào được bằng link trực tiếp, và màn hình
   * tự hiện "Chưa bật" khi cờ tắt. Dùng cho phân hệ chưa triển khai xong ở
   * backend (vd `study` tới Phase 2+) mà không muốn xoá hẳn route khỏi app.
   *
   * ⚠️ Trước khi `useCapabilities()` có dữ liệu (`caps === undefined`, kể cả
   * lúc mất mạng lần đầu mở app), phân hệ này vẫn HIỆN — che dấu bằng dữ liệu
   * chưa tải xong sẽ làm tab nháy ẩn/hiện ngay lúc khởi động. Xem
   * `use-accessible-modules.ts`.
   */
  featureFlag?: string;

  /**
   * Hiện số chưa đọc trên tab (p1-07 `app.md` §1). Nguồn: `GET /me/unread/summary` qua `useTabBadges()`
   * (`src/shell/notifications`), `AppTabBar` đọc theo `name` của route.
   *
   *  · `'unread'` — số mục hộp thư Hoạt động chưa đọc (tab `activity`);
   *  · `'unreadConversations'` — số HỘI THOẠI chưa đọc, không tính hội thoại tắt tiếng (tab `messages`);
   *  · `'unreadChannels'` — tổng số KÊNH chưa đọc ở mọi nhóm (tab `workspaces`; `BottomNav` chỉ vẽ số).
   *
   * Union thay vì `boolean` vì mỗi loại huy hiệu có nguồn số riêng.
   */
  badge?: 'unread' | 'unreadChannels' | 'unreadConversations';
}

/**
 * Phân hệ CHÍNH — hiện trên thanh tab dưới, hai bên nút Trang chủ.
 *
 * ⛔ Tối đa `BAR_MODULE_LIMIT` mục (có test chặn): thêm mục thứ năm là thanh tab
 * chật lại đúng như lỗi đã phải gỡ. Phân hệ mới mặc định là `menu`.
 */
export interface BarModuleConfig extends ModuleBase {
  /**
   * Tên file route trong `app/(app)/`, KHÔNG kèm đuôi.
   * ⛔ Sai tên thì tab hiện ra nhưng bấm không vào đâu cả — xem `module-registry.ts`.
   */
  name: string;
  placement: 'bar';
}

/**
 * Phân hệ PHỤ — chỉ có trong danh sách chọn phân hệ (Trang chủ, và giữ nút Trang chủ).
 * Vẫn vào được bằng đường dẫn / deep link như mọi route.
 */
export interface MenuModuleConfig extends ModuleBase {
  /**
   * Tên thư mục route CẤP `(app)/` khi phân hệ có ngăn xếp riêng (`study`, `meetings`).
   * Để trống khi `href` trỏ vào màn con của phân hệ khác (`/messages/calls`) — không có
   * route cấp `(app)/` nào để khai `href: null` cho nó.
   */
  name?: string;
  placement: 'menu';
}

export type ModuleConfig = BarModuleConfig | MenuModuleConfig;
