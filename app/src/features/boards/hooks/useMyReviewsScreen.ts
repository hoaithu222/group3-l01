import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import type { MyReviewItemDto, MyReviewsStatus } from '../api/reviews.types';
import { useMyReviews } from '../queries/reviews.queries';
import { reviewSubmitHref } from '../utils/review-routes';
import { useReviewInboxRealtime } from './useReviewRealtime';

/**
 * Trạng thái của "Cần chấm của tôi" (p4-05 app.md §3 `MyReviews`): tab Cần chấm · Đã chấm, danh sách cursor phẳng, và đường mở từng hàng
 * (cần chấm → màn chấm; đã chấm → chi tiết thẻ). Thông báo `review.*` mới tới thì danh sách tải lại; nhóm đã rời biến mất khi tải lại
 * (BE lọc theo nhóm còn là thành viên).
 */
export function useMyReviewsScreen() {
  const [tab, setTab] = useState<MyReviewsStatus>('PENDING');
  const list = useMyReviews(tab);
  useReviewInboxRealtime();
  const items = useMemo<MyReviewItemDto[]>(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  const open = (item: MyReviewItemDto) => {
    const { boardId, id, workspaceId } = item.task;
    if (tab === 'PENDING') {
      router.push(reviewSubmitHref(workspaceId, boardId, id));
      return;
    }
    router.push({
      params: { boardId, taskId: id, wsId: workspaceId },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  };

  return { items, list, open, setTab, tab };
}
