import { deleteSecret } from '@/core/auth/biometric';
import { authService, type BiometricSelfRevokeReason } from '@/core/api/auth';

import { useBiometricStore } from './biometric.store';

/**
 * Lý do gỡ gắn — vượt ra ngoài `BiometricSelfRevokeReason` của BE (hai giá trị
 * BE nhận qua query) vì có những ca app tự dọn CỤC BỘ mà không cần/không nên
 * kèm lý do đó lên BE (BE đã tự biết, hoặc lý do không nằm trong hai giá trị
 * BE cho phép — xem `REVOKE_REASON_PARAM` bên dưới).
 */
export type BiometricDisableReason =
  /** Người dùng tự tắt công tắc ở màn Cài đặt. */
  | 'USER_DISABLED'
  /** Đăng nhập thành công bằng tài khoản KHÁC tài khoản đang gắn trên máy. */
  | 'ACCOUNT_SWITCHED'
  /** `readSecret()` trả về lỗi `invalidated` — cấu hình sinh trắc trên máy đổi. */
  | 'INVALIDATED'
  /** BE trả `AUTH_014` — credential đã bị thu hồi phía server. */
  | 'AUTH_014'
  /** BE trả `AUTH_015` — credential đã hết hạn phía server. */
  | 'AUTH_015'
  /** Enroll thành công phía BE nhưng ghi/quét cục bộ thất bại. */
  | 'ENROLL_FAILED';

/**
 * Chỉ hai lý do BE thật sự phân biệt được ở lượt TỰ thu hồi
 * (`DELETE .../credentials/:id?reason=`, be.md §5.6) — các lý do còn lại
 * (đã bị BE revoke/expire sẵn, hoặc vô hiệu cục bộ) gọi KHÔNG kèm `reason`.
 */
const REVOKE_REASON_PARAM: Partial<Record<BiometricDisableReason, BiometricSelfRevokeReason>> = {
  USER_DISABLED: 'USER_DISABLED',
  ACCOUNT_SWITCHED: 'ACCOUNT_SWITCHED',
};

/**
 * Gỡ gắn đăng nhập sinh trắc học — ba việc, LUÔN CẢ BA, theo đúng thứ tự.
 *
 * ⛔ "Không bao giờ chỉ xoá cờ" (`app.md` §4): xoá mỗi `binding` mà để lại bí
 * mật trong Keychain/Keystore + credential ACTIVE phía BE là để lại một cách
 * đăng nhập "ma" — máy vẫn quét được, BE vẫn cấp phiên, mà UI thì coi như đã
 * tắt.
 *
 * 1. Xoá `binding` khỏi store NGAY (đồng bộ) — UI phản hồi tức thì, không chờ
 *    mạng.
 * 2. Xoá bí mật khỏi kho khoá — luôn chạy, không phụ thuộc mạng.
 * 3. Báo BE thu hồi credential — BEST-EFFORT. Mất mạng ở bước này KHÔNG được
 *    phép khiến người dùng tưởng "tắt không được": họ đã thấy công tắc tắt
 *    ngay từ bước 1, và endpoint `DELETE` là idempotent nên BE tự dọn được ở
 *    lượt đăng nhập sinh trắc kế tiếp (trả `AUTH_014`) nếu app không báo kịp.
 */
export async function disableBiometric(reason: BiometricDisableReason): Promise<void> {
  const { binding } = useBiometricStore.getState();
  useBiometricStore.getState().clearBinding();
  await deleteSecret();

  if (!binding) return;

  try {
    await authService.revokeBiometricCredential(binding.credentialId, REVOKE_REASON_PARAM[reason]);
  } catch {
    // Cố ý nuốt — xem chú thích trên. Lỗi mạng ở bước 3 không được chặn việc
    // gỡ CỤC BỘ đã xong ở bước 1–2.
  }
}

/**
 * Đối chiếu gắn kết hiện tại với người vừa đăng nhập — gọi SAU MỌI lần đăng
 * nhập thành công (`shell/session/sign-in.ts`).
 *
 * Một máy chỉ gắn được VỚI MỘT tài khoản (`app.md` §2: "so bằng `userId`, ⛔
 * không so email" — email đổi được, `id` thì không). Đăng nhập bằng tài khoản
 * KHÁC tài khoản đang gắn ⇒ gắn cũ vô nghĩa (nó trỏ tới bí mật/credential của
 * người dùng KHÁC), phải gỡ ngay để không hiện nhầm nút/hàng sinh trắc học của
 * người cũ cho người mới.
 */
export async function reconcileBiometricBinding(userId: string): Promise<void> {
  const { binding } = useBiometricStore.getState();
  if (binding && binding.userId !== userId) {
    await disableBiometric('ACCOUNT_SWITCHED');
  }
}
