import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";

/** Cursor `(createdAt, id)` giảm dần — đọc `limit + 1` bản ghi để biết còn trang sau. */
export const beforeOf = (cursor?: string) => (cursor ? decodeCursor(cursor) ?? undefined : undefined);

export function cursorPage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const hasMore = rows.length > limit;
  return { page, meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit } };
}
