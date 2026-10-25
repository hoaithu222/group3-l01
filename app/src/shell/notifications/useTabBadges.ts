import { useMemo } from 'react';

import { MODULE_REGISTRY } from '@/shell/navigation/module-registry';

import { useUnreadSummary } from './useUnreadSummary';

/**
 * Số huy hiệu cho từng tab, khoá theo `ModuleConfig.name` (`AppTabBar` tra bằng tên route). Nguồn là
 * `GET /me/unread/summary`; chưa có dữ liệu → không huy hiệu (không bịa số).
 *
 *  · `unreadConversations` (tab Tin nhắn): số HỘI THOẠI chưa đọc, không tính hội thoại tắt tiếng (server đã loại);
 *  · `unread` (tab Hoạt động): số mục hộp thư chưa đọc;
 *  · `unreadChannels` (tab Nhóm): tổng số kênh chưa đọc ở mọi nhóm (`BottomNav` chỉ có số, không có chấm).
 */
export function useTabBadges(): Record<string, number> {
  const { data } = useUnreadSummary();

  return useMemo(() => {
    const badges: Record<string, number> = {};
    if (!data) return badges;
    for (const module of MODULE_REGISTRY) {
      // Phân hệ phụ không `name` (vd `/messages/calls`) không có tab để gắn huy hiệu.
      if (!module.name) continue;
      if (module.badge === 'unreadConversations') {
        badges[module.name] = data.conversations.unreadConversations;
      } else if (module.badge === 'unread') {
        badges[module.name] = data.activity.unread;
      } else if (module.badge === 'unreadChannels') {
        badges[module.name] = data.workspaces.reduce((sum, ws) => sum + ws.unreadChannels, 0);
      }
    }
    return badges;
  }, [data]);
}
