import dayjs from 'dayjs';

import type { MessageView } from '../../api/chat.types';
import { GROUP_WINDOW_MS } from '../../chat.constants';
import type { PendingMessage } from '../../store/outbox.store';

export type BubbleItem = { kind: 'sent'; message: MessageView } | { kind: 'pending'; pending: PendingMessage };

export type ChatRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'bubble'; key: string; item: BubbleItem; grouped: boolean };

export interface BuildRowsInput {
  /** `seq` TĂNG DẦN (cũ → mới) — khớp `flattenMessages()`. */
  messages: MessageView[];
  /** Bản tạm SENDING/FAILED của scope này, nối vào CUỐI (mới nhất) — chỉ có ý nghĩa khi đang ở chế độ `latest`. */
  pending: PendingMessage[];
  currentUserId: string | undefined;
  /** `lastReadSeq+1` lúc MỞ màn — cố định, không di chuyển khi đọc tiếp (app.md §3 `UnreadDivider`). `undefined` = chưa có nguồn dữ liệu (đa số scope hiện tại). */
  unreadDividerBeforeSeq?: number;
}

interface CursorState {
  lastDateKey: string | undefined;
  prevAuthorId: string | null | undefined;
  prevAtMs: number | undefined;
  prevBreaksGroup: boolean;
}

/** Mốc NGÀY THEO GIỜ THIẾT BỊ — `dayjs(iso).format()` (không `.utc()`) tự quy về local timezone, khác cắt chuỗi ISO thô (UTC, sai mốc nửa đêm cho VN UTC+7). */
function dateKeyOf(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD');
}

function pushDateSeparator(rows: ChatRow[], cursor: CursorState, iso: string): void {
  const key = dateKeyOf(iso);
  if (key === cursor.lastDateKey) return;
  rows.push({ type: 'date', key: `date-${key}`, label: key });
  cursor.lastDateKey = key;
  cursor.prevAuthorId = undefined; // qua mốc ngày ⇒ không gộp với bong bóng trước
}

function isGrouped(cursor: CursorState, authorId: string | null, atMs: number, breaksGroup: boolean): boolean {
  return (
    !breaksGroup &&
    !cursor.prevBreaksGroup &&
    cursor.prevAuthorId !== undefined &&
    cursor.prevAuthorId === authorId &&
    cursor.prevAtMs !== undefined &&
    atMs - cursor.prevAtMs <= GROUP_WINDOW_MS
  );
}

/**
 * Chuyển `messages`/`pending` thành dòng hiển thị phẳng cho `MessageList`
 * (FlashList): mốc ngày, "Tin chưa đọc", và mỗi bong bóng kèm cờ `grouped`
 * (ẩn avatar/tên — app.md §3 "Grouping": cùng tác giả, cách ≤ 5 phút, không
 * qua mốc ngày/tin SYSTEM/tin trả lời).
 */
export function buildRows({ messages, pending, currentUserId, unreadDividerBeforeSeq }: BuildRowsInput): ChatRow[] {
  const rows: ChatRow[] = [];
  const cursor: CursorState = {
    lastDateKey: undefined,
    prevAuthorId: undefined,
    prevAtMs: undefined,
    prevBreaksGroup: false,
  };

  // Bản tạm đã có bản thật trong danh sách (khớp `clientMessageId`) thì bỏ: tránh một nhịp thấy CẢ HAI (hoặc không thấy cái nào) khi
  // outbox và cache cập nhật lệch nhau vài mili-giây.
  const sentClientIds = new Set<string>();
  for (const message of messages) if (message.clientMessageId) sentClientIds.add(message.clientMessageId);

  for (const message of messages) {
    pushDateSeparator(rows, cursor, message.createdAt);
    if (unreadDividerBeforeSeq !== undefined && message.seq === unreadDividerBeforeSeq) {
      rows.push({ type: 'unread', key: 'unread-divider' });
    }
    const atMs = new Date(message.createdAt).getTime();
    const breaksGroup = message.kind === 'SYSTEM' || message.replyToId !== null;
    const grouped = isGrouped(cursor, message.authorId, atMs, breaksGroup);
    // Tin của CHÍNH MÌNH dùng lại khoá của bản tạm ⇒ FlashList giữ nguyên view lúc "đang gửi" → "đã gửi" (không unmount/mount, không nháy).
    rows.push({ type: 'bubble', key: message.clientMessageId ? `pending-${message.clientMessageId}` : message.id, item: { kind: 'sent', message }, grouped });
    cursor.prevAuthorId = message.authorId;
    cursor.prevAtMs = atMs;
    cursor.prevBreaksGroup = breaksGroup;
  }

  for (const p of pending) {
    if (sentClientIds.has(p.clientMessageId)) continue;
    pushDateSeparator(rows, cursor, p.createdAtLocal);
    const atMs = new Date(p.createdAtLocal).getTime();
    const breaksGroup = p.replyToId !== undefined;
    const grouped = isGrouped(cursor, currentUserId ?? null, atMs, breaksGroup);
    rows.push({ type: 'bubble', key: `pending-${p.clientMessageId}`, item: { kind: 'pending', pending: p }, grouped });
    cursor.prevAuthorId = currentUserId ?? null;
    cursor.prevAtMs = atMs;
    cursor.prevBreaksGroup = breaksGroup;
  }

  return rows;
}
