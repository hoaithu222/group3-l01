/**
 * Cờ "vừa chủ động đăng xuất" — CHỈ trong bộ nhớ, cố ý KHÔNG persist.
 *
 * ── Việc nó ngăn ──────────────────────────────────────────────────────────────
 * Người dùng bấm "Đăng xuất" thường là để ĐỔI TÀI KHOẢN trên cùng máy. Nếu màn
 * Đăng nhập vẫn tự bật hộp quét sinh trắc học ngay sau đó (`useAutoBiometricPrompt`),
 * họ sẽ bị đẩy thẳng lại vào tài khoản VỪA đăng xuất — một vòng lặp không lối
 * thoát trừ khi họ hiểu ra phải tắt sinh trắc học trong Cài đặt trước.
 *
 * ⛔ KHÔNG persist là chủ ý: đây là ý định của phiên chạy app HIỆN TẠI, không
 * phải thuộc tính lâu dài của thiết bị. Tắt app rồi mở lại (phiên hết hạn tự
 * nhiên, không phải do bấm đăng xuất) vẫn phải tự bật hộp quét như bình thường
 * — persist cờ này sẽ khiến NGƯỜI DÙNG SAU (mở app một ngày sau) vẫn bị chặn
 * tự động quét vì một lượt đăng xuất từ rất lâu trước.
 */
let explicitLogout = false;

/** Gọi TRƯỚC khi dọn phiên, ở `useLogout` — xem chú thích ở đó. */
export function markExplicitLogout(): void {
  explicitLogout = true;
}

/** Gọi sau khi hoàn tất MỘT lượt đăng nhập bất kỳ (`completeSignIn`). */
export function clearExplicitLogout(): void {
  explicitLogout = false;
}

export function wasExplicitLogout(): boolean {
  return explicitLogout;
}
