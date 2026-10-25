import { pendingInviteStore } from '@/features/members/store/pending-invite';

import { markExplicitLogout } from './logout-intent';
import { clearPostLoginIntent } from './post-login-intent';

/**
 * Bước CHUẨN BỊ chung của mọi lần rời phiên do CHÍNH người dùng chủ ý — đăng xuất, và xoá tài khoản
 * (BE thu hồi mọi phiên ngay khi nhận yêu cầu). Gọi TRƯỚC khi dọn phiên.
 *
 *  · `markExplicitLogout()` — màn Đăng nhập KHÔNG tự bật hộp quét sinh trắc học ngay sau đó
 *    (`app.md` §2: "vừa đăng xuất thường là để đổi người dùng").
 *  · `pendingInvite` / ý định điều hướng sau đăng nhập — của người TRƯỚC, không được lôi người SAU
 *    (máy dùng chung) vào nhóm/phòng họ không hề bấm link. README p1-02 §2: "xoá khi accept thành
 *    công, hết 1 giờ, hoặc logout".
 *
 * ⚠️ Cố ý KHÔNG nằm trong `wipeUserData()`: đó là dọn DỮ LIỆU người dùng, chạy cả khi phiên tự hết hạn
 * — và một phiên hết hạn KHÔNG nên làm mất lời mời/đích đến mà chính người đó vừa mở trước khi đăng
 * nhập lại. Hai thứ này chỉ đi cùng lượt rời phiên CHỦ Ý.
 */
export function prepareUserInitiatedSessionEnd(): void {
  markExplicitLogout();
  void pendingInviteStore.clear();
  void clearPostLoginIntent();
}
