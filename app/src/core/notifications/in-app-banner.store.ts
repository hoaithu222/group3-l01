import { create } from 'zustand';

import type { PushPayload } from './push-payload.types';

/** Một banner trong ứng dụng (p1-07 `app.md` §3 `InAppMessageBanner`). `title`/`body` lấy nguyên từ thông báo BE đã soạn theo `lockScreenPreview`. */
export interface InAppBanner {
  body: string | null;
  id: string;
  payload: PushPayload;
  title: string;
}

interface InAppBannerState {
  banner: InAppBanner | null;
  /** Bỏ banner (theo `id` nếu truyền — banner mới đã thay thì lệnh ẩn của banner cũ không được xoá nhầm). */
  dismiss: (id?: string) => void;
  show: (banner: InAppBanner) => void;
}

/**
 * Banner tin nhắn khi app ĐANG MỞ mà tin thuộc cuộc trò chuyện KHÁC màn đang xem. Chỉ giữ MỘT banner: tin mới thay tin cũ
 * (nhiều tin liền nhau không xếp chồng che màn hình). Không lưu bền, xoá khi đăng xuất (`useLogout` dọn store cùng cây).
 */
export const useInAppBannerStore = create<InAppBannerState>((set) => ({
  banner: null,
  dismiss: (id) =>
    set((state) => (id === undefined || state.banner?.id === id ? { banner: null } : state)),
  show: (banner) => set({ banner }),
}));
