/**
 * "Ngày địa phương" theo múi giờ IANA — HÀM THUẦN (không I/O), dùng chung cho lịch ôn SR (p4-02, `modules/study`) và ngày streak (p4-03,
 * `modules/gamification`) — đặt ở `core/utils` để hai module không import chéo. `modules/study/services/local-date.ts` re-export file này.
 * Chỉ dùng `Intl` (giống `wallet-schedule.ts`/`preference.resolver.ts`) nên đúng cả khi múi giờ đổi giờ mùa hè.
 *
 * Quy ước: mọi mốc "00:00 ngày địa phương" trả về là INSTANT UTC (`Date`), so sánh trực tiếp với `nextReviewAt` lưu UTC.
 */
export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Múi giờ hợp lệ hoặc mặc định — `User.timezone` có thể rỗng/lạ (dữ liệu cũ) nên KHÔNG để `Intl` ném lỗi ở nơi gọi. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    formatter(tz);
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(at: Date, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(safeTimeZone(tz)).formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** `YYYY-MM-DD` của `at` tại `tz`. */
export function localDate(at: Date, tz: string): string {
  const p = localParts(at, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Giờ (0–23) của `at` tại `tz` — chọn múi giờ có giờ địa phương = giờ nhắc. */
export function localHour(at: Date, tz: string): number {
  return localParts(at, tz).hour;
}

/** Độ lệch múi giờ (ms) tại thời điểm `at`: `local-as-UTC − instant`. */
function offsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instant UTC của 00:00 ngày địa phương `y-m-d` tại `tz` (lặp ≤ 3 lần để hội tụ qua ranh giới đổi giờ). */
function localMidnightUtc(year: number, month: number, day: number, tz: string): Date {
  const base = Date.UTC(year, month - 1, day);
  let guess = base;
  for (let i = 0; i < 3; i += 1) {
    const next = base - offsetMs(new Date(guess), tz);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** 00:00 ngày địa phương CHỨA `at`, cộng `days` ngày lịch (âm được). */
export function startOfLocalDayPlus(at: Date, tz: string, days: number): Date {
  const p = localParts(at, tz);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return localMidnightUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), tz);
}

export function startOfLocalDay(at: Date, tz: string): Date {
  return startOfLocalDayPlus(at, tz, 0);
}

export function startOfNextLocalDay(at: Date, tz: string): Date {
  return startOfLocalDayPlus(at, tz, 1);
}

/** Cộng `days` ngày lịch vào chuỗi `YYYY-MM-DD` (không phụ thuộc múi giờ). */
export function addDaysToLocalDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Số ngày lịch từ `a` tới `b` (`b − a`), cả hai dạng `YYYY-MM-DD`. */
export function diffLocalDates(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Instant UTC của 00:00 ngày địa phương `YYYY-MM-DD` tại `tz` — chiều NGƯỢC của `localDate` (p4-06). Xuất phát từ trưa UTC của ngày đó, đo độ
 * lệch ngày lịch (−1/0/+1 tuỳ múi giờ) rồi dùng `startOfLocalDayPlus` nên đúng cả ở múi giờ +14/−12 và khi đổi giờ mùa hè.
 */
export function startOfLocalDateKey(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  return startOfLocalDayPlus(noon, tz, diffLocalDates(localDate(noon, tz), dayKey));
}

/** Khoảng `[from, to)` UTC của ngày địa phương `dayKey` — `to` là 00:00 ngày kế tiếp (ngày 23/25 giờ khi đổi giờ vẫn đúng). */
export function localDayRangeUtc(dayKey: string, tz: string): { from: Date; to: Date } {
  return { from: startOfLocalDateKey(dayKey, tz), to: startOfLocalDateKey(addDaysToLocalDate(dayKey, 1), tz) };
}
