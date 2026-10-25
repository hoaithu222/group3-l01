import dayjs from 'dayjs';

import type { WhenWindow } from './local-time';

/**
 * Gợi ý nhanh cho tấm chọn thời gian (p7-04 app.md §2 `schedule-presets`): hẹn giờ gửi ("Sau 1 giờ", "Tối nay 20:00", "Sáng mai 08:00", "Thứ Hai tới 08:00") và
 * nhắc lại tin ("Sau 20 phút", "Sau 1 giờ", …). Tính theo giờ MÁY từ `nowMs` (giờ MÁY CHỦ — người dùng lệch đồng hồ vẫn đúng); mốc ĐÃ QUA hoặc chưa đủ
 * `minLeadMs` bị bỏ, mốc xa hơn `maxMs` cũng bỏ. Không có mốc nào còn lại thì tấm chỉ còn "Chọn thời gian".
 */
export type WhenPresetKind = 'schedule' | 'remind';

export interface WhenPreset {
  key: string;
  label: string;
  at: Date;
}

const HOUR = 3_600_000;

/** Thứ Hai kế tiếp NGHIÊM NGẶT sau hôm nay (hôm nay là thứ Hai → tuần sau) lúc 08:00. */
function nextMonday8(nowMs: number): Date {
  const now = dayjs(nowMs);
  const daysAhead = ((8 - now.day()) % 7) || 7; // day(): 0 = Chủ nhật, 1 = thứ Hai
  return now.add(daysAhead, 'day').hour(8).minute(0).second(0).millisecond(0).toDate();
}

function atHour(nowMs: number, dayOffset: number, hour: number): Date {
  return dayjs(nowMs).add(dayOffset, 'day').hour(hour).minute(0).second(0).millisecond(0).toDate();
}

export function buildPresets(kind: WhenPresetKind, nowMs: number, window: WhenWindow): WhenPreset[] {
  const all: WhenPreset[] =
    kind === 'schedule'
      ? [
          { key: 'in-1h', label: 'Sau 1 giờ', at: new Date(nowMs + HOUR) },
          { key: 'tonight', label: 'Tối nay 20:00', at: atHour(nowMs, 0, 20) },
          { key: 'tomorrow', label: 'Sáng mai 08:00', at: atHour(nowMs, 1, 8) },
          { key: 'monday', label: 'Thứ Hai tới 08:00', at: nextMonday8(nowMs) },
        ]
      : [
          { key: 'in-20m', label: 'Sau 20 phút', at: new Date(nowMs + 20 * 60_000) },
          { key: 'in-1h', label: 'Sau 1 giờ', at: new Date(nowMs + HOUR) },
          { key: 'tomorrow', label: 'Sáng mai 08:00', at: atHour(nowMs, 1, 8) },
          { key: 'monday', label: 'Thứ Hai tới 08:00', at: nextMonday8(nowMs) },
        ];
  return all.filter((p) => {
    const ms = p.at.getTime();
    return ms >= nowMs + window.minLeadMs && ms <= nowMs + window.maxMs;
  });
}
