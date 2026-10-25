import * as SecureStore from 'expo-secure-store';

import { BiometricError } from './biometric-error';

/**
 * Kho khoá RIÊNG cho bí mật đăng nhập sinh trắc học — tách hẳn khỏi
 * `core/storage/secure-storage.ts` (nơi cất refresh token).
 *
 * ── Vì sao KHÔNG dùng chung `secure-storage.ts` ───────────────────────────────
 * Mục refresh token ở đó cất mức `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, KHÔNG
 * ràng sinh trắc — app cần đọc được nó trong nền (làm mới token khi màn hình
 * đang khoá). Bí mật sinh trắc thì NGƯỢC LẠI: phải ràng `requireAuthentication`,
 * tức là mỗi lần đọc đều hiện hộp quét. Trộn hai mục có yêu cầu bảo mật khác
 * hẳn nhau vào cùng một `keychainService` là bài học của chính base này ghi lại
 * ở `app.md` §2.1 — dùng `keychainService` RIÊNG để không ca nào lỡ đọc/ghi
 * chéo mục của ca kia.
 *
 * ── Vì sao cất BÍ MẬT THIẾT BỊ do BE cấp, KHÔNG cất mật khẩu ──────────────────
 * Xem quyết định D-26 (`docs/00-foundation/04-decisions.md`): dự án tham chiếu
 * `vci-sun-mobile` cất mật khẩu thật trong kho khoá vì IdP ngoài không cấp được
 * credential riêng cho thiết bị — chính tài liệu của họ ghi đây là "phương án
 * không khuyến nghị". Super-app tự làm BE nên đi phương án cấp bí mật thiết bị
 * 256-bit, BE chỉ lưu SHA-256 của nó: lộ máy thì thu hồi được TỪNG THIẾT BỊ mà
 * không cần đổi mật khẩu, và mật khẩu thật không bao giờ rời khỏi lượt gõ ban đầu.
 */

const KEYCHAIN_SERVICE = 'superapp.biometric-login';
const SECRET_KEY = 'secret';

/** Tuỳ chọn dùng cho MỌI thao tác — kể cả xoá, để chắc chắn trỏ đúng mục. */
const baseOptions: SecureStore.SecureStoreOptions = {
  keychainService: KEYCHAIN_SERVICE,
};

/**
 * Tuỳ chọn cho đọc/ghi — ràng sinh trắc học thật sự.
 *
 * `keychainAccessible: WHEN_PASSCODE_SET_THIS_DEVICE_ONLY` (iOS gọi tương
 * đương là `biometryCurrentSet`): mục này KHÔNG lên iCloud/sao lưu, và quan
 * trọng hơn — người dùng thêm/xoá vân tay hoặc khuôn mặt, hoặc TẮT mã khoá máy,
 * sẽ làm mục này bị hệ điều hành VÔ HIỆU NGAY LẬP TỨC. `readSecret` bên dưới
 * đọc ra `null` đúng lúc đó và quy về lỗi `invalidated` — đây là hành vi ĐÚNG Ý
 * (BIO-13), không phải bug.
 */
function lockedOptions(prompt: string): SecureStore.SecureStoreOptions {
  return {
    ...baseOptions,
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    authenticationPrompt: prompt,
  };
}

/**
 * Ghi bí mật thiết bị — luôn XOÁ bản cũ trước khi ghi mới.
 *
 * ⛔ Bắt buộc theo thứ tự này. Trên iOS, GHI ĐÈ một mục `requireAuthentication`
 * đã tồn tại tự động hiện hộp quét sinh trắc LẦN THỨ HAI (một lần cho việc "xác
 * nhận sửa mục cũ", một lần theo luồng bật tính năng ở `useBiometricEnrollment`)
 * — bài học nguyên văn từ `vci-sun-mobile`. Xoá trước rồi ghi mới thì thao tác
 * ghi luôn là "tạo mục mới", chỉ tốn một hộp quét.
 */
export async function saveSecret(secret: string, prompt: string): Promise<void> {
  await deleteSecret();
  await SecureStore.setItemAsync(SECRET_KEY, secret, lockedOptions(prompt));
}

/**
 * Đọc bí mật thiết bị — hệ điều hành tự hiện hộp quét sinh trắc.
 *
 * Luôn trả về bí mật hoặc NÉM `BiometricError` với một trong bốn mã cố định —
 * không bao giờ để lỗi thô của `expo-secure-store` (thông điệp tự do, khác
 * nhau theo nền tảng) lọt ra ngoài file này.
 *
 * @param prompt Câu hiện trong hộp quét của hệ điều hành (`"Đăng nhập Super App"`).
 */
export async function readSecret(prompt: string): Promise<string> {
  let value: string | null;

  try {
    value = await SecureStore.getItemAsync(SECRET_KEY, lockedOptions(prompt));
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

    // Người dùng tự bấm Huỷ / bấm ra ngoài hộp quét — im lặng, không phải lỗi.
    if (message.includes('cancel')) {
      throw new BiometricError('cancelled', 'Người dùng huỷ xác thực sinh trắc học');
    }
    // Sai quá số lần cho phép — hệ điều hành tạm khoá cảm biến một khoảng thời gian.
    if (message.includes('lockout')) {
      throw new BiometricError('lockout', 'Cảm biến sinh trắc học tạm thời bị khoá');
    }
    // Mọi lỗi lạ khác (driver lỗi, timeout của hệ điều hành…) — không đoán thêm.
    throw new BiometricError('failed', message || 'Không đọc được bí mật sinh trắc học');
  }

  /**
   * `getItemAsync` trả `null` cho CẢ hai ca sau, và ta cố ý KHÔNG phân biệt:
   *   · chưa từng ghi mục nào (không nên tới được đây — nơi gọi đã kiểm binding);
   *   · mục đã bị hệ điều hành VÔ HIỆU vì cấu hình sinh trắc trên máy đổi khác
   *     (thêm/xoá vân tay, đổi khuôn mặt, tắt mã khoá máy).
   * Cả hai đều dẫn tới cùng một hành động ở tầng gọi: gỡ gắn cục bộ + yêu cầu
   * đăng nhập lại bằng mật khẩu rồi bật lại — không có gì để cứu ở đây.
   */
  if (value === null) {
    throw new BiometricError(
      'invalidated',
      'Cài đặt sinh trắc học trên máy đã thay đổi, mục bí mật đã bị vô hiệu',
    );
  }

  return value;
}

/**
 * Xoá bí mật thiết bị — KHÔNG BAO GIỜ ném lỗi, và KHÔNG hiện hộp quét (options
 * dùng ở đây cố ý thiếu `requireAuthentication`/`authenticationPrompt`).
 *
 * Gọi khi: người dùng tắt tính năng, đổi tài khoản trên cùng máy, hoặc dọn cục
 * bộ sau khi biết chắc bí mật đã vô hiệu/hết hạn/bị BE thu hồi. Nuốt lỗi vì gỡ
 * tính năng phải LUÔN thành công phía người dùng — thất bại của riêng thao tác
 * xoá kho khoá (mục vốn không tồn tại, Keystore lỗi vặt) không được phép chặn
 * người dùng tắt một công tắc trong Cài đặt.
 */
export async function deleteSecret(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECRET_KEY, baseOptions);
  } catch {
    // Cố ý nuốt — xem chú thích trên.
  }
}
