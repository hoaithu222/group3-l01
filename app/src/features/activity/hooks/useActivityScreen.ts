import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { hrefForTarget, type InboxItem } from '@/core/notifications';
import { showToast } from '@/shared/utils/toast.utils';

import type { ActivityWorkspaceOption } from '../api/activity.service';
import type { ActivityTab } from '../components/ActivityFilterTabs';
import { needsWorkspaceLookup } from '../utils/describe-workspace';
import { buildActivityRows } from '../utils/group-by-day';
import { inboxItemTarget, isInboxItemUnavailable } from '../utils/inbox-target';
import { useActivityWorkspaces, useInbox } from './useInbox';
import { useInboxActions } from './useInboxActions';

export const ACTIVITY_TAB_LABEL: Record<ActivityTab, string> = {
  all: 'Tất cả',
  following: 'Đang theo dõi',
  mentions: 'Nhắc đến bạn',
};

/**
 * Trạng thái + hành vi của màn Hoạt động (p1-07 `app.md` §3, §4.5): tab/nhóm lọc, danh sách, mở một mục, "Đánh dấu tất cả
 * đã đọc" (phạm vi nêu rõ trong hộp thoại, `before` = thời điểm TẢI danh sách nên mục tới sau vẫn chưa đọc — NT-13).
 */
export function useActivityScreen() {
  const [tab, setTab] = useState<ActivityTab>('all');
  const [workspace, setWorkspace] = useState<ActivityWorkspaceOption | null>(null);
  const [confirmingReadAll, setConfirmingReadAll] = useState(false);

  const list = useInbox(tab, workspace?.id);
  const { readAll, readOne } = useInboxActions();
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  // Nhãn nhóm ngày (Hôm nay · Hôm qua · …) chèn giữa các mục — danh sách đã sắp mới → cũ nên chỉ cần cắt ở chỗ đổi ngày.
  const rows = useMemo(() => buildActivityRows(items), [items]);
  const hasUnread = useMemo(() => items.some((item) => item.readAt === null), [items]);

  // Tên nhóm cho câu của mục `workspace.*` mà BE chỉ kèm id (đổi vai trò…). Chỉ tải khi CÓ mục như vậy; cùng khoá cache với chip lọc nhóm.
  const needsNames = useMemo(() => items.some(needsWorkspaceLookup), [items]);
  const workspaceList = useActivityWorkspaces(needsNames);
  const workspaceNames = useMemo(
    () => new Map((workspaceList.data ?? []).map((workspace) => [workspace.id, workspace.name])),
    [workspaceList.data],
  );

  const open = useCallback(
    (item: InboxItem) => {
      // Đánh dấu đọc LẠC QUAN trước khi điều hướng — kể cả mục mất quyền (không để nó chưa đọc mãi).
      if (item.readAt === null) readOne.mutate(item);
      if (isInboxItemUnavailable(item)) {
        showToast('info', 'Nội dung không còn khả dụng.');
        return;
      }
      const href = hrefForTarget(inboxItemTarget(item));
      if (!href) {
        showToast('info', 'Không mở được thông báo này.');
        return;
      }
      router.push(href);
    },
    [readOne],
  );

  const confirmReadAll = useCallback(() => {
    readAll.mutate({
      before: new Date(list.dataUpdatedAt || Date.now()).toISOString(),
      filter: tab,
      workspaceId: workspace?.id,
    });
    setConfirmingReadAll(false);
  }, [list.dataUpdatedAt, readAll, tab, workspace?.id]);

  const clearFilters = useCallback(() => {
    setTab('all');
    setWorkspace(null);
  }, []);

  return {
    clearFilters,
    confirmReadAll,
    confirmingReadAll,
    hasUnread,
    isReadingAll: readAll.isPending,
    items,
    list,
    open,
    rows,
    readAllScope: `các mục trong "${ACTIVITY_TAB_LABEL[tab]}"${workspace ? ` của nhóm ${workspace.name}` : ''}`,
    setConfirmingReadAll,
    setTab,
    setWorkspace,
    tab,
    workspace,
    workspaceNames,
  };
}
