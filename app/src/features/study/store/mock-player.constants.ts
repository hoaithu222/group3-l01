/** Mục quá hạn này (24 giờ) bị bỏ lúc nạp — lượt thi dài nhất 3 giờ, bản cũ hơn chắc chắn đã tự nộp. */
export const MOCK_PLAYER_MAX_AGE_MS = 24 * 3_600_000;

/** Khoá AsyncStorage (app.md p4-02 §5). Đổi hình dạng dữ liệu ⇒ tăng `v` trong khoá và `version` của persist. */
export const MOCK_PLAYER_STORAGE_KEY = 'study.mock-player.v1';
