import { patchMessageById, type MessagesData } from '@/features/chat';

import type { PollUpdatedEvent, PollView } from '../api/chat-extensions.types';

/**
 * Hàm THUẦN vá `message.poll` trong cache tin nhắn của `chat` (`chatKeys.messages`) — nơi DUY NHẤT giữ khảo sát của thẻ (xem `chat-extensions.keys.ts`).
 * Không có React Query/socket ở đây nên test được từng luật: phần trăm, lạc quan, hợp nhất bản server, bỏ qua bản cũ.
 */

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Cùng công thức BE (`poll-projection.ts`): tính trên số NGƯỜI đã bầu, làm tròn 1 chữ số. */
export const percentOf = (count: number, voters: number): number =>
  voters > 0 ? round1((count / voters) * 100) : 0;

/**
 * Khảo sát ĐÃ KẾT THÚC chưa — kể cả khi quá `closesAt` mà job đóng phía BE chưa chạy (BE cũng hiển thị "đã đóng" trước, `poll-projection.ts effectiveState`,
 * và từ chối bầu bằng `POLL_004`). `nowMs` là giờ MÁY CHỦ (người dùng lệch đồng hồ vẫn đúng).
 */
export function isPollClosed(poll: Pick<PollView, 'status' | 'closesAt'>, nowMs: number): boolean {
  if (poll.status === 'CLOSED') return true;
  return poll.closesAt !== null && new Date(poll.closesAt).getTime() <= nowMs;
}

/** `poll:updated` — CHỈ áp bản MỚI hơn (`version`); giữ `myOptionIds` cục bộ (payload không có). Đóng khảo sát ⇒ `canClose = false`. */
export function applyPollEvent(poll: PollView, event: PollUpdatedEvent): PollView {
  if (event.version <= poll.version) return poll;
  const counts = new Map(event.options.map((o) => [o.id, o.voteCount]));
  return {
    ...poll,
    status: event.status,
    closeReason: event.closeReason,
    voterCount: event.voterCount,
    version: event.version,
    canClose: event.status === 'OPEN' ? poll.canClose : false,
    options: poll.options.map((o) => {
      const voteCount = counts.get(o.id) ?? o.voteCount;
      return { ...o, voteCount, percent: percentOf(voteCount, event.voterCount) };
    }),
  };
}

/** Lạc quan: đặt lựa chọn của MÌNH thành `nextIds` (rỗng = bỏ phiếu) và tính lại đếm/phần trăm. Không đổi `version` (chỉ server mới tăng). */
export function withMyVote(poll: PollView, nextIds: string[]): PollView {
  const before = new Set(poll.myOptionIds);
  const after = new Set(nextIds);
  let voterCount = poll.voterCount;
  if (before.size === 0 && after.size > 0) voterCount += 1;
  else if (before.size > 0 && after.size === 0) voterCount = Math.max(0, voterCount - 1);
  return {
    ...poll,
    myOptionIds: nextIds,
    voterCount,
    options: poll.options.map((o) => {
      const voteCount = Math.max(0, o.voteCount - (before.has(o.id) ? 1 : 0) + (after.has(o.id) ? 1 : 0));
      return { ...o, voteCount, percent: percentOf(voteCount, voterCount) };
    }),
  };
}

/**
 * Ghi bản SERVER (có `myOptionIds` chuẩn) vào cache: mới hơn hoặc bằng thì thay hẳn; CŨ hơn (một `poll:updated` mới hơn đã tới trước response) thì chỉ lấy `myOptionIds`
 * — không lùi số đếm về bản cũ.
 */
export function mergeServerPoll(current: PollView | undefined, server: PollView): PollView {
  if (!current || server.version >= current.version) return server;
  return { ...current, myOptionIds: server.myOptionIds };
}

/** Vá khảo sát của tin `messageId` trong cache trang tin nhắn; tin không có trong cache / không phải khảo sát → giữ nguyên. */
export function patchPollInMessages(
  data: MessagesData | undefined,
  messageId: string,
  patch: (poll: PollView) => PollView,
): MessagesData | undefined {
  if (!data) return data;
  return patchMessageById(data, messageId, (m) => (m.poll ? { ...m, poll: patch(m.poll) } : m));
}

/** Khảo sát của tin `messageId` đang có trong cache (đọc để tính lạc quan/rollback). */
export function findPoll(data: MessagesData | undefined, messageId: string): PollView | undefined {
  if (!data) return undefined;
  for (const page of data.pages) {
    const found = page.data.find((m) => m.id === messageId);
    if (found) return found.poll;
  }
  return undefined;
}
