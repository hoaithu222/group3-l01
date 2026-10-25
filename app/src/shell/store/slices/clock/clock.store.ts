import { create } from 'zustand';

interface ClockState {
  /** `serverNow − Date.now()` lúc nhận bản capabilities gần nhất; `null` = chưa biết (coi như 0). */
  offsetMs: number | null;
  setFromServerNow: (serverNowIso: string) => void;
}

/**
 * Lệch đồng hồ giữa máy và máy chủ (p0-07 `app.md` §4 "Lệch đồng hồ"). Cập nhật mỗi lần `GET /capabilities` trả 200 (có
 * `serverNow`); dùng lại ở p2-* (đếm ngược cuộc gọi/họp) — đồng hồ máy người dùng có thể lệch hàng phút.
 *
 * Không lưu bền, không theo người dùng (không có gì cần xoá khi đăng xuất): là số đo máy ↔ máy chủ.
 */
export const useClockOffsetStore = create<ClockState>((set) => ({
  offsetMs: null,
  setFromServerNow: (serverNowIso) => {
    const serverMs = Date.parse(serverNowIso);
    if (Number.isNaN(serverMs)) return;
    set({ offsetMs: serverMs - Date.now() });
  },
}));

/** Giờ máy chủ hiện tại (ms) theo đồng hồ đã hiệu chỉnh; chưa biết độ lệch thì dùng đồng hồ máy. */
export function serverNowMs(): number {
  return Date.now() + (useClockOffsetStore.getState().offsetMs ?? 0);
}
