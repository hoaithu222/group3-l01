import { router, type Href } from 'expo-router';

import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import { PATHS } from '@/shell/config';
import { useFeature } from '@/shell/capabilities';

import type { WorkspaceRole } from '../api';
import { WORKSPACE_HUB_ENTRY as HUB } from '../constants/workspace-hub.constants';
import { whiteboardHubEntry } from './whiteboard-hub-entry';

/** Một lối vào ở tổng quan nhóm (ô lưới hoặc dòng — `splitHubEntries`): bấm cả ô/dòng để mở màn đích (không có nút phụ). */
export interface WorkspaceHubEntry {
  /** Số chưa đọc của phân hệ đích — hiện tại chỉ "Kênh" có (cùng số với `unreadChannels` của huy hiệu tab "Nhóm"). */
  badge?: number;
  description: string;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  /**
   * Tông ô icon CỐ ĐỊNH theo LOẠI lối vào (`WORKSPACE_HUB_ENTRY`), khai cùng mục — ⛔ BẮT BUỘC: bản cũ để trống được thì
   * `WorkspaceHubCard` xoay tông theo VỊ TRÍ dòng, tắt một cờ là mọi dòng phía sau đổi màu (màu không còn nói "đây là phân hệ nào").
   */
  tone: IconTileTone;
}

export interface UseWorkspaceHubEntriesInput {
  /** Tổng số kênh chưa đọc của NHÓM này (`GET /me/unread/summary` → `workspaces[].unreadChannels`) — gắn lên dòng "Kênh" để
   *  bấm vào từ tổng quan biết trước có tin mới, cùng số đã cộng vào huy hiệu tab "Nhóm" (`useTabBadges`). */
  channelsUnread?: number;
  memberCount: number;
  role: WorkspaceRole;
  wsId: string;
}

/**
 * Các lối vào của tổng quan nhóm, ĐÃ LỌC theo vai trò và cờ phân hệ — màn chỉ việc vẽ, không tự lọc lần nữa.
 *
 *  · "Kênh" luôn có (khách cũng vào được các kênh được chỉ định).
 *  · "Thành viên" ẩn với KHÁCH (BE không gửi `memberCount`, khách không có danh bạ).
 *  · "Lịch họp" · "Ví nhóm" · "Xếp hạng" ẩn với KHÁCH và khi cờ phân hệ TẮT hoặc CHƯA biết (`undefined` cũng ẩn — thà hiện
 *    muộn còn hơn hiện rồi biến mất). Chỉ là lọc để HIỂN THỊ; hàng rào thật là BE (khách/cờ tắt → 404).
 *  · "Tích hợp" (p5-03, cờ `integration`): mọi thành viên KHÔNG phải khách — OWNER/ADMIN cấu hình, MEMBER chỉ xem danh sách (BE
 *    `GET /workspaces/:id/integrations` từ vai MEMBER; màn đích tự ẩn nút theo `canManage`), nên mô tả nói đúng việc mỗi vai làm được.
 *  · "Tìm cố vấn" (p6-03, cờ `mentor`): CHỈ OWNER/ADMIN — người đăng bài/duyệt đơn cho nhóm (BE 403 với vai thấp hơn).
 *  · "Tài liệu cộng tác" (p6-01, cờ `collab`): mọi vai kể cả khách (khách chỉ thấy tài liệu được mời — BE lọc).
 *
 * Nhãn · icon · tông · mô tả tĩnh nằm ở `constants/workspace-hub.constants.ts`; ở đây chỉ còn LUẬT lọc và điều hướng.
 *
 * ⚠️ Không có nút "Tạo"/"Mời" cạnh từng dòng: các màn đích (danh sách kênh, danh sách thành viên, lịch họp) đã có nút tạo của
 * riêng chúng, và cùng một việc không nên có ba lối vào trên một màn (mobile-ux). Không import feature khác: điều hướng bằng
 * ĐƯỜNG DẪN (`feature-structure.md`).
 */
