import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { useAuthStore } from '@/shell/store/slices/auth';

import { isPrimerRoute, requestPushPrimer, snoozePrimer, usePushPrimerStore } from './push-primer';
import { usePushPermission } from './usePushPermission';

/**
 * Tấm mời bật thông báo — mount MỘT lần ở `app/(app)/_layout.tsx` (cùng chỗ `ModerationHost`).
 *
 * ⚠️ `app.md` §3 đặt component này ở `shared/ui` (`PushPrimerSheet`, "do p0-12 duyệt"). p0-12 chưa duyệt
 * và tấm này gắn logic quyền/đăng ký token của shell, nên viết cục bộ ở đây, ghép từ `ConfirmSheet` có sẵn
 * (không dựng control mới). Chuyển vào `shared/ui` khi p0-12 duyệt.
 *
 * ✅ Là câu hỏi CÓ/KHÔNG nên dùng `ConfirmSheet` (ô chuông + tiêu đề + lời mời canh giữa, [Để sau | Bật thông báo] chia đôi
 * đúng cách) thay cho hai `Button` tự ghép `flex-1` + thân chữ canh trái. Chạm nền mờ / vuốt xuống = "Để sau" như cũ.
 *
 * ⛔ KHÔNG gọi `requestPermissionsAsync` ở đâu ngoài nút "Bật thông báo" của tấm này (và của màn Cài đặt
 * thông báo) — không hỏi lúc cài, không hỏi lúc onboarding (`app.md` §7).
 */
export function PushPrimerHost() {
  const pathname = usePathname();
  const userId = useAuthStore((state) => state.user?.id);
  const visible = usePushPrimerStore((state) => state.visible);
  const { enable } = usePushPermission();

  useEffect(() => {
    if (userId && isPrimerRoute(pathname)) void requestPushPrimer();
  }, [pathname, userId]);

  const close = (): void => usePushPrimerStore.getState().hide();

  const later = (): void => {
    if (userId) void snoozePrimer(userId);
    close();
  };

  const turnOn = (): void => {
    // Đánh dấu "đã hỏi" TRƯỚC khi hộp thoại hệ thống hiện: nếu người dùng từ chối lần đầu trên Android
    // (`canAskAgain` còn true) thì primer không bật lại ngay ở màn kế tiếp.
    if (userId) void snoozePrimer(userId);
    close();
    void enable();
  };

  return (
    <ConfirmSheet
      cancelLabel="Để sau"
      confirmLabel="Bật thông báo"
      description="Nhận thông báo khi có người nhắc tên bạn, trả lời trong luồng hoặc gọi cho bạn, kể cả khi bạn không mở ứng dụng."
      icon="notification"
      title="Bật thông báo?"
      visible={visible}
      onClose={later}
      onConfirm={turnOn}
    >
      {/* Trấn an ngay trên hàng nút: chọn gì lúc này cũng đổi lại được — bớt ngần ngại bấm "Bật". */}
      <Text className="text-center text-caption-lg text-fg-2">
        Bạn có thể đổi lựa chọn này bất cứ lúc nào trong Cài đặt.
      </Text>
    </ConfirmSheet>
  );
}
