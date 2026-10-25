import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { assetErrorMessage } from '@/core/uploads/mime';
import { imageSourceMenuItems } from '@/shared/media';
import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useAvatarUpload } from '../hooks/useAvatarUpload';

/**
 * Avatar hồ sơ CÁ NHÂN có thể chạm để đổi (`MeProfileCard`) — chạm mở tấm chọn "Chụp ảnh"/"Chọn từ thư viện"
 * (`imageSourceMenuItems`, cùng bộ nhãn/icon với avatar nhóm — `GroupAvatarPicker`), tải bằng `useAvatarUpload`
 * (scope `AVATAR`, khoá `me-avatar`) rồi tự PATCH lên `/users/:id` và ghi lại `useAuthStore`.
 *
 * Vòng ĐỆM `bg-bg-1` 64dp bao quanh avatar 48dp: nguyên bản từ `MeProfileCard` (xem chú thích ở đó) — giữ lại Y
 * NGUYÊN khi tách avatar ra component riêng để dải gradient phía sau không đổi cách avatar "được khoét vào".
 *
 * Ảnh cục bộ (`previewUri`) đè lên avatar cũ NGAY khi vừa chọn, không chờ BE. Vòng chờ (`ProgressRing`) phủ suốt từ
 * lúc nén ảnh tới lúc PATCH xong (`useAvatarUpload` đã gộp hai bước vào `busy`) — tránh tắt vòng chờ giữa chừng rồi
 * bật lại. Lỗi bước TẢI ẢNH (`failed`/`errorCode`) hiện `Alert` + nút "Thử lại" ngay dưới; lỗi bước LƯU (PATCH) chỉ
 * cần toast chung của `apiClient` — lúc đó ảnh đã tải xong, không còn "bước" nào ở màn này để thử lại riêng, người
 * dùng chỉ cần chọn ảnh lại nếu muốn.
 */
export function MeAvatarPicker() {
  const user = useAuthStore((state) => state.user);
  const avatar = useAvatarUpload();
  const [menuOpen, setMenuOpen] = useState(false);

  const source = avatar.previewUri
    ? { uri: avatar.previewUri }
    : user?.avatar
      ? { uri: user.avatar }
      : undefined;

  return (
    <View className="items-center gap-xs">
      <Pressable
        accessibilityHint="Chạm để đổi ảnh đại diện"
        accessibilityLabel="Ảnh đại diện"
        accessibilityRole="button"
        // `active:opacity-80`: phản hồi nhấn — avatar là nút tự dựng, không có trạng thái nhấn nào khác.
        className="relative active:opacity-80"
        disabled={avatar.busy}
        onPress={() => setMenuOpen(true)}
      >
        <View className="size-6xl items-center justify-center rounded-full bg-bg-1">
          <Avatar name={user?.name} size="lg" source={source} />
          {avatar.busy ? (
            <View className="absolute inset-0 items-center justify-center rounded-full bg-overlay">
              <ProgressRing indeterminate label="Đang lưu ảnh đại diện" size={40} />
            </View>
          ) : null}
        </View>
        <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-hairline border-border-1 bg-bg-1">
          <Icon color="fg-brand" name="user-edit" size={16} />
        </View>
      </Pressable>

      {avatar.failed ? (
        <Alert
          actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={avatar.retry} />}
          description={assetErrorMessage(avatar.errorCode)}
          tone="error"
        />
      ) : null}

      <ActionMenuSheet
        items={imageSourceMenuItems({ onPick: (src) => void avatar.pick(src) })}
        title="Đổi ảnh đại diện"
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}