export function useWorkspaceHubEntries({
  channelsUnread,
  memberCount,
  role,
  wsId,
}: UseWorkspaceHubEntriesInput): WorkspaceHubEntry[] {
  const meetingEnabled = useFeature('meeting') === true;
  const walletEnabled = useFeature('wallet') === true;
  const gamificationEnabled = useFeature('gamification') === true;
  const integrationEnabled = useFeature('integration') === true;
  const mentorEnabled = useFeature('mentor') === true;
  const collabEnabled = useFeature('collab') === true;
  const plagiarismEnabled = useFeature('plagiarism') === true;
  const isGuest = role === 'GUEST';
  const canManage = role === 'OWNER' || role === 'ADMIN';

  const entries: WorkspaceHubEntry[] = [
    {
      ...HUB.channels,
      badge: channelsUnread,
      onPress: () => router.push({ pathname: '/workspaces/[wsId]/channels', params: { wsId } }),
    },
  ];

  if (!isGuest) {
    entries.push({
      ...HUB.members,
      description: `${memberCount} thành viên`,
      onPress: () => router.push({ pathname: '/workspaces/[wsId]/members', params: { wsId } }),
    });
  }

  if (meetingEnabled && !isGuest) {
    entries.push({ ...HUB.meetings, onPress: () => router.push(PATHS.MEETINGS) });
  }

  if (walletEnabled && !isGuest) {
    // Ép `Href`: route chỉ-có-`index` bị bộ sinh typed routes sinh thất thường (xem `wallet-routes.ts` ở feature ví).
    entries.push({
      ...HUB.wallet,
      onPress: () => router.push(`/workspaces/${wsId}/wallet` as Href),
    });
  }

  if (gamificationEnabled && !isGuest) {
    entries.push({
      ...HUB.leaderboard,
      onPress: () => router.push({ pathname: '/workspaces/[wsId]/leaderboard', params: { wsId } }),
    });
  }

  if (integrationEnabled && !isGuest) {
    entries.push({
      ...HUB.integrations,
      description: canManage
        ? 'Kết nối GitHub, GitLab, Figma để nhận thông báo vào kênh'
        : 'Xem các dịch vụ đang gửi thông báo vào nhóm',
      // Ép `Href`: route chỉ-có-`index` bị bộ sinh typed routes sinh thất thường (xem `wallet-routes.ts` ở feature ví).
      onPress: () => router.push(`/workspaces/${wsId}/integrations` as Href),
    });
  }

  // p6-01 (cờ `collab`): soạn thảo cộng tác. Nhãn "Tài liệu cộng tác" (tên phân hệ ở BE) để KHÔNG trùng thẻ "Tài liệu" = kho tệp của
  // `ResourcesHubCard`. Khách cũng thấy (BE chỉ trả tài liệu họ được mời); đi bằng ĐƯỜNG DẪN vì `workspaces` không import `docs`.
  if (collabEnabled) {
    entries.push({
      ...HUB.docs,
      description: isGuest
        ? 'Xem các tài liệu bạn được mời'
        : 'Soạn thảo chung theo thời gian thực, thấy con trỏ của nhau',
      onPress: () => router.push(`/workspaces/${wsId}/docs` as Href),
    });
    entries.push(whiteboardHubEntry(wsId, isGuest)); // p6-02: "Bảng trắng" cạnh "Tài liệu cộng tác" (cùng cờ `collab`)
  }

  if (mentorEnabled && canManage) {
    entries.push({
      ...HUB.mentor,
      onPress: () => router.push(`/workspaces/${wsId}/mentor` as Href),
    });
  }

  // p7-05 (cờ `plagiarism`): CHỈ OWNER/ADMIN — kết quả nhạy cảm, dễ bị dùng để "bắt lỗi" thành viên (be.md §2).
  if (plagiarismEnabled && canManage) {
    entries.push({
      ...HUB.plagiarism,
      onPress: () => router.push(`/workspaces/${wsId}/plagiarism` as Href),
    });
  }

  return entries;
}
