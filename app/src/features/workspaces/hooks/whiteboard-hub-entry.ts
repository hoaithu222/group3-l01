import { router, type Href } from 'expo-router';

import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import { WORKSPACE_HUB_ENTRY } from '../constants/workspace-hub.constants';

/**
 * Lối vào "Bảng trắng" (p6-02, cờ `collab` — dùng chung với "Tài liệu cộng tác") ở tổng quan nhóm. Tách khỏi `useWorkspaceHubEntries` vì file đó sát trần 150 dòng.
 * Khách cũng thấy (BE chỉ trả bảng họ được mời); đi bằng ĐƯỜNG DẪN vì `workspaces` không import `whiteboard` (`feature-structure.md`). Kiểu trả về khai theo cấu trúc
 * (cùng hình `WorkspaceHubEntry`) để không import ngược từ hook — tránh vòng import. Nhãn · icon · tông lấy từ `WORKSPACE_HUB_ENTRY` như mọi dòng khác.
 */
export function whiteboardHubEntry(
  wsId: string,
  isGuest: boolean,
): {
  description: string;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone: IconTileTone;
} {
  return {
    ...WORKSPACE_HUB_ENTRY.whiteboards,
    description: isGuest
      ? 'Xem các bảng trắng bạn được mời'
      : 'Vẽ sơ đồ, ghi chú chung theo thời gian thực',
    onPress: () => router.push(`/workspaces/${wsId}/whiteboards` as Href),
  };
}
