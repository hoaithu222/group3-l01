import { isAxiosError } from 'axios';

/**
 * Bầu phiếu ở nhóm đông: hai người tranh nhau ghi số đếm của MỘT khảo sát, BE thử lại vài lượt rồi báo bận `503 SYS_503` (retryable — `poll.service.ts`
 * `VOTE_ATTEMPTS`). Đó là tín hiệu "thử lại sau ít giây sẽ được" chứ không phải lỗi thật, nên app thử lại vài lần có JITTER (mỗi máy chờ một khoảng khác nhau,
 * không đồng loạt đập lại đúng nhịp — "đàn kéo") rồi mới báo lỗi. Thử lại là an toàn: `PUT`/`DELETE` vote thay TOÀN BỘ lựa chọn của mình nên lặp lại không đổi kết quả.
 */
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isBusyError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 503;
}

export async function retryWhenBusy<T>(
  run: () => Promise<T>,
  sleep: Sleep = realSleep,
  attempts: number = MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isBusyError(error) || attempt >= attempts) throw error;
      // Chờ tăng dần + ngẫu nhiên: lượt 1 ~150–300ms, lượt 2 ~300–450ms.
      await sleep(BASE_DELAY_MS * attempt + Math.floor(Math.random() * BASE_DELAY_MS));
    }
  }
}
