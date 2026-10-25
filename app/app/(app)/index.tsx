import { HomeScreen } from '@/features/home';

/**
 * Trang chủ — route `/` (`PATHS.HOME`), nút GIỮA của thanh tab dưới. Trước đây file này chỉ chuyển
 * tiếp sang `/workspaces`; giờ đăng nhập xong, "Về trang chủ" và mọi `<Redirect href="/">` đều rơi vào
 * đây, còn tab Nhóm (`/workspaces`) là một phân hệ chính như Tin nhắn/Hoạt động/Tôi.
 */
export default function HomeRoute() {
  return <HomeScreen />;
}
