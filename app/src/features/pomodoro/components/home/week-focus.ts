import type { PomodoroHistoryItem, PomodoroHistoryPage } from '../../api/pomodoro.types';

/**
 * Dựng "giờ tập trung tuần này" từ lịch sử phiên (`GET /me/pomodoro/history`) cho widget Trang chủ.
 *
 * ── ⚠️ Vì sao ngày địa phương, vì sao `joinedAt` ───────────────────────────────────────────────────────────
 * Cột "hôm nay" phải là ngày trên ĐỒNG HỒ NGƯỜI DÙNG: `joinedAt` là ISO UTC, học lúc 06:00 sáng giờ Việt Nam là 23:00 UTC
 * hôm trước — gom theo 10 ký tự đầu sẽ đẩy buổi học sáng sớm sang hôm qua. Nên đọc `getFullYear/getMonth/getDate` (giờ
 * máy), và lùi ngày bằng `new Date(y, m, d - n)` (không trừ mili-giây: ngày chuyển giờ dài 23/25 giờ). Một lượt được tính
 * vào ngày VÀO phòng (`joinedAt`) — phiên xuyên nửa đêm không bị chẻ đôi; lịch sử vốn cũng sắp theo `joinedAt`.
 * (`features/gamification` có hàm cùng ý cho XP; hai feature không import nhau nên viết lại phần nhỏ này.)
 */

export const WEEK_DAYS = 7;

/** Chỉ số theo `Date.getDay()` (0 = Chủ nhật). */
const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export type FocusItem = Pick<PomodoroHistoryItem, 'cyclesAttended' | 'joinedAt' | 'presentSeconds'>;

export interface FocusDay {
  /** `dd/MM` — nhãn trợ năng. */
  dateLabel: string;
  /** `YYYY-MM-DD` giờ địa phương. */
  key: string;
  isToday: boolean;
  /** Tổng giây CÓ MẶT trong ngày. */
  seconds: number;
  /** `T2` … `T7`, `CN`. */
  weekday: string;
}

export interface WeekFocus {
  /** Tổng số vòng tập trung đã tham dự. */
  cycles: number;
  /** 7 ngày, cũ → mới (hôm nay ở cuối), luôn đủ phần tử. */
  days: FocusDay[];
  /** Số lượt phiên (mỗi lần vào một phiên là một lượt). */
  sessions: number;
  totalSeconds: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 00:00 địa phương của ngày đầu cửa sổ (`days - 1` ngày trước hôm nay). */
export function weekWindowStart(now: Date, days: number = WEEK_DAYS): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/**
 * Gom các lượt phiên trong 7 ngày gần nhất. Lượt ngoài cửa sổ hoặc có `joinedAt` hỏng bị bỏ qua; ngày không có lượt nào
 * vẫn có mặt với `seconds = 0` (mini-thanh cần cột rỗng chứ không phải thiếu cột).
 */
export function weekFocus(
  items: readonly FocusItem[],
  now: Date = new Date(),
  days: number = WEEK_DAYS,
): WeekFocus {
  const start = weekWindowStart(now, days).getTime();
  const secondsByDay = new Map<string, number>();
  let cycles = 0;
  let sessions = 0;
  let totalSeconds = 0;

  for (const item of items) {
    const joined = new Date(item.joinedAt);
    if (Number.isNaN(joined.getTime()) || joined.getTime() < start) continue;
    const seconds = Math.max(0, item.presentSeconds);
    const key = dayKey(joined);
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + seconds);
    totalSeconds += seconds;
    cycles += Math.max(0, item.cyclesAttended);
    sessions += 1;
  }

  const todayKey = dayKey(now);
  return {
    cycles,
    days: Array.from({ length: days }, (_unused, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - index));
      const key = dayKey(date);
      return {
        dateLabel: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
        isToday: key === todayKey,
        key,
        seconds: secondsByDay.get(key) ?? 0,
        weekday: WEEKDAY_LABELS[date.getDay()] ?? '',
      };
    }),
    sessions,
    totalSeconds,
  };
}

/**
 * Tải các trang lịch sử (mới → cũ, cursor) cho tới khi gặp lượt cũ hơn `since`, hết dữ liệu, hoặc hết `maxPages`.
 * `fetchPage` được truyền vào nên test không cần mạng. Lượt có `joinedAt` hỏng KHÔNG được coi là "đã cũ" (một dòng hỏng
 * không được làm ta dừng sớm).
 */
export async function collectHistorySince(
  fetchPage: (cursor: string | undefined) => Promise<PomodoroHistoryPage>,
  since: Date,
  maxPages: number,
): Promise<PomodoroHistoryItem[]> {
  const items: PomodoroHistoryItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    let reachedOlder = false;
    for (const item of result.items) {
      const at = Date.parse(item.joinedAt);
      if (Number.isNaN(at)) continue;
      if (at >= since.getTime()) items.push(item);
      else reachedOlder = true;
    }
    const next = result.meta.nextCursor;
    if (reachedOlder || !result.meta.hasMore || !next) break;
    cursor = next;
  }
  return items;
}
