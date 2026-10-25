import dayjs from 'dayjs';

/**
 * Ngày bắt đầu/hạn chót gửi BE (`z.coerce.date()` — be.md §3) là NGÀY trên lịch của người dùng, không
 * phải một khoảnh khắc UTC. Chuỗi `yyyy-MM-dd` trần bị BE đọc là 00:00 UTC — người ở UTC-5 thấy hạn
 * lùi một hôm, và mọi người thấy thẻ "quá hạn" từ 07:00 sáng NGÀY hạn (`isOverdue = dueDate < now`).
 *
 * Nên: ngày bắt đầu = ĐẦU ngày giờ máy, hạn chót = CUỐI ngày (23:59:59.999) giờ máy, cả hai gửi
 * dạng ISO có múi giờ — thẻ chỉ quá hạn SAU ngày hạn, và nhắc hạn (−24 h) rơi đúng ngày hôm trước.
 */
export function startOfDayIso(date: Date): string {
  return dayjs(date).startOf('day').toISOString();
}

export function endOfDayIso(date: Date): string {
  return dayjs(date).endOf('day').toISOString();
}

/** "Ngày bắt đầu phải trước hạn chót" (`TASK_013`) — kiểm TRƯỚC khi gửi để báo ngay tại ô ngày. */
export function isStartAfterDue(start: Date | null, due: Date | null): boolean {
  return Boolean(start && due && dayjs(start).startOf('day').isAfter(dayjs(due).startOf('day')));
}
