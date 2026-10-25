import type { WellbeingDays } from '../api/wellbeing.types';

/**
 * Tên sự kiện socket `wellbeing:alert` (`user:{id}`, mọi thiết bị của tôi). ⚠️ Khai Ở ĐÂY chứ không ở `SocketEvent` (`core/socket/socket.events.ts`):
 * file đó sát trần dòng (`scripts/file-size-manifest.json`). `useSocketEvent` nhận chuỗi nên dùng được; khi bảng chung có chỗ thì dời hằng này lên đó.
 */
export const WELLBEING_ALERT_EVENT = 'wellbeing:alert';

/**
 * Cài đặt tươi 5 phút (app.md p7-03 §4). Cảnh báo mới đi đường socket + làm mới cưỡng bức nên không phải chờ hết hạn.
 * `retry: false` ở các query: lỗi hiện ngay kèm "Thử lại" thay vì treo khung xương qua ba lần thử.
 */
export const WELLBEING_STALE_MS = 5 * 60_000;

/** Hai lựa chọn của bộ chuyển 7/30 ngày — khớp `assessmentDays` của BE. */
export const WELLBEING_DAY_OPTIONS: readonly WellbeingDays[] = [7, 30];
export const WELLBEING_DEFAULT_DAYS: WellbeingDays = 7;

/**
 * Ngày wellbeing bắt đầu lúc 05:00 giờ địa phương (BE `LIMITS.wellbeing.lateNight.end`): hoạt động 00:00–05:00 tính vào ngày HÔM TRƯỚC. Biểu đồ dùng số này để
 * biết "hôm nay" theo cách BE đếm — không thì 02:00 sáng biểu đồ đã dựng sẵn một cột trống cho ngày mà BE chưa coi là bắt đầu.
 */
export const WELLBEING_DAY_START_HOUR = 5;

/** Số ngày có dữ liệu tối thiểu để BE chấm điểm (BE `minDailiesForAssessment`) — chữ "Cần thêm vài ngày…" nói đúng con số này. */
export const WELLBEING_MIN_DAYS = 3;

/** Số ngày BE giữ chỉ số theo ngày rồi tự xoá (BE `retentionDays`) — nói ra ở màn giải thích trước khi bật. */
export const WELLBEING_RETENTION_DAYS = 90;

/** P1 — biên giờ làm/nghỉ mong muốn (khớp BE `LIMITS.wellbeing.preferredBreak`) và giá trị khởi tạo khi chưa từng đặt (50 phút làm/10 phút nghỉ — nhịp Pomodoro thường dùng). */
export const PREFERRED_BREAK_LIMITS = {
  workMinutesMin: 15,
  workMinutesMax: 180,
  breakMinutesMin: 1,
  breakMinutesMax: 60,
} as const;
export const PREFERRED_BREAK_DEFAULT = { workMinutes: 50, breakMinutes: 10 } as const;
