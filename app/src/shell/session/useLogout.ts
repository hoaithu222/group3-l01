import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { authService } from '@/core/api/auth';
import { queryClient } from '@/core/config/query-client';
import { unregisterThisDevice } from '@/core/notifications';
import { PATHS } from '@/shell/config';

import { prepareUserInitiatedSessionEnd } from './user-initiated-end';
import { wipeUserData } from './wipe-user-data';

/**
 * Đăng xuất.
 *
 * ── Vì sao hook này nằm ở `shell/` chứ không ở `features/auth/` ──────────────
 * Nó từng ở `features/auth/hooks/useLogout.ts` và `features/profile` nhập thẳng sang — đúng thứ
 * `docs/rules/feature-structure.md` cấm cứng, mà cả `check:imports` lẫn ESLint đều mù. Việc nó
 * làm là việc của vỏ ứng dụng (dọn store, dọn cache, điều hướng), không phải nghiệp vụ riêng của
 * phân hệ đăng nhập — bất kỳ màn hình nào (hồ sơ, cài đặt, lớp phủ khoá) cũng có quyền gọi.
 *
 * ── Dọn dữ liệu: MỘT hàm, hai lượt ──────────────────────────────────────────
 * `wipeUserData()` là hàm dọn DUY NHẤT (danh sách store: `user-scoped-stores.constants.ts`). Nó
 * chạy ngay ở đây để cuộc gọi/tải lên/nháp của người dùng ngừng NGAY khi bấm, rồi chạy lại từ
 * `purgeSession()` (bên trong `authService.logout()`, qua `onSessionEnded`) — đó là điểm chung
 * của cả bốn đường phiên chết. Idempotent, nên chạy hai lần không sao. Trước đây bản dọn nằm
 * riêng ở đây nên ba đường còn lại (refresh 4xx, 401 không cứu được, socket bị từ chối) để
 * nguyên store của người cũ cho người sau.
 *
 * `authService.logout` bảo đảm phiên phía client bị dọn DÙ lời gọi tới máy chủ có hỏng hay
 * không, và có trần thời gian ngắn (mất sóng không giữ người dùng lại nửa phút).
 */
export function useLogout() {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async () => {
      /**
       * Đánh dấu "vừa chủ động đăng xuất" (màn Đăng nhập không tự bật hộp quét sinh trắc học) và xoá
       * lời mời/đích đến đang chờ của người TRƯỚC — xem `user-initiated-end.ts`. ⛔ Đăng xuất
       * thường GIỮ gắn kết sinh trắc học.
       */
      prepareUserInitiatedSessionEnd();

      // Socket ngắt TRƯỚC mọi thứ (bước đầu của `wipeUserData`): một sự kiện server bắn đúng lúc
      // này (vd `permission:revoked` của chính phiên đang đăng xuất) không được chạy vào listener
      // với state đã rỗng.
      void wipeUserData();

      /**
       * p0-06 app.md §5 (NT-07): gỡ token FCM của máy này khỏi tài khoản để máy dùng chung không
       * nhận push của người vừa đăng xuất. `POST /auth/logout` cũng tự gỡ theo `X-Device-Id` phía
       * BE — lời gọi `DELETE /me/devices/:id` là lớp dự phòng (idempotent) và không bao giờ ném lỗi.
       *
       * Chạy SONG SONG với `authService.logout()` thay vì nối đuôi: `unregisterThisDevice` có trần
       * 4 giây, nối đuôi thì cộng thêm vào thời gian chờ lúc mạng chậm. An toàn về thứ tự token: lời
       * gọi thứ nhất gắn `Authorization` trong interceptor NGAY khi bắt đầu, còn `purgeSession()`
       * chỉ chạy SAU khi `logout()` xong. Dọn khay/huy hiệu thì `usePushSessionCleanup` lo.
       */
      const [, logoutResult] = await Promise.all([unregisterThisDevice(), authService.logout()]);
      return logoutResult;
    },

    /**
     * ⛔ `onSettled` chứ KHÔNG phải `onSuccess`: nếu sau này ai đó đổi `logout()` thành có thể
     * ném lỗi thì `onSuccess` không chạy và người dùng kẹt lại trong app với phiên đã bị dọn.
     */
    onSettled: () => {
      // Xoá cache TRƯỚC khi chuyển màn: dữ liệu của người vừa đăng xuất không được nằm lại trong
      // bộ nhớ cho người đăng nhập kế tiếp trên cùng máy.
      queryClient.clear();
      /**
       * ⚠️ Vẫn điều hướng TƯỜNG MINH dù guard ở `app/(app)/_layout.tsx` cũng theo dõi trạng thái
       * phiên: guard chỉ chặn khi `EXPO_PUBLIC_AUTH_ENABLED=true`. Thiếu dòng này thì ở cấu hình
       * mặc định của base (cờ tắt) người dùng bấm "Đăng xuất" và… ở nguyên màn hình cũ.
       */
      router.replace(PATHS.LOGIN);
    },
  });

  return { logout: mutation.mutate, isPending: mutation.isPending };
}
