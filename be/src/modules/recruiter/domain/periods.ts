import { DEFAULT_TIME_ZONE, localDate } from "../../../core/utils/local-date";

/**
 * "Tháng"/"ngày" nghiệp vụ của recruiter theo múi giờ Asia/Ho_Chi_Minh (D-08) — HÀM THUẦN. Hạn mức lời mời tính theo THÁNG địa phương nên
 * 23:59 ngày cuối tháng và 00:01 ngày đầu tháng sau (giờ Việt Nam) rơi vào hai kỳ khác nhau dù cùng ngày theo UTC.
 */
export const RECRUITER_TIME_ZONE = DEFAULT_TIME_ZONE;

/** `"YYYY-MM"` của `at` tại `tz` — khoá `CompanyOfferUsage.period`. */
export function periodKeyOf(at: Date, tz: string = RECRUITER_TIME_ZONE): string {
  return localDate(at, tz).slice(0, 7);
}

/** `"YYYY-MM-DD"` của `at` tại `tz` — khoá `TalentProfileView.dayKey`. */
export function dayKeyOf(at: Date, tz: string = RECRUITER_TIME_ZONE): string {
  return localDate(at, tz);
}

/** `n` kỳ tháng gần nhất kết thúc ở `at` (mới → cũ), vd `["2026-09", "2026-08", …]`. */
export function recentPeriods(at: Date, n: number, tz: string = RECRUITER_TIME_ZONE): string[] {
  const [y, m] = periodKeyOf(at, tz).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Số lượt còn lại (không âm) của hạn mức. */
export const remainingQuota = (quota: number, used: number): number => Math.max(0, quota - used);
