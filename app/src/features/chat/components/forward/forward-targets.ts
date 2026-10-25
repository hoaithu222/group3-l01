import type { ForwardOption, ForwardPersonOption, ForwardTarget } from '../../api/chat.types';

export function isPersonOption(option: ForwardOption): option is ForwardPersonOption {
  return 'userId' in option;
}

/** Khoá ổn định của một đích — chọn/bỏ chọn, `key` của hàng, và ghép kết quả trả về theo đích. */
export function targetKey(target: ForwardTarget | ForwardOption): string {
  if ('directUserId' in target) return `user:${target.directUserId}`;
  if ('userId' in target) return `user:${target.userId}`;
  return `${target.scopeType}:${target.scopeId}`;
}

/**
 * Đích chọn được → phần tử `targets[]` của `POST /messages/:id/forward` (BE `forwardTargetSchema`:
 * `{ scopeType, scopeId }` HOẶC `{ directUserId }`). Đích NGƯỜI gửi `directUserId` chứ không phải
 * `conversationId`: BE tự tìm/tạo hội thoại DIRECT (`getOrCreateDirect`), client không cần biết nó đã có chưa.
 */
export function toForwardTarget(option: ForwardOption): ForwardTarget {
  return isPersonOption(option)
    ? { directUserId: option.userId }
    : { scopeType: option.scopeType, scopeId: option.scopeId };
}

/** Nhãn hiển thị của đích trong danh sách kết quả — không tìm thấy trong danh sách đã chọn thì để chuỗi trung tính, KHÔNG in id. */
export function labelOfTarget(options: ForwardOption[], target: ForwardTarget): string {
  const key = targetKey(target);
  return options.find((option) => targetKey(option) === key)?.label ?? 'Đích chuyển tiếp';
}
