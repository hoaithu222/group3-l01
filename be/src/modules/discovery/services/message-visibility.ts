/**
 * Tin có bị ẩn với NGƯỜI XEM không (D-23 + "xoá phía tôi"):
 *  - `MessageHide` của chính họ, hoặc
 *  - hội thoại: `seq <= hiddenBeforeSeq` (mốc `ConversationMember.hiddenBeforeSeq`).
 * `hiddenBeforeSeq` chỉ áp cho dãy `seq` của tin GỐC (`threadId === null`) — reply thread
 * có dãy `seq` riêng theo `threadKey` nên KHÔNG so với mốc này (kênh luôn có mốc 0).
 */
export function isHiddenForViewer(
  message: { id: string; threadId: string | null; seq: number },
  hiddenBeforeSeq: number,
  hiddenMessageIds: ReadonlySet<string>
): boolean {
  if (hiddenMessageIds.has(message.id)) return true;
  return message.threadId === null && hiddenBeforeSeq > 0 && message.seq <= hiddenBeforeSeq;
}
