import { create } from 'zustand';

import type { ComposerDraftSnapshot } from '@/shared/message-extensions';

export interface VotersTarget {
  pollId: string;
  question: string;
  /** Ảnh chụp lựa chọn lúc mở (chip đổi lựa chọn) — số phiếu trên chip không cập nhật realtime, danh sách người thì có (`usePollSocket`). */
  options: { id: string; text: string }[];
  optionId: string;
}

export interface TaskSource {
  messageId: string;
  /** Nội dung thô (còn marker nhắc tên) — tiêu đề mặc định lấy 80 ký tự đầu của bản chữ thuần. */
  content: string | null;
  /** Nhóm của phòng chat (kênh); `undefined` ở hội thoại ⇒ tấm cho chọn nhóm. */
  workspaceId?: string;
}

export interface ResourceSource {
  messageId: string;
  /** Tệp đính kèm của tin (chỉ `assetId` + tên) — người dùng chọn tệp nào lưu; BE chỉ nhận `assetId` thuộc chính tin này. */
  attachments: { assetId: string; name: string }[];
  /** Nhóm của phòng chat (kênh) — BE chỉ nhận đúng nhóm đó (`WORKSPACE_MISMATCH`); `undefined` ở hội thoại ⇒ tấm cho chọn nhóm. */
  workspaceId?: string;
}

/** Ý định mở một tấm của `chat-extensions` — chi tiết từng loại ở `ChatExtHost`. */
export type ChatExtIntent =
  | { kind: 'poll' }
  | { kind: 'schedule'; draft: ComposerDraftSnapshot }
  | { kind: 'remind'; messageId: string }
  | ({ kind: 'task' } & TaskSource)
  | ({ kind: 'resource' } & ResourceSource)
  | ({ kind: 'voters' } & VotersTarget);

export type OpenIntent = ChatExtIntent & {
  /** `scopeKeyOf(scopeType, scopeId, threadId)` của phòng chat MỞ ra ý định — chỉ host của đúng phòng đó dựng tấm (hai phòng cùng mở, vd khung chat phòng họp). */
  scopeKey: string;
};

interface ChatExtIntentState {
  /** Ý định GẦN NHẤT — giữ lại sau khi đóng để tấm vẫn còn nội dung trong lúc trượt xuống (như `AnnouncementHost`); `visible` mới quyết định có hiện hay không. */
  intent: OpenIntent | null;
  visible: boolean;
  /** Tăng mỗi lần MỞ — làm `key` để tấm dựng lại với trạng thái mới (không tăng khi đóng: giữ hoạt ảnh đóng). */
  session: number;
  open: (scopeKey: string, intent: ChatExtIntent) => void;
  /** Đóng tấm (giữ `intent` cho hoạt ảnh đóng). */
  close: () => void;
  /** Quên hẳn — rời phòng / đăng xuất. */
  reset: () => void;
}

/**
 * "Ý định" mở tấm Khảo sát / Hẹn giờ / Nhắc lại / Tạo task / Lưu vào tài liệu / Người bầu. Các dòng menu nằm trong tấm khác (`AttachMenuSheet`, `MessageActionSheet` — tự dỡ khi đóng, tấm mở từ đó chết
 * theo) nên chỉ GHI ý định vào đây; `ChatExtHost` (sống suốt phòng chat) dựng UI thật — cùng mẫu `announcement-intent.store`. Không lưu bền; giữ NHÁP đang soạn (`schedule.draft`)
 * và tin đích của người trước ⇒ đăng xuất phải `reset()` (bước `chatExtensions` của `wipeUserData`, `shell/session`).
 */
export const useChatExtIntentStore = create<ChatExtIntentState>((set) => ({
  intent: null,
  visible: false,
  session: 0,
  open: (scopeKey, intent) =>
    set((state) => ({ intent: { ...intent, scopeKey }, visible: true, session: state.session + 1 })),
  close: () => set({ visible: false }),
  reset: () => set({ intent: null, visible: false }),
}));
