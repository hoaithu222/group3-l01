import type { InfiniteData } from '@tanstack/react-query';

import type { FeedSegment } from '../constants/task-detail.constants';
import type { CursorPage, TaskActivityDto, TaskCommentView } from '../api/task-detail.types';

/** Cache của activity/bình luận: `useInfiniteQuery` với con trỏ trang (mới → cũ). */
export type PagesData<T> = InfiniteData<CursorPage<T>>;

export type FeedItem =
  | { at: string; comment: TaskCommentView; id: string; kind: 'comment' }
  | { activity: TaskActivityDto; at: string; id: string; kind: 'activity' };

export const TEMP_COMMENT_PREFIX = 'tmp_';

export function tempCommentId(clientCommentId: string): string {
  return `${TEMP_COMMENT_PREFIX}${clientCommentId}`;
}

export function flattenPages<T>(data: PagesData<T> | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

function mapPages<T>(data: PagesData<T>, map: (items: T[]) => T[]): PagesData<T> {
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: map(page.items) })) };
}

/**
 * Thêm hoặc THAY một bình luận. Khớp theo `id` HOẶC `clientCommentId`: bản tạm (`tmp_…`), bản server
 * trả về và bản tới qua socket cùng mang một `clientCommentId` — nên hội tụ về MỘT dòng, không nhân đôi
 * (app.md §4 "bỏ nếu `clientCommentId` của mình đã có"). Chưa có → chèn ĐẦU trang đầu (mới nhất).
 */
export function upsertComment(
  data: PagesData<TaskCommentView> | undefined,
  comment: TaskCommentView,
): PagesData<TaskCommentView> {
  const isSame = (item: TaskCommentView) =>
    item.id === comment.id || item.clientCommentId === comment.clientCommentId;
  if (!data) return { pageParams: [undefined], pages: [{ items: [comment], nextCursor: null }] };

  let found = false;
  const replaced = mapPages(data, (items) =>
    items.map((item) => {
      if (!isSame(item)) return item;
      found = true;
      return comment;
    }),
  );
  if (found) return replaced;

  const [first, ...rest] = data.pages;
  if (!first) return { ...data, pages: [{ items: [comment], nextCursor: null }] };
  return { ...data, pages: [{ ...first, items: [comment, ...first.items] }, ...rest] };
}

export function removeComment(
  data: PagesData<TaskCommentView> | undefined,
  commentId: string,
): PagesData<TaskCommentView> | undefined {
  return data && mapPages(data, (items) => items.filter((item) => item.id !== commentId));
}

export function patchComment(
  data: PagesData<TaskCommentView> | undefined,
  commentId: string,
  patch: Partial<TaskCommentView>,
): PagesData<TaskCommentView> | undefined {
  return (
    data &&
    mapPages(data, (items) =>
      items.map((item) => (item.id === commentId ? { ...item, ...patch } : item)),
    )
  );
}

/** Đã có bản THẬT (không phải `tmp_`) của bình luận này chưa — chặn đếm `commentCount` hai lần. */
export function hasServerComment(
  data: PagesData<TaskCommentView> | undefined,
  clientCommentId: string,
): boolean {
  return flattenPages(data).some(
    (item) => item.clientCommentId === clientCommentId && !item.id.startsWith(TEMP_COMMENT_PREFIX),
  );
}

/**
 * Thêm activity MỚI vào đầu luồng — hoặc THAY TẠI CHỖ nếu `id` đã có: BE gộp các lần tick checklist liên tiếp
 * (cùng người, cửa sổ 60 s) vào MỘT bản ghi và phát lại NÓ với cùng `id` nhưng `after.items` mới hơn (be.md p3-03
 * §14 mục 8, 16a). Bỏ qua bản phát lại thì câu "đã hoàn thành N việc nhỏ" đứng yên ở giá trị cũ. `at` của bản gộp
 * giữ nguyên nên vị trí trong luồng không đổi — không dời lên đầu.
 */
export function prependActivity(
  data: PagesData<TaskActivityDto> | undefined,
  activity: TaskActivityDto,
): PagesData<TaskActivityDto> | undefined {
  if (!data) return data;
  if (flattenPages(data).some((item) => item.id === activity.id)) {
    return mapPages(data, (items) => items.map((item) => (item.id === activity.id ? activity : item)));
  }
  const [first, ...rest] = data.pages;
  if (!first) return data;
  return { ...data, pages: [{ ...first, items: [activity, ...first.items] }, ...rest] };
}

/**
 * Trộn hai luồng (activity + bình luận) theo thời gian, MỚI → CŨ (app.md §2 `ActivityFeed`). Hai
 * luồng có con trỏ riêng nên "Tải thêm" nạp cả hai — thứ tự luôn đúng theo `at`.
 */
export function mergeFeed(
  activities: readonly TaskActivityDto[],
  comments: readonly TaskCommentView[],
  segment: FeedSegment,
): FeedItem[] {
  const items: FeedItem[] = [];
  if (segment !== 'comments') {
    for (const activity of activities) {
      items.push({ activity, at: activity.at, id: `a_${activity.id}`, kind: 'activity' });
    }
  }
  if (segment !== 'activity') {
    for (const comment of comments) {
      items.push({ at: comment.createdAt, comment, id: `c_${comment.id}`, kind: 'comment' });
    }
  }
  // `Date.parse` chứ không so chuỗi: hai nguồn có thể khác dạng ISO (`Z` so với `+00:00`).
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Còn trong cửa sổ sửa (mặc định 15 phút, `LIMITS.task.commentEditWindowSeconds`) không. */
export function canEditComment(
  comment: Pick<TaskCommentView, 'createdAt' | 'localStatus'>,
  now: number,
  windowSeconds: number,
): boolean {
  if (comment.localStatus) return false;
  return now - new Date(comment.createdAt).getTime() <= windowSeconds * 1000;
}
