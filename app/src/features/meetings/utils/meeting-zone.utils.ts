import type { SelectOption } from '@/shared/ui/select';

import { TIMEZONE_OPTIONS } from '../constants/meetings.constants';
import { deviceTimeZone, zoneShortName } from './meeting-time.utils';

/** Nhãn đầy đủ của múi giờ cho ô chọn: bảng rút gọn (README §6) → "Việt Nam (Hà Nội, TP.HCM)"; ngoài bảng → "Cairo (Africa/Cairo)". */
export function timezoneLabel(tz: string): string {
  const known = TIMEZONE_OPTIONS.find((option) => option.id === tz);
  return known ? known.label : `${zoneShortName(tz)} (${tz})`;
}

/**
 * Lựa chọn cho `SelectSheet` (tìm được). Múi giờ THIẾT BỊ luôn đứng đầu (mặc định của form, hay bị người dùng bấm lại), rồi tới
 * múi giờ đang chọn nếu nằm ngoài bảng rút gọn — không thì ô chọn hiện một giá trị mà danh sách không có mục nào tương ứng.
 */
export function timezoneOptions(
  current: string,
  device: string = deviceTimeZone(),
): SelectOption[] {
  const seen = new Set<string>();
  const ids = [device, current, ...TIMEZONE_OPTIONS.map((option) => option.id)].filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return ids.map((id) => ({
    description: id === device ? `${id} · múi giờ thiết bị` : id,
    label: timezoneLabel(id),
    value: id,
  }));
}
