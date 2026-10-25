import type { BottomTabNavigatorProps } from 'expo-router/js-tabs';

import { HOME_MODULE } from './home-module';

/**
 * Lịch sử tab cho nút Back — đi cùng `backBehavior="history"` ở `app/(app)/_layout.tsx`.
 *
 * ── Vì sao `history` chứ không phải `firstRoute` (mặc định) ───────────────────────────────────────────
 * `firstRoute` luôn lùi về tab ĐẦU TIÊN (Trang chủ): đi Trang chủ → Nhóm → Tin nhắn rồi bấm Back là nhảy
 * thẳng về Trang chủ, bỏ qua Nhóm — đúng triệu chứng "back không về trang vừa truy cập". `history` lùi về tab
 * VỪA XEM TRƯỚC ĐÓ (đã đo bằng chính `TabRouter` của expo-router: Trang chủ → Nhóm → Tin nhắn → Back = Nhóm →
 * Trang chủ → thoát app).
 *
 * ── Chỗ `history` làm tụt so với `firstRoute`, và cách vá ─────────────────────────────────────────────
 * Mở NGUỘI app thẳng vào một tab khác Trang chủ (bấm thông báo, mở link): lịch sử chỉ có đúng tab đó, nên Back
 * không đi đâu cả — nút "Quay lại" trên `AppBar` bấm không có tác dụng và Android thoát app. Trước đây
 * `firstRoute` đưa người dùng về Trang chủ trong ca này. Hàm dưới đây đặt Trang chủ vào ĐÁY lịch sử đúng một
 * lần, lúc navigator dựng lại trạng thái từ đường dẫn: Back từ tab đó → Trang chủ → thoát.
 *
 * ⚠️ `UNSTABLE_router` là API React Navigation đánh dấu chưa ổn định; phiên bản được ghim theo `expo-router`
 * (SDK 57). Nếu nâng SDK mà TypeScript báo lỗi chỗ này thì chỉ cần xem lại chữ ký `getRehydratedState` của
 * `TabRouter` — logic không phụ thuộc thứ gì khác.
 */
export const seedHomeInTabHistory: NonNullable<BottomTabNavigatorProps['UNSTABLE_router']> = (
  original,
) => ({
  getRehydratedState(partialState, options) {
    const state = original.getRehydratedState(partialState, options);
    const home = state.routes.find((route) => route.name === HOME_MODULE.name);
    const focused = state.routes[state.index];
    if (!home || !focused || focused.key === home.key) return state;

    // Chỉ gieo khi lịch sử còn đúng một mục = tab đang mở (mở nguội). Đã có lịch sử thật thì giữ nguyên.
    const { history } = state;
    if (history.length !== 1 || history[0]?.key !== focused.key) return state;

    return { ...state, history: [{ type: 'route', key: home.key }, ...history] };
  },
});
