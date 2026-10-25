/**
 * Nhãn tiếng Việt cho giá trị `enum` của registry BE. BE chỉ trả mã thô
 * (`options`), nên nhãn nằm ở đây; mã chưa có nhãn hiển thị nguyên mã.
 */
const ENUM_OPTION_LABELS: Readonly<Record<string, string>> = {
  // Chế độ thông báo (`NOTIFY_MODE_OPTIONS`)
  ALL: 'Tất cả tin mới',
  MENTIONS_AND_THREADS: 'Nhắc tên và luồng trả lời',
  MUTED: 'Tắt thông báo',
  // Xem trước trên màn hình khoá (`LOCK_SCREEN_OPTIONS`)
  HIDDEN: 'Ẩn nội dung',
  SENDER: 'Chỉ hiện người gửi',
  FULL: 'Hiện đầy đủ',
};

/** `phút giờ * * thứ` — lịch HẰNG TUẦN của ví nhóm (`wallet.defaultReminderCron`, khớp `WALLET_WEEKLY_CRON_RE` của BE); thứ 0 = Chủ nhật. */
const WEEKLY_CRON_RE = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* ([0-6])$/;
const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;

/** `0 9 * * 5` → "Thứ Sáu 09:00 hằng tuần"; chuỗi không phải lịch hằng tuần → `undefined`. */
function weeklyCronLabel(value: string): string | undefined {
  const m = WEEKLY_CRON_RE.exec(value);
  if (!m) return undefined;
  const [, minute, hour, weekday] = m;
  return `${WEEKDAY_LABELS[Number(weekday)]} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} hằng tuần`;
}

export const enumOptionLabel = (value: string): string =>
  ENUM_OPTION_LABELS[value] ?? weeklyCronLabel(value) ?? value;
