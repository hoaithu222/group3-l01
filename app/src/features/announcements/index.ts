/**
 * Mặt tiền công khai của `announcements` (p5-04): xác nhận đã đọc thông báo kênh.
 *
 * Route trỏ vào `AnnouncementReceiptsScreen`. Phần gắn vào chat KHÔNG đi qua barrel này: `chat`/`channels` không import
 * feature này — nơi lắp ráp import `@/features/announcements/register` (side-effect) để đăng ký vào các khe của
 * `@/shared/message-extensions`.
 */
export { AnnouncementReceiptsScreen } from './screens/AnnouncementReceiptsScreen';
