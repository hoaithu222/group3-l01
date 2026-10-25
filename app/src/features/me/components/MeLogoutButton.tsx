import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
// ⛔ Đăng xuất là việc của VỎ ỨNG DỤNG, không phải của phân hệ `auth` — nhập `@/features/auth/...` là import CHÉO FEATURE.
import { useLogout } from '@/shell/session/useLogout';

/**
 * Nút Đăng xuất cuối màn Tôi: khối RỘNG hết bề ngang, cao 56dp, nền + viền + chữ + icon đều tông `error` — đọc ra ngay là
 * "hành động thoát", không phải một lối vào hay một đường liên kết (bản cũ là `LinkButton` đỏ nhỏ căn giữa).
 *
 * ── Vì sao dùng `Button danger-secondary` chứ không tự dựng khối đỏ ──────────
 * Cặp màu `error` trên `surface-error` đã được `check:contrast` đo ở CẢ hai chế độ (tối thấp nhất 6.21:1), và `Button`
 * lo sẵn `loading` (vòng quay thay nhãn, giữ bề rộng), `busy` cho trình đọc màn hình, khoá bấm đúp. `className` chỉ thêm
 * NỀN `surface-error`: viền `border-error` và màu nhấn (`border-action-error-press`) của biến thể vẫn nguyên nên nút vẫn có
 * phản hồi khi chạm. ⚠️ Đừng ghi đè `border-*` ở đây — `className` thắng compound `press` và nút mất phản hồi.
 *
 * ⛔ Hành vi đăng xuất KHÔNG đổi (`useLogout`: dọn store, gỡ token thiết bị, điều hướng) — repo chưa có quy ước hộp xác
 * nhận cho Đăng xuất (`AppLockOverlay` cũng gọi thẳng), nên ở đây cũng không thêm.
 */
export function MeLogoutButton() {
  const { isPending, logout } = useLogout();

  return (
    <View className="gap-xs">
      <Button
        className="bg-surface-error"
        fullWidth
        iconLeft="logout"
        label="Đăng xuất"
        loading={isPending}
        size="lg"
        variant="danger-secondary"
        onPress={() => logout()}
      />
      <Text className="text-center text-caption-sm text-fg-2">
        Thoát khỏi tài khoản trên thiết bị này.
      </Text>
    </View>
  );
}
