import { addDaysToLocalDate } from "../../../core/utils/local-date";

/**
 * Chuỗi ngày THUẦN (p4-03 README §2, GM-04). "Ngày" là ngày ĐỊA PHƯƠNG tại thời điểm hành động XẢY RA (`completedAt`/`reviewedAt`/
 * `submittedAt`), không phải lúc consumer chạy. Chỉ ngày LỚN HƠN `lastActiveDate` mới đổi chuỗi: liền kề → +1, cách ngày → về 1, cùng
 * ngày → giữ, ngày nhỏ hơn (vd đổi múi giờ / sự kiện trễ) → BỎ QUA — không tạo "ngày ảo".
 */
export interface StreakState {
  streak: number;
  lastActiveDate: string | null;
  longestStreak: number;
}

export function applyActivity(state: StreakState, localDate: string): StreakState {
  const last = state.lastActiveDate;
  if (last !== null && localDate <= last) return state;
  const streak = last !== null && localDate === addDaysToLocalDate(last, 1) ? state.streak + 1 : 1;
  return { streak, lastActiveDate: localDate, longestStreak: Math.max(state.longestStreak, streak) };
}

export interface StreakView {
  /** Chuỗi hiển thị: 0 khi đã gãy (quá hôm qua). */
  streak: number;
  /** Có chuỗi nhưng hôm nay chưa hoạt động — còn kịp giữ. */
  atRisk: boolean;
}

/** Chuỗi hiển thị tính LẠI khi đọc (không phụ thuộc job `streak.check` chạy đúng giờ). `today` = ngày địa phương hiện tại. */
export function viewStreak(state: Pick<StreakState, "streak" | "lastActiveDate">, today: string): StreakView {
  const last = state.lastActiveDate;
  if (last === null || state.streak <= 0) return { streak: 0, atRisk: false };
  if (last >= today) return { streak: state.streak, atRisk: false };
  if (last === addDaysToLocalDate(today, -1)) return { streak: state.streak, atRisk: true };
  return { streak: 0, atRisk: false };
}
