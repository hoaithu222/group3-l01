/**
 * Nơi LẮP RÁP p7-04 (khảo sát, hẹn giờ gửi, nhắc lại tin, tạo task từ tin): đăng ký `chat-extensions` vào các khe của `chat` (`@/shared/message-extensions`) + hai hàng lối vào ở màn Tôi
 * (`@/shared/profile`) — `chat`/`me` KHÔNG import feature này. Chỉ có tác dụng phụ (đăng ký; đăng ký lặp cùng khoá là ghi đè nên an toàn với Fast Refresh).
 *
 * Import ở `app/_layout.tsx` (module scope, TRƯỚC khi danh sách tin vẽ lần đầu), KHÔNG ở `app/(app)/_layout.tsx` như `register-meeting-cards`/`register-mentor-cards`: layout đó đã chạm trần
 * 200 dòng của `check:file-size`, và `tests/shell/*-assembly.test.tsx` khoá hai dòng import ĐÓ nguyên văn nên cũng không gộp được vào một cửa chung.
 */
import '@/features/chat-extensions/register';
import '@/features/chat-extensions/register-profile';
