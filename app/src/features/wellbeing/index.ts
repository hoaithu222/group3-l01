/**
 * Feature theo dõi sức khoẻ học tập / burnout radar (p7-03). P0: giải thích + bật, màn Sức khoẻ 7/30 ngày, cài đặt, cảnh báo mềm, tắt & xoá dữ liệu.
 * P1: nghỉ 1 phút toàn màn (`TakeABreakScreen`/`BreathingAnimation`), chia sẻ mức với trưởng nhóm (`ShareWithWorkspaceList`), giờ làm/nghỉ mong muốn
 * (`PreferredBreakCard`); chấm cam ở màn thành viên nằm ở `features/members` (gọi thẳng `GET /workspaces/:id/wellbeing/indicators`, không import
 * feature này — xem `shared/wellbeing/AttentionDot`). OPT-IN, riêng tư: chỉ chính người dùng thấy dữ liệu của mình.
 * Route mỏng ở `app/(app)/me/wellbeing/*` (có `_layout.tsx`: hàng rào cờ `burnout`; `break` mở dạng modal). KHÔNG lưu gì xuống đĩa (không AsyncStorage/store) — mọi thứ ở cache React Query trong bộ nhớ, `wipeUserData` đã dọn khi đăng xuất.
 * Nơi lắp ráp: `app/(app)/me/_layout.tsx` import `register-profile.tsx` (hàng "Sức khoẻ học tập" ở màn Tôi); `app/(app)/_layout.tsx` mount `WellbeingAlertHost` MỘT lần (thẻ cảnh báo mềm ở mọi màn).
 * Chưa làm: `TakeABreakButton` dùng trong Pomodoro (Pomodoro không có màn độc lập ngoài kênh — xem `SuggestionList`), nhạc nền cục bộ (`expo-audio`, chưa có asset).
 */
export { WellbeingAlertHost } from './components/WellbeingAlertHost';
export { WellbeingRouteGate } from './screens/WellbeingRouteGate';
export { WellbeingDashboardScreen } from './screens/WellbeingDashboardScreen';
export { WellbeingOnboardingScreen } from './screens/WellbeingOnboardingScreen';
export { WellbeingSettingsScreen } from './screens/WellbeingSettingsScreen';
export { TakeABreakScreen } from './screens/TakeABreakScreen';
