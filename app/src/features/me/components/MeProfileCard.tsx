import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { ProfileExtrasSlot } from '@/shared/profile';
import { Sparkles } from '@/shared/ui';
import { Badge } from '@/shared/ui/badge';
import { useAuthStore } from '@/shell/store/slices/auth';

import { MeAvatarPicker } from './MeAvatarPicker';
import { MeProfileBanner } from './MeProfileBanner';

/** Số huy hiệu vai trò hiện tối đa — quá thì gộp thành "+N" để hàng huy hiệu không đội lên hai, ba dòng dưới tên. */
const MAX_ROLE_BADGES = 3;

/**
 * Thẻ hồ sơ đầu màn Tôi: lớp nền trang trí (dải gradient thương hiệu + quầng sáng trôi, `MeProfileBanner`) · avatar có thể
 * chạm để đổi (`MeAvatarPicker`), vòng viền đè lên mép dải, vài ngôi sao lấp lánh quanh · tên + email · vai trò · cấp
 * độ/chuỗi ngày (khe `ProfileExtrasSlot`).
 *
 * ⛔ Vòng đệm 64dp quanh avatar (`bg-bg-1`, avatar bên trong cố định 48dp — ràng buộc thiết kế của bộ `Avatar`, xem
 * `avatar.styles.ts`) SỐNG BÊN TRONG `MeAvatarPicker`, không phải ở đây — tách avatar ra component riêng để gắn
 * `useAvatarUpload` mà không kéo theo state/hook đó vào thẳng thẻ hồ sơ. Vòng cùng màu thẻ nên nhìn như avatar được
 * khoét vào dải màu, và mép trắng đó tách khuôn mặt khỏi gradient ở cả hai chế độ.
 *
 * Dải gradient cao 96dp nằm SAU nội dung: vòng avatar (20 → 84dp) nằm trọn trong dải, còn tên bắt đầu ở ~96dp — đúng chỗ
 * dải đã tan hết. `overflow-hidden` + `rounded-md` của vỏ cắt dải lẫn quầng sáng theo bo góc thẻ (24dp).
 *
 * Vai trò là `Badge` (nhãn không bấm được), không phải `Chip` — Chip là control nên trông như bộ lọc chạm được. Cỡ `sm`
 * cho hàng huy hiệu nhẹ hơn tên; bỏ trùng/rỗng, quá `MAX_ROLE_BADGES` thì gộp "+N" (trình đọc màn hình nghe "và N vai trò khác").
 *
 * ✅ Một `useIsScreenFocused()` cho CẢ quầng lẫn sao: sang tab khác / app xuống nền là cả hai cùng dừng.
 */
export function MeProfileCard() {
  const user = useAuthStore((state) => state.user);
  const focused = useIsScreenFocused();
  // BE gộp vai từ nhiều nguồn nên có thể trùng; chuỗi rỗng thì thành một viên thuốc trống.
  const roles = Array.from(new Set((user?.roles ?? []).map((role) => role.trim()).filter(Boolean)));
  const shownRoles = roles.slice(0, MAX_ROLE_BADGES);
  const hiddenRoles = roles.length - shownRoles.length;

  return (
    <View className="w-full overflow-hidden rounded-md bg-bg-1">
      <MeProfileBanner active={focused} />

      <View className="items-center gap-sm px-md pb-md pt-lg">
        <View>
          {/* ⚠️ Sao vẽ TRƯỚC avatar ⇒ nằm SAU vòng đệm + nút bút chì: sao nào lấn vào thì bị che, trông như "ló ra" từ sau
              avatar thay vì đè lên mặt người. Khung 64 = đúng vòng đệm (`size-6xl`), ghim ở đỉnh để lỗi tải ảnh (Alert bên
              dưới avatar) không kéo sao xuống theo. */}
          <View className="absolute inset-x-0 top-0 h-16 items-center" pointerEvents="none">
            <View className="size-6xl">
              <Sparkles active={focused} className="-inset-4" count={3} size={10} />
            </View>
          </View>
          <MeAvatarPicker />
        </View>

        <View className="items-center gap-2xs">
          <Text className="text-center text-header-sm font-semibold text-fg-1">
            {user?.name ?? 'Khách'}
          </Text>
          <Text className="text-center text-body-md text-fg-2">
            {user?.email ?? 'Chưa đăng nhập'}
          </Text>
        </View>

        {shownRoles.length ? (
          <View className="flex-row flex-wrap justify-center gap-2xs">
            {shownRoles.map((role) => (
              <Badge key={role} label={role} size="sm" variant="brand" />
            ))}
            {hiddenRoles > 0 ? (
              <Badge
                accessibilityLabel={`và ${String(hiddenRoles)} vai trò khác`}
                label={`+${String(hiddenRoles)}`}
                size="sm"
                variant="neutral"
              />
            ) : null}
          </View>
        ) : null}

        {/* p4-03: cấp độ + chuỗi ngày — feature nguồn đăng ký qua khe `@/shared/profile` (`me` không import chéo feature). */}
        <ProfileExtrasSlot />
      </View>
    </View>
  );
}
