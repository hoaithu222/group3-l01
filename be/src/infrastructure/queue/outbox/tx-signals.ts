/**
 * Đánh dấu transaction Prisma nào vừa ghi `OutboxEvent` — để
 * `withTransaction()` (infrastructure/database) chỉ gọi `outboxSignal()`
 * (PUBLISH Redis) khi thật sự cần, thay vì sau MỌI transaction trong hệ
 * thống (đa số không đụng outbox).
 *
 * `WeakSet` khoá theo tham chiếu object `tx` — tự dọn khi transaction kết
 * thúc và không còn tham chiếu nào giữ nó, không rò rỉ bộ nhớ.
 */
const marked = new WeakSet<object>();

export function markForSignal(tx: object): void {
  marked.add(tx);
}

/** Kiểm tra + xoá cờ (dùng một lần) — gọi sau khi transaction commit thành công. */
export function consumeSignalMark(tx: object): boolean {
  const had = marked.has(tx);
  marked.delete(tx);
  return had;
}
