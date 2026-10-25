import type { InfiniteData } from '@tanstack/react-query';

import type { MessagesPage, MessageView } from '../api/chat.types';

export type MessagesPageParam =
  | { kind: 'latest' }
  | { kind: 'around'; anchor: string }
  | { kind: 'before'; beforeSeq: number }
  | { kind: 'after'; afterSeq: number };

export type MessagesData = InfiniteData<MessagesPage, MessagesPageParam>;

/**
 * Tin nhắn theo `seq` TĂNG DẦN (cũ → mới, trên → dưới) — khớp thứ tự đọc tự
 * nhiên. `pages` của React Query đã theo đúng thứ tự thời gian (trang đầu =
 * cũ nhất, trang cuối = mới nhất): `fetchPreviousPage` (beforeSeq) UNSHIFT,
 * `fetchNextPage` (afterSeq) PUSH — nên `flatMap` giữ nguyên là đủ.
 *
 * `FlashList` 2.x đã BỎ prop `inverted` (không còn tồn tại) — thay bằng
 * `maintainVisibleContentPosition.startRenderingFromBottom`, xem `MessageList.tsx`.
 * Vì vậy danh sách ở đây KHÔNG đảo ngược như app.md mô tả cho FlashList 1.x.
 */
export function flattenMessages(data: MessagesData | undefined): MessageView[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: MessageView[] = [];
  for (const page of data.pages) {
    for (const message of page.data) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      out.push(message);
    }
  }
  return out;
}

/** `seq` lớn nhất đã tải — dùng cho gap-fill (`afterSeq`) và kiểm lỗ khi có `message:created`. */
export function maxLoadedSeq(data: MessagesData | undefined): number {
  let max = 0;
  for (const page of data?.pages ?? []) {
    for (const m of page.data) if (m.seq > max) max = m.seq;
  }
  return max;
}

/** Trang MỚI NHẤT (cuối mảng) đã chạm tới tin mới nhất thật sự (`hasMoreAfter=false`). */
export function isCaughtUpToLatest(data: MessagesData | undefined): boolean {
  const last = data?.pages.at(-1);
  return last !== undefined && !last.meta.hasMoreAfter;
}

/**
 * Nối một trang MỚI TẢI (gap-fill, `hooks/gap-fill-messages.ts`) vào cuối —
 * KHÔNG gộp vào trang cuối hiện có: trang mới mang đúng `meta` của chính nó
 * (`hasMoreAfter`/`nextAfterSeq`), cần giữ nguyên để `getNextPageParam` tính
 * tiếp đúng — gộp lẫn vào trang cũ sẽ làm mất `meta` đó.
 */
export function appendFetchedPage(data: MessagesData, page: MessagesPage, afterSeq: number): MessagesData {
  const seen = new Set(flattenMessages(data).map((m) => m.id));
  const deduped = { ...page, data: page.data.filter((m) => !seen.has(m.id)) };
  return {
    ...data,
    pages: [...data.pages, deduped],
    pageParams: [...data.pageParams, { kind: 'after', afterSeq }],
  };
}

/** Chèn một tin vào CUỐI trang cuối cùng — chỉ gọi khi `isCaughtUpToLatest()`. */
export function appendToLatestPage(data: MessagesData, message: MessageView): MessagesData {
  const pages = [...data.pages];
  const lastIndex = pages.length - 1;
  const last = pages[lastIndex];
  if (!last) return data;
  if (last.data.some((m) => m.id === message.id)) return data;
  pages[lastIndex] = { ...last, data: [...last.data, message] };
  return { ...data, pages };
}

/** Áp `patch` lên tin có `id` khớp, ở BẤT KỲ trang nào — không tìm thấy thì trả nguyên `data` (không đổi tham chiếu). */
export function patchMessageById(
  data: MessagesData,
  id: string,
  patch: (message: MessageView) => MessageView,
): MessagesData {
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const nextData = page.data.map((m) => {
      if (m.id !== id) return m;
      pageChanged = true;
      return patch(m);
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, data: nextData };
  });
  return changed ? { ...data, pages } : data;
}

/** Loại một tin khỏi mọi trang (vd `message:hidden` phía tôi). */
export function removeMessageById(data: MessagesData, id: string): MessagesData {
  let changed = false;
  const pages = data.pages.map((page) => {
    const nextData = page.data.filter((m) => m.id !== id);
    if (nextData.length === page.data.length) return page;
    changed = true;
    return { ...page, data: nextData };
  });
  return changed ? { ...data, pages } : data;
}

/** Đánh dấu `replyPreview.deleted=true` cho MỌI tin trả lời tới `targetId` (`message:deleted`). */
export function markRepliesDeleted(data: MessagesData, targetId: string): MessagesData {
  return patchAllWhere(
    data,
    (m) => m.replyToId === targetId && m.replyPreview !== null && !m.replyPreview.deleted,
    (m) => ({ ...m, replyPreview: m.replyPreview && { ...m.replyPreview, deleted: true } }),
  );
}

function patchAllWhere(
  data: MessagesData,
  match: (m: MessageView) => boolean,
  patch: (m: MessageView) => MessageView,
): MessagesData {
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const nextData = page.data.map((m) => {
      if (!match(m)) return m;
      pageChanged = true;
      return patch(m);
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, data: nextData };
  });
  return changed ? { ...data, pages } : data;
}
