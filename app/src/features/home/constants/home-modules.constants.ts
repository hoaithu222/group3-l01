/**
 * Số ô TỐI ĐA của lưới phân hệ (tầng 2) trên Trang chủ: hai dòng bốn ô. Cộng 2 thẻ hero = 10 phân hệ hiện thẳng trên
 * màn; nhiều hơn thì phần dư nằm ở tấm chọn phân hệ ("Tất cả (N)") — không cuộn ngang, không lưới nở mãi.
 */
export const HOME_GRID_MAX_TILES = 8;

/**
 * Tên hành động trợ năng thay cho nhấn giữ (ghim/bỏ ghim). Nhấn giữ là cử chỉ ẨN nên phải có đường thay thế cho
 * trình đọc màn hình; đặt tên riêng (không dùng `longpress`) để không trùng hành động có sẵn của hệ điều hành.
 */
export const PIN_ACTION = 'togglePin';
