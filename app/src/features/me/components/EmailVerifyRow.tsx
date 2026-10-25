import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';
import { VerifyEmailSheet } from '@/shared/verify-email';
import { useAuthStore } from '@/shell/store/slices/auth';

import { MeNavRow } from './MeNavRow';

/**
 * Hàng "Xác minh email" ở Cài đặt → Bảo mật + tấm nhập mã. CHỈ hiện khi email CHẮC CHẮN chưa xác minh (`emailVerified === false`).
 *
 * ⛔ `undefined` (hồ sơ persist từ bản cũ chưa mang cờ này; `authService.me()` lúc mở app sẽ điền lại) KHÔNG phải "chưa xác minh" —
 * hiện hàng khi chưa biết là mời người đã xác minh đi xác minh lần nữa, và mỗi lượt "Gửi mã" tính vào hạn mức 3 lần/15 phút của BE.
 *
 * Luồng gửi mã → nhập 6 số dùng CHUNG với chấp nhận lời mời email (`@/shared/verify-email`, không viết lại). Xong (kể cả BE báo đã xác
 * minh sẵn) thì ghi `emailVerified: true` vào hồ sơ trong store — hàng biến mất ngay, các nơi đọc cờ này (vd lời mời của tôi, BE chỉ trả
 * khi email đã xác minh) không phải chờ lần mở app sau. Không gọi lại `GET /auth/me`: chỉ MỘT cờ đổi và BE vừa xác nhận.
 *
 * Đóng tấm bằng nút/vuốt: `VerifyEmailSheet` tự `reset` luồng (`onClose`), mở lại là lượt mới.
 */
export function EmailVerifyRow() {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);

  if (!user || user.emailVerified !== false) return null;

  function handleVerified(): void {
    const current = useAuthStore.getState().user;
    if (current) useAuthStore.getState().setAuth({ user: { ...current, emailVerified: true } });
    setOpen(false);
    showToast('success', 'Đã xác minh email.');
  }

  return (
    <>
      <MeNavRow
        description={`Email ${user.email} chưa được xác minh — cần để nhận lời mời vào nhóm`}
        icon="email"
        label="Xác minh email"
        tone="success"
        onPress={() => setOpen(true)}
      />
      <VerifyEmailSheet
        emailHint={user.email}
        intro="Xác minh giúp bạn nhận và chấp nhận lời mời vào nhóm gửi tới email này. Mã có hiệu lực 15 phút."
        visible={open}
        onClose={() => setOpen(false)}
        onVerified={handleVerified}
      />
    </>
  );
}
