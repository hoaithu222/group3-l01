import type { ReactNode } from 'react';

/**
 * ĐIỂM NỐI nút gọi vào header hội thoại/kênh mà KHÔNG để `conversations`/`channels` import feature `calls`
 * (README p2-01 app.md §2: "header nhận CallButtons qua slot"). Cùng mẫu `registerSystemMessageRenderer` của `chat`:
 * `calls` đăng ký MỘT renderer ở nơi lắp ráp (`app/(app)/_layout.tsx`), header chỉ vẽ `<CallActionsSlot />`.
 *
 * Renderer là HÀM trả `ReactNode` chứ không phải component: tra một component từ registry ngay lúc render bị
 * `react-hooks/static-components` chặn (mỗi lần vẽ là một kiểu component mới, state con bị reset). Chưa đăng ký
 * (cờ `voice` tắt, test) ⇒ slot không vẽ gì — header giữ nguyên hình dạng cũ.
 */
export interface CallActionsSlotProps {
  /** Lý do KHÔNG gọi được (chỉ đọc/đã chặn…) — nút vẫn hiện nhưng khoá, kèm nhãn nói lý do. `null` = gọi được. */
  disabledReason?: string | null;
  /** Số thành viên — để hỏi xác nhận khi nhóm lớn hơn số người được đổ chuông tối đa. */
  memberCount?: number;
  scopeId: string;
  scopeType: 'CHANNEL' | 'CONVERSATION';
}

export type CallActionsRenderer = (props: CallActionsSlotProps) => ReactNode;

let renderer: CallActionsRenderer | null = null;

export function registerCallActionsRenderer(next: CallActionsRenderer | null): void {
  renderer = next;
}

export function CallActionsSlot(props: CallActionsSlotProps): ReactNode {
  return renderer ? renderer(props) : null;
}

/**
 * Lối vào "Lịch sử cuộc gọi" ở header danh sách hội thoại (README p2-01 app.md §1: mục "Cuộc gọi" là nút trong header
 * danh sách hội thoại, không phải tab). Cùng cơ chế đăng ký; chưa đăng ký/cờ `voice` tắt ⇒ không vẽ.
 */
export type CallHistoryEntryRenderer = () => ReactNode;

let historyEntryRenderer: CallHistoryEntryRenderer | null = null;

export function registerCallHistoryEntryRenderer(next: CallHistoryEntryRenderer | null): void {
  historyEntryRenderer = next;
}

export function CallHistoryEntrySlot(): ReactNode {
  return historyEntryRenderer ? historyEntryRenderer() : null;
}
