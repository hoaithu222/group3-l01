import { getThreadHook, type ThreadSummaryRef } from "../../../core/permission";
import { logger } from "../../../infrastructure/logger";
import type { Message } from "../entities/message.interface";

/**
 * p1-06 be.md §4 — nạp tóm tắt thread (`replyCount`/`lastReplyAt`/
 * `lastReplierIds`/`lastReplySeq`) cho các TIN GỐC trong 1 trang, bằng ĐÚNG 1
 * lần gọi `IThreadHook.summaries()` (batch `parentMessageId in ids`, không N+1).
 *
 * Chỉ tin gốc ở KÊNH mới có thread (`threadId=null`, `scopeType=CHANNEL`,
 * `kind=USER` — README p1-06 §2 "Thread ở đâu"); tin thu hồi vẫn được tra (MSG-35).
 * Trả `undefined` (không ghép) khi: hook chưa đăng ký (vd test cũ không boot
 * `router.ts`), trang không có tin gốc nào hợp lệ, hoặc truy vấn lỗi — tóm
 * tắt chỉ là phần trang trí, không được làm hỏng cả trang tin nhắn.
 */
export async function loadThreadSummaries(
  messages: readonly Message[]
): Promise<ReadonlyMap<string, ThreadSummaryRef> | undefined> {
  const hook = getThreadHook();
  if (!hook) return undefined;

  const rootIds = messages
    .filter((m) => m.scopeType === "CHANNEL" && m.threadId === null && m.kind !== "SYSTEM")
    .map((m) => m.id);
  if (rootIds.length === 0) return undefined;

  try {
    return await hook.summaries(rootIds);
  } catch (err) {
    logger.warn("[messages] Không nạp được tóm tắt thread, bỏ qua ghép vào MessageView", {
      count: rootIds.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
