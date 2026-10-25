import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

const savePath = (messageId: string) => `/messages/${messageId}/save`;

export interface SaveResult {
  messageId: string;
  savedAt: string;
}

/**
 * Lưu/bỏ lưu MỘT tin (p1-09 be.md §5.1) — hai lời gọi này dùng chung cho menu tin của `chat` và trang "Đã lưu" của
 * `discovery`, nên nằm ở `shared/` (không feature nào import feature nào — `feature-structure.md`).
 *
 * Lỗi KHÔNG tự toast ở đây: interceptor đã toast đúng một lần bằng câu tiếng Việt theo mã (`MSG_006` thu hồi,
 * `RES_001` không đọc được, `SRCH_004` đủ 1.000 tin, `RATE_002` quá nhanh).
 */
export const savedMessagesService = {
  /** Idempotent — lưu lại tin ĐÃ lưu vẫn 200. Không có body; BE không báo cho tác giả. */
  async save(messageId: string): Promise<SaveResult> {
    const response = await apiClient.post<SaveResult>(savePath(messageId));
    return unwrapData<SaveResult>(response);
  },

  /** Idempotent, 200 `data: null` — bỏ lưu được cả tin đã mất quyền đọc. */
  async unsave(messageId: string): Promise<void> {
    await apiClient.delete(savePath(messageId));
  },
};
