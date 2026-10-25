import type { ModuleConfig } from './types';

/**
 * Danh mục PHÂN HỆ của app — nguồn duy nhất cho thanh tab dưới và cho việc
 * kiểm quyền vào từng phân hệ.
 *
 * ── Chia việc với Expo Router thế nào ────────────────────────────────────────
 * Expo Router đã lo phần "đường dẫn nào mở màn hình nào" bằng chính cây thư mục
 * `app/`. Bảng này lo phần mà cây thư mục KHÔNG nói được:
 *
 *   · nhãn và biểu tượng trên thanh tab,
 *   · thứ tự các tab,
 *   · quyền/cờ phân hệ cần có để nhìn thấy phân hệ đó,
 *   · phân hệ nào ẩn khỏi thanh tab (vẫn vào được bằng đường dẫn).
 *
 * Đây cũng là điểm nối để sau này thêm ô tìm nhanh (⌘K) hay menu bên: chúng đọc
 * CÙNG bảng này, nên một phân hệ mới hiện ra ở mọi nơi mà không phải sửa thêm chỗ.
 *
 * ── Thanh tab: 4 phân hệ chính + Trang chủ ở giữa ────────────────────────────
 * `placement: 'bar'` = phân hệ CHÍNH, hiện trên thanh tab dưới (tối đa
 * `BAR_MODULE_LIMIT` = 4 — có test chặn). `AppTabBar` chia đôi chúng và đặt nút
 * **Trang chủ** (`HOME_MODULE`) ở giữa. `placement: 'menu'` = phân hệ PHỤ: không
 * có tab, mở từ danh sách chọn phân hệ (`ModulePickerSheet`: giữ nút Trang chủ,
 * hoặc nút "Tất cả" ở Trang chủ) và từ lưới phân hệ ở Trang chủ.
 *
 * Phân hệ mới MẶC ĐỊNH là `menu`. Đưa nó lên thanh tab nghĩa là đẩy một phân
 * hệ chính khác xuống `menu` — đó là quyết định sản phẩm, không phải chuyện kỹ thuật.
 *
 * ⛔ `name` phải trùng ĐÚNG tên thư mục/file route (không đuôi). Sai một ký tự
 * thì Expo Router không tìm thấy màn hình cho khai báo `<Tabs.Screen>` đó, và
 * tab hiện ra nhưng bấm vào không có gì — không có lỗi nào báo.
 *
 * ⚠️ `icon` phải là tên THẬT trong `assets/icons/system` (kiểm bằng
 * `npm run generate:icons` — sai tên là `tsc` đỏ vì `IconName` là union thật).
 */
export const MODULE_REGISTRY: ModuleConfig[] = [
  {
    id: 'messages',
    name: 'messages',
    placement: 'bar',
    href: '/messages',
    title: 'Tin nhắn',
    // ⚠️ Bộ icon hệ thống KHÔNG có `chat`/`chat-plus` như app.md p1-05 gợi ý — `chat-bubble` là tên thật.
    icon: 'chat-bubble',
    featureFlag: 'communication',
    // Số hội thoại chưa đọc (không tính tắt tiếng) — `useTabBadges()` đọc từ `GET /me/unread/summary` (p1-07).
    badge: 'unreadConversations',
  },
  {
    id: 'workspace',
    name: 'workspaces',
    placement: 'bar',
    href: '/workspaces',
    title: 'Nhóm',
    // Khác `chat-bubble` của tab Tin nhắn: hai tab liền kề cùng icon thì chỉ còn nhãn để phân biệt.
    icon: 'add-team',
    // Communication Hub (Phase 1) — tắt cờ này thì Nhóm VÀ Hoạt động cùng ẩn.
    featureFlag: 'communication',
    // Tổng số kênh chưa đọc ở mọi nhóm (p1-07 `app.md` §1).
    badge: 'unreadChannels',
  },
  {
    id: 'activity',
    name: 'activity',
    placement: 'bar',
    href: '/activity',
    title: 'Hoạt động',
    icon: 'notification',
    featureFlag: 'communication',
    // Số mục hộp thư Hoạt động chưa đọc (`activity.unread` của tóm tắt).
    badge: 'unread',
  },
  {
    id: 'me',
    name: 'me',
    placement: 'bar',
    href: '/me',
    title: 'Tôi',
    icon: 'user',
    // Hồ sơ + cài đặt + đăng xuất — ai đăng nhập cũng vào được, không gắn cờ.
  },

  // ── Phân hệ PHỤ (`menu`): không có tab, mở từ danh sách chọn phân hệ ─────────────────────────────
  {
    id: 'study',
    /**
     * p4-01: thư mục route `study/` (ngăn xếp Học) ẩn khỏi thanh tab bằng `<Tabs.Screen name="study" options={{ href: null }}>`
     * ở `app/(app)/_layout.tsx` — vòng lặp ở đó tự khai cho mọi mục có `name`.
     */
    name: 'study',
    placement: 'menu',
    href: '/study',
    title: 'Học',
    description: 'Bộ thẻ ghi nhớ, thi thử và ôn tập cách quãng',
    icon: 'book',
    featureFlag: 'study',
  },
  {
    id: 'meetings',
    /** p2-04: thư mục route `meetings/` (Lịch họp) — cùng cơ chế `href: null` như `study`. */
    name: 'meetings',
    placement: 'menu',
    href: '/meetings',
    title: 'Lịch họp',
    description: 'Lịch, lời mời và phòng họp của bạn',
    icon: 'calendar',
    featureFlag: 'meeting',
  },
  {
    id: 'calls',
    /** Không có `name`: `/messages/calls` là màn con của ngăn xếp `messages/`, không có route cấp `(app)/` riêng. */
    placement: 'menu',
    href: '/messages/calls',
    title: 'Cuộc gọi',
    description: 'Lịch sử cuộc gọi thoại và video',
    icon: 'phone',
    featureFlag: 'voice',
  },
  {
    id: 'achievements',
    /** Không có `name`: `/me/achievements` là màn con của ngăn xếp `me/`. */
    placement: 'menu',
    href: '/me/achievements',
    title: 'Thành tích',
    description: 'Cấp độ, điểm kinh nghiệm và huy hiệu',
    icon: 'star',
    featureFlag: 'gamification',
  },
  {
    id: 'mentor',
    /** p6-03: thư mục route `mentor/` (bảng tin tìm cố vấn) — cùng cơ chế `href: null` như `study`. */
    name: 'mentor',
    placement: 'menu',
    // ⚠️ Ép kiểu: route CHỈ-CÓ-`index` bị bộ sinh typed routes sinh thất thường `/mentor` hoặc `/mentor/index` (cùng bẫy `wallet-routes.ts`).
    href: '/mentor' as ModuleConfig['href'],
    title: 'Tìm cố vấn',
    description: 'Nhóm tìm cố vấn, ứng tuyển và các nhóm bạn đang cố vấn',
    icon: 'support',
    featureFlag: 'mentor',
  },
  {
    id: 'o2o',
    /** p6-05: không có `name` — `/me/o2o/map` là màn con của ngăn xếp `me/` (thư mục `(app)/o2o/` sẽ tự thành TAB). */
    placement: 'menu',
    href: '/me/o2o/map',
    title: 'Địa điểm & in ấn',
    description: 'Bản đồ quán học tập, tiệm in và đặt in tài liệu',
    icon: 'store-location',
    featureFlag: 'o2o',
  },
];

/** Nút TRANG CHỦ ở giữa thanh tab (KHÔNG thuộc `MODULE_REGISTRY`) — định nghĩa ở `home-module.ts`. */
export { HOME_MODULE } from './home-module';
