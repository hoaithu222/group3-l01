import type { ConversationStatusValue } from '../types/workspace-conversations.types';

/** admin.md p1-05 §2.1 — nhãn cột "Loại", tính từ `isMeetingGroup` (KHÔNG phải field enum riêng phía BE). */
export const CONVERSATION_TYPE_LABELS = {
  meeting: 'Nhóm cuộc họp',
  regular: 'Nhóm thường',
} as const;

/** `statusBadge('conversation', status)` dùng nhãn ở `status.utils.ts` — danh sách filter dropdown giữ riêng ở đây cùng quy ước `workspace-channels.constants.ts`. */
export const CONVERSATION_STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: ConversationStatusValue;
  label: string;
}> = [
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
  { value: 'DISSOLVED', label: 'Đã giải tán' },
];
