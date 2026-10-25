/**
 * Lịch nhắc nợ hằng tuần "m h * * d" theo múi giờ ví — hàm thuần, không phụ thuộc BullMQ.
 * Dùng bởi cron tick `wallet.remind-tick` để tìm lần bắn gần nhất (không cần scheduler theo từng ví).
 */

const WEEKDAY_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const CRON_RE = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* ([0-6])$/;

export interface WeeklyCron {
  minute: number;
  hour: number;
  weekday: number;
}

export function parseWeeklyCron(cron: string): WeeklyCron | null {
  const m = CRON_RE.exec(cron.trim());
  return m ? { minute: Number(m[1]), hour: Number(m[2]), weekday: Number(m[3]) } : null;
}

/** Độ lệch (local − UTC, ms) của múi giờ `tz` tại thời điểm `at`. */
function tzOffsetMs(tz: string, at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}

function localParts(at: Date, tz: string): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day") };
}

/** Đổi (ngày, giờ, phút) địa phương của `tz` sang instant UTC (tinh chỉnh 2 lần để đúng quanh mốc đổi giờ). */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const first = asUtc - tzOffsetMs(tz, new Date(asUtc));
  return new Date(asUtc - tzOffsetMs(tz, new Date(first)));
}

/**
 * Lần bắn gần nhất ≤ `now` của lịch, hoặc `null` nếu cron không hợp lệ. Tìm ngược tối đa 7 ngày
 * (đủ một tuần) — cron chỉ có 1 thứ trong tuần nên luôn có đúng 1 ứng viên.
 */
export function lastFireAt(cron: string, tz: string, now: Date): Date | null {
  const parsed = parseWeeklyCron(cron);
  if (!parsed) return null;
  for (let back = 0; back <= 7; back += 1) {
    const day = localParts(new Date(now.getTime() - back * 86_400_000), tz);
    if (new Date(Date.UTC(day.y, day.mo - 1, day.d)).getUTCDay() !== parsed.weekday) continue;
    const fire = zonedToUtc(day.y, day.mo, day.d, parsed.hour, parsed.minute, tz);
    if (fire.getTime() <= now.getTime()) return fire;
  }
  return null;
}

/** "Thứ Sáu 09:00 Asia/Ho_Chi_Minh" — chuỗi mô tả cho admin/app, không phải dữ liệu nhạy cảm. */
export function describeWeeklyCron(cron: string, tz: string): string {
  const parsed = parseWeeklyCron(cron);
  if (!parsed) return `${cron} ${tz}`;
  const hh = String(parsed.hour).padStart(2, "0");
  const mm = String(parsed.minute).padStart(2, "0");
  return `${WEEKDAY_VI[parsed.weekday]} ${hh}:${mm} ${tz}`;
}
