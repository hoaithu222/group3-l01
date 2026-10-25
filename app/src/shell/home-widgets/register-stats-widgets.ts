/**
 * Đăng ký các widget THỐNG KÊ của Trang chủ vào khe `@/shared/home-widgets` (side-effect; `features/home` không import feature nguồn):
 * ôn tập hôm nay (`study`, order 5 — việc CẦN LÀM nên đứng đầu dải), chuỗi chăm chỉ + hoạt động 7 ngày + cấp độ/thành tích (`gamification`,
 * 10–20), số dư xu (`coins`, 25), giờ tập trung (`pomodoro`, 30). Mỗi widget TỰ kiểm cờ phân hệ và tự ẩn khi cờ tắt / lỗi / không có dữ liệu.
 *
 * Import ở `app/(app)/_layout.tsx` (module scope, trước lần vẽ đầu của Trang chủ — đăng ký trong effect thì lần vẽ đầu vẫn thiếu widget).
 * Tách thành file này (cùng khuôn `shell/chat/register-*-cards.tsx`) vì `_layout.tsx` đã ở đúng trần 200 dòng: ba dòng import
 * trực tiếp sẽ làm `check:file-size` đỏ. Thêm widget của feature khác thì thêm MỘT dòng ở đây, không đụng layout.
 */
import '@/features/coins/register-home-widgets';
import '@/features/gamification/register-home-widgets';
import '@/features/pomodoro/register-home-widgets';
import '@/features/study/register-home-widgets';
