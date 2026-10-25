import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';

import { CallAvatarPulse } from './CallAvatarPulse';

/**
 * `size="2xl"` của `Avatar` = 96dp (`avatar.styles.ts`) — sửa cùng lúc với prop `size` bên dưới nếu đổi cỡ avatar.
 *
 * ⚠️ Cỡ `lg` (48dp, cỡ avatar trong DANH SÁCH) cũ quá nhỏ cho một màn TOÀN MÀN: đây là avatar CHÍNH của cả màn hình,
 * đúng ca `avatar.styles.ts` dành `xl`/`2xl` cho ("đầu trang hồ sơ/nhóm — nơi avatar là ảnh chính chứ không phải một
 * ô trong danh sách"). Cùng khối, chữ tên đổi sang `text-header-lg` bên dưới cho cân với đường kính mới.
 */
const AVATAR_SIZE = 96;

export interface CallPeerHeaderProps {
  avatarUrl: string | null;
  /**
   * `true` = đang đổ chuông/đang kết nối (outgoing/incoming/connecting) → bật vòng sóng quanh avatar.
   * ⛔ Cố ý tách khỏi `status`: `status` là CHUỖI HIỂN THỊ ("Đang gọi…", "Cuộc gọi video đến"…), đổi
   * câu chữ một chỗ là animation vỡ theo nếu suy từ nó. `CallScreen` truyền prop này thẳng từ `phase`.
   */
  ringing: boolean;
  /** Dòng phụ dưới tên: "Đang gọi…", "05:12", "Cuộc gọi đã kết thúc". */
  status: string;
  title: string;
}

/** Khối tên + ảnh + trạng thái ở đầu màn cuộc gọi (chữ sáng trên nền gradient `nav-to`, xem `CallScreenBackdrop`). `status` là vùng `polite` để đọc khi đổi. */
export function CallPeerHeader({ avatarUrl, ringing, status, title }: CallPeerHeaderProps) {
  return (
    <View className="items-center gap-md px-lg py-xl">
      <CallAvatarPulse active={ringing} size={AVATAR_SIZE}>
        <Avatar name={title} size="2xl" source={avatarUrl ? { uri: avatarUrl } : undefined} />
      </CallAvatarPulse>
      <Text className="text-center text-header-lg text-fg-on-nav" numberOfLines={2}>
        {title}
      </Text>
      <Text accessibilityLiveRegion="polite" className="text-body-md text-fg-on-nav-muted">
        {status}
      </Text>
    </View>
  );
}
