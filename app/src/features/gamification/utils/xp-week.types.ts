import type { XpEventDto } from '../api/gamification.types';

/** Phần của `XpEventDto` mà việc gom ngày cần — để test dựng sự kiện gọn, không phải điền đủ mười trường. */
export type XpEventLike = Pick<XpEventDto, 'occurredAt' | 'sourceType' | 'xp'>;

/** Một ngày (giờ địa phương) trong dải 7 ngày. */
export interface DayBucket {
  /** Có hoạt động trong ngày (sự kiện XP, hoặc nằm trong chuỗi ngày server báo). */
  active: boolean;
  /** `YYYY-MM-DD` giờ địa phương. */
  dateKey: string;
  /** `dd/MM` — dùng cho nhãn trình đọc màn hình. */
  dateLabel: string;
  /** Số sự kiện XP (kể cả sự kiện chạm trần, xp 0). */
  events: number;
  isToday: boolean;
  /** `T2` … `T7`, `CN`. */
  weekday: string;
  /** XP đã cộng trong ngày (không âm). */
  xp: number;
}
