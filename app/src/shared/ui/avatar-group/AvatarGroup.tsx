import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { tCommon } from '@/shared/utils/i18n';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { Avatar, type AvatarSize } from '../avatar';

/**
 * Nhóm avatar chồng lên nhau ("Facepile") — thành viên hội thoại/kênh/cuộc họp (p0-12).
 *
 * Số đo: mỗi avatar đè lên avatar trước `-ml-2` (8dp) — đủ để thấy mặt, đủ chồng để nhóm gọn. Ô "+k" cùng đường kính, nền
 * `surface-primary` + chữ `fg-brand` (cùng cặp với chữ viết tắt của `Avatar` — đo 9.87:1). Viền trắng quanh mỗi avatar (của
 * chính `Avatar`) là thứ tách chúng khi chồng.
 */
const avatarGroup = tv(
  {
    slots: {
      root: 'self-start',
      row: 'flex-row items-center',
      item: '',
      overflow: 'items-center justify-center rounded-full border-border-white bg-surface-primary',
      overflowLabel: 'font-semibold text-fg-brand',
    },
    variants: {
      overlap: { true: { item: '-ml-2' } },
      size: {
        xs: { overflow: 'h-6 w-6 border-hairline', overflowLabel: 'text-label-xs' },
        sm: { overflow: 'h-8 w-8 border-medium', overflowLabel: 'text-label-xs' },
        md: { overflow: 'h-10 w-10 border-thick', overflowLabel: 'text-label-md' },
        lg: { overflow: 'h-12 w-12 border-thick', overflowLabel: 'text-label-lg' },
      },
    },
    defaultVariants: { size: 'sm' },
  },
  { twMergeConfig },
);

/** Trần hệ số phóng chữ của "+k" — cùng lý do `INITIALS_MAX_FONT_SCALE` của `Avatar` (đường kính cứng). */
const OVERFLOW_MAX_FONT_SCALE = 1.3;
/** Ô "+k" chỉ đủ chỗ cho hai chữ số; con số THẬT nằm ở nhãn trợ năng. */
const OVERFLOW_DISPLAY_MAX = 99;

export interface AvatarGroupUser {
  avatarUrl?: string | null;
  id: string;
  name: string;
}

/**
 * Cỡ nhóm avatar — bốn cỡ của Figma. ⚠️ `xl`/`2xl` của `Avatar` (đầu trang hồ sơ/nhóm) cố ý KHÔNG có ở đây: một hàng
 * avatar 64–96 dp chồng nhau không còn là "facepile" gọn, và ô "+k" không có bậc số đo tương ứng.
 */
export type AvatarGroupSize = Extract<AvatarSize, 'xs' | 'sm' | 'md' | 'lg'>;

export interface AvatarGroupProps {
  className?: string;
  /** Số avatar hiện tối đa; phần còn lại gộp thành "+k". Mặc định 3. */
  max?: number;
  size?: AvatarGroupSize;
  users: readonly AvatarGroupUser[];
}

/**
 * Câu cho trình đọc màn hình: "Nguyễn An, Trần Bình và 2 người khác" (còn người dư) · "An và Bình" · "An, Bình và Chi".
 * `shown` = số người đang HIỆN. Xuất ra để nơi gọi dùng lại cho `accessibilityLabel` của hàng chứa nhóm avatar.
 */
export function describeAvatarGroup(users: readonly AvatarGroupUser[], shown: number): string {
  const names = users.slice(0, Math.max(0, shown)).map((user) => user.name);
  const hidden = users.length - names.length;
  if (hidden > 0) {
    const others = tCommon('count.others', { count: hidden });
    return names.length > 0 ? `${names.join(', ')} và ${others}` : others;
  }
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1] ?? ''}`;
}

export function AvatarGroup({ className, max = 3, size = 'sm', users }: AvatarGroupProps) {
  if (users.length === 0) return null;

  const limit = Math.max(1, Math.floor(max));
  // Đúng MỘT người dư thì hiện luôn avatar của họ: ô "+1" chiếm chỗ bằng một avatar mà chẳng nói được gì.
  const visible = users.length === limit + 1 ? users : users.slice(0, limit);
  const hidden = users.length - visible.length;
  const styles = avatarGroup({ size });

  return (
    <View
      // Cả nhóm là MỘT phần tử với trình đọc màn hình (đọc một câu), không phải N avatar rời.
      accessibilityLabel={describeAvatarGroup(users, visible.length)}
      accessibilityRole="image"
      accessible
      className={styles.root({ className })}
    >
      <View
        // Các avatar con cũng `accessible` (có tên) — ẩn khỏi trình đọc để không đọc trùng với nhãn của nhóm. Cả HAI prop:
        // `accessibilityElementsHidden` chỉ iOS nghe, `importantForAccessibility` chỉ Android nghe.
        accessibilityElementsHidden
        className={styles.row()}
        importantForAccessibility="no-hide-descendants"
      >
        {visible.map((user, index) => (
          <View key={user.id} className={avatarGroup({ overlap: index > 0, size }).item()}>
            <Avatar
              name={user.name}
              size={size}
              source={user.avatarUrl ? { uri: user.avatarUrl } : undefined}
            />
          </View>
        ))}
        {hidden > 0 ? (
          <View className={avatarGroup({ overlap: true, size }).item()}>
            <View className={styles.overflow()}>
              <Text
                className={styles.overflowLabel()}
                maxFontSizeMultiplier={OVERFLOW_MAX_FONT_SCALE}
                numberOfLines={1}
              >
                {`+${String(Math.min(hidden, OVERFLOW_DISPLAY_MAX))}`}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
