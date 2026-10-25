import { getSavedMessageReader } from "../../../shared/ports/saved-message-reader.port";
import { logger } from "../../../infrastructure/logger";
import type { Message } from "../entities/message.interface";

/**
 * p1-04/p1-09 — nạp tập id tin NGƯỜI XEM đã lưu cho 1 trang tin bằng ĐÚNG 1 lần `SavedMessageReader.savedIdsOf()` (index `(userId, messageId)`,
 * không N+1) để `toView()` ghép `MessageView.isSaved`. Chỉ tra tin người dùng còn nguyên (`kind=USER`, chưa thu hồi) — tin hệ thống/tombstone
 * không lưu được (be.md p1-09 §5.1) nên `isSaved` luôn `false`, khỏi tốn id trong truy vấn.
 *
 * Trả `undefined` (KHÔNG ghép `isSaved`) khi: cổng chưa đăng ký (worker/test không nạp `discovery`) hoặc truy vấn lỗi — cờ chỉ là phần trang trí
 * của menu tin, không được làm hỏng cả trang; client coi "vắng mặt" = chưa biết (tự theo dõi qua `saved:updated`). Trang rỗng → `undefined`.
 */
export async function loadSavedFlags(userId: string, messages: readonly Message[]): Promise<ReadonlySet<string> | undefined> {
  const reader = getSavedMessageReader();
  if (!reader || messages.length === 0) return undefined;

  const ids = messages.filter((m) => m.kind === "USER" && m.deletedAt === null).map((m) => m.id);
  if (ids.length === 0) return new Set();

  try {
    return await reader.savedIdsOf(userId, ids);
  } catch (err) {
    logger.warn("[messages] Không nạp được cờ tin đã lưu, bỏ qua ghép isSaved vào MessageView", {
      count: ids.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
