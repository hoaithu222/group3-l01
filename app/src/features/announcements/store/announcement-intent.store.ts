import { create } from 'zustand';

export interface AnnouncementTarget {
  channelId: string;
  messageId: string;
}

export type AnnouncementIntent =
  ({ kind: 'request' } & AnnouncementTarget) | ({ kind: 'cancel' } & AnnouncementTarget);

interface AnnouncementIntentState {
  intent: AnnouncementIntent | null;
  /** Tăng mỗi lần MỞ tấm "Yêu cầu" — làm `key` để tấm dựng lại với mốc hạn mặc định (không tăng khi đóng: giữ hoạt ảnh đóng). */
  session: number;
  requestConfirm: (target: AnnouncementTarget) => void;
  requestCancel: (target: AnnouncementTarget) => void;
  clear: () => void;
}

/**
 * "Ý định" mở tấm Yêu cầu / hộp thoại Huỷ. Dòng menu tin nằm trong `MessageActionSheet` (tự dỡ khi đóng — tấm/hộp thoại
 * mở từ đó sẽ chết theo), nên menu chỉ GHI ý định vào store và `AnnouncementHost` (sống suốt phòng chat) dựng UI thật —
 * cùng mẫu `moderation-intent.store` của Báo cáo. Không lưu bền; đích của ý định là tin của người trước nên đăng xuất thì
 * `clear()` (bước `announcements` của `wipeUserData`, `shell/session`).
 */
export const useAnnouncementIntentStore = create<AnnouncementIntentState>((set) => ({
  intent: null,
  session: 0,
  requestConfirm: (target) =>
    set((state) => ({ intent: { kind: 'request', ...target }, session: state.session + 1 })),
  requestCancel: (target) => set({ intent: { kind: 'cancel', ...target } }),
  clear: () => set({ intent: null }),
}));
