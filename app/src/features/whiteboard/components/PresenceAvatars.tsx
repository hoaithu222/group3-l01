import { View } from 'react-native';

import { AvatarGroup, describeAvatarGroup } from '@/shared/ui/avatar-group';

import { useWhiteboardSessionStore } from '../store/whiteboard-session.store';

const MAX_SHOWN = 3;

/**
 * Người đang mở bảng (app.md §3 `PresenceAvatars`): tối đa 3 avatar + "+N" từ awareness `user` của collab, KHÔNG gồm chính mình (luôn có mặt — thêm vào
 * chỉ tốn chỗ ở khe phải của `AppBar`). Một người nhiều máy = một avatar. Câu đọc cho trình đọc màn hình liệt kê tên. ⚠️ Đọc `users` (danh sách theo
 * DANH TÍNH, tham chiếu ổn định), không phải `peers`: `peers` đổi ở nhịp con trỏ (≤ 30 Hz mỗi người) còn avatar chỉ đổi khi có người vào/ra.
 */
export function PresenceAvatars() {
  const users = useWhiteboardSessionStore((state) => state.users);
  if (users.length === 0) return null;
  const group = users.map((user) => ({ id: user.id, name: user.name }));

  return (
    <View
      accessibilityLabel={`Đang xem: ${describeAvatarGroup(group, MAX_SHOWN)}`}
      accessible
      className="justify-center"
    >
      <AvatarGroup max={MAX_SHOWN} size="sm" users={group} />
    </View>
  );
}
