/** Thông điệp cố định khi một phần của health quá `healthTimeoutMs` — hiện nguyên văn cho admin (`error: "Hết thời gian chờ"`). */
export const TIMEOUT_MESSAGE = "Hết thời gian chờ";

/**
 * Đặt trần thời gian cho một lời gọi có thể TREO (LiveKit, Redis/BullMQ khi mất kết nối: `queueConnection` không bao giờ tự reject). Quá hạn → ném `Error(TIMEOUT_MESSAGE)`;
 * timer `unref` + huỷ khi lời gọi xong nên không giữ tiến trình.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
