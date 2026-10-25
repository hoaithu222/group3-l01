import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

import {
  LOGOUT_ALL_BUTTON_LABEL,
  LOGOUT_ALL_DIALOG_DESCRIPTION,
  LOGOUT_ALL_DIALOG_TITLE,
  LOGOUT_ALL_HINT,
} from '../constants/session.messages';
import { useLogoutAll } from '../hooks/useLogoutAll';

/**
 * Cuối màn "Phiên đăng nhập": nút "Đăng xuất tất cả thiết bị" + hộp thoại xác nhận.
 *
 * Khác thu hồi MỘT phiên (từng hàng phía trên): việc này cũng đăng xuất CHÍNH MÁY NÀY, nên phải có hộp xác nhận nói rõ hậu
 * quả (khác nút "Đăng xuất" ở màn Tôi — chỉ thoát một máy, không hoàn tác được gì đáng kể). Nút cùng tông `danger-secondary`
 * với nút Đăng xuất ở màn Tôi để đọc ra ngay là "thoát", nhưng KHÔNG dựng khối đỏ đặc 56dp — đây là hành động phụ của màn.
 *
 * ⚠️ Nhãn nút xác nhận trong hộp thoại CỐ Ý khác nhãn nút mở nó ("Đăng xuất tất cả" vs "Đăng xuất tất cả thiết bị"): hai nút
 * trùng `accessibilityLabel` thì trình đọc màn hình không phân biệt được đang ở hộp thoại hay ở màn (cùng lý do với hộp thoại
 * thu hồi một phiên ở `SessionsScreen`).
 *
 * Lỗi (mất mạng, 429): hộp thoại đóng để người dùng thấy toast lỗi của interceptor rồi bấm lại; thành công thì màn bị gỡ khi
 * phiên dọn xong (xem `useLogoutAll`), không có gì để đóng.
 */
export function LogoutAllDevicesCard() {
  const { isPending, logoutAll } = useLogoutAll();
  const [confirmVisible, setConfirmVisible] = useState(false);

  function closeDialog(): void {
    setConfirmVisible(false);
  }

  return (
    <View className="gap-xs">
      <Button
        fullWidth
        iconLeft="logout"
        label={LOGOUT_ALL_BUTTON_LABEL}
        variant="danger-secondary"
        onPress={() => setConfirmVisible(true)}
      />
      <Text className="text-center text-caption-sm text-fg-2">{LOGOUT_ALL_HINT}</Text>

      <Dialog
        description={LOGOUT_ALL_DIALOG_DESCRIPTION}
        primaryAction={{
          label: 'Đăng xuất tất cả',
          loading: isPending,
          onPress: () => logoutAll({ onSettled: closeDialog }),
        }}
        secondaryAction={{ label: 'Huỷ', onPress: closeDialog }}
        title={LOGOUT_ALL_DIALOG_TITLE}
        variant="warning"
        visible={confirmVisible}
        onClose={closeDialog}
      />
    </View>
  );
}
