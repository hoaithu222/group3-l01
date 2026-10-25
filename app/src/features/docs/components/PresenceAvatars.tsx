import { AvatarGroup, describeAvatarGroup } from '@/shared/ui/avatar-group';
import { View } from 'react-native';

import type { PresenceUser } from '../webview/doc-editor-bridge.types';

const MAX_SHOWN = 3;

export interface PresenceAvatarsProps {
  users: PresenceUser[];
}

/**
 * Người đang mở tài liệu (app.md §3): tối đa 3 avatar + "+N", KHÔNG gồm chính mình (mình luôn có mặt — thêm vào chỉ tốn chỗ ở khe phải
 * của `AppBar`). Danh sách do WebView gửi (`awareness`), đã cắt tên/chuẩn hoá màu ở `normalizePresence`. Một người nhiều máy = một
 * avatar (trang đã gộp theo `id`). Câu đọc cho trình đọc màn hình liệt kê tên, không chỉ "+N".
 */
export function PresenceAvatars({ users }: PresenceAvatarsProps) {
  const others = users.filter((user) => !user.self);
  if (others.length === 0) return null;
  const group = others.map((user) => ({ id: user.id, name: user.name }));

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
