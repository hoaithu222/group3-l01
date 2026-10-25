/** `calm` còn thoải mái · `hurry` sắp hết · `urgent` những giây cuối · `over` đã hết giờ. */
export type CountdownTone = 'calm' | 'hurry' | 'over' | 'urgent';

/** Trần các mốc theo giây — câu dài không đổi màu sớm hơn thế. */
const URGENT_MAX = 5;
const HURRY_MAX = 10;

/**
 * Sắc thái đồng hồ theo số giây còn lại. Ngưỡng theo TỈ LỆ của câu (¼ và ½, có trần 5 s và 10 s): câu 20 s đổi màu ở 10 s và
 * 5 s, nhưng câu 6 s KHÔNG được đỏ ngay từ giây đầu — đỏ cả câu thì màu hết còn ý nghĩa "sắp hết giờ".
 */
export function countdownTone(seconds: number, totalSeconds: number): CountdownTone {
  if (seconds <= 0) return 'over';
  const urgentAt = Math.min(URGENT_MAX, Math.max(1, Math.floor(totalSeconds / 4)));
  const hurryAt = Math.min(HURRY_MAX, Math.max(urgentAt + 1, Math.floor(totalSeconds / 2)));
  if (seconds <= urgentAt) return 'urgent';
  if (seconds <= hurryAt) return 'hurry';
  return 'calm';
}

/** Các mốc được ĐỌC cho trình đọc màn hình. Mỗi giây một lần sẽ chen ngang lúc người dùng đang nghe đề. */
const ANNOUNCE_AT: readonly number[] = [10, 5, 3, 0];

/**
 * Có nên đọc số giây ở nhịp này không: chỉ ở các mốc 10 · 5 · 3 · hết giờ, và không đọc mốc còn NHIỀU HƠN hoặc bằng cả câu
 * (mở câu 10 s không đọc "còn 10 giây" đè lên lúc người dùng đang nghe đề).
 */
export function shouldAnnounce(seconds: number, totalSeconds: number): boolean {
  if (!ANNOUNCE_AT.includes(seconds)) return false;
  return seconds === 0 || seconds < totalSeconds;
}

/** Câu chữ đọc cho trình đọc màn hình (và nhãn của chữ số): "Còn 7 giây" / "Hết giờ". */
export function countdownSpeech(seconds: number): string {
  return seconds <= 0 ? 'Hết giờ' : `Còn ${String(seconds)} giây`;
}
