import { addDaysToLocalDate, localParts } from "../../../core/utils/local-date";

/**
 * Chỉ số NGÀY của một người từ các khe 15 phút có hoạt động — HÀM THUẦN (chỉ `Intl` qua `core/utils/local-date`), không I/O. Không nội dung, không loại sự kiện: chỉ "khe nào có hoạt động" và
 * "khe nào có bao nhiêu sự kiện".
 *
 * QUY ƯỚC NGÀY WELLBEING: ngày mới bắt đầu lúc HẾT khung khuya (mặc định 05:00 theo múi giờ CỦA NGƯỜI DÙNG), nên hoạt động 00:00–05:00 thuộc ngày HÔM TRƯỚC (README/be.md §5 "bucket 00:30 thuộc ngày
 * trước"). Nhờ vậy một buổi làm từ 23:30 tới 00:45 là MỘT chuỗi liên tục của cùng một ngày, và job tổng hợp chạy SAU 05:00 mới thấy đủ khung khuya của ngày vừa qua.
 */
export interface DayConfig {
  bucketMinutes: number;
  /** Khoảng trống giữa hai khe có hoạt động ≤ ngần này (phút) vẫn coi là làm liên tục. */
  continuousGapMinutes: number;
  /** Phút trong ngày (0–1439) bắt đầu/kết thúc khung khuya; `start > end` = khung vắt qua nửa đêm. */
  lateNightStartMinute: number;
  lateNightEndMinute: number;
}

export interface BucketRef {
  /** Ngày wellbeing `YYYY-MM-DD`. */
  date: string;
  /** Giờ bắt đầu khe địa phương `HHmm` (vd `2330`). */
  slot: string;
}

/** Dữ liệu thô của một ngày (đọc từ HASH Redis): các khe có hoạt động + số sự kiện theo khe. */
export interface BucketDay {
  activeSlots: readonly string[];
  eventSlots: Readonly<Record<string, number>>;
}

export interface DailyMetrics {
  activeMinutes: number;
  longestContinuousMinutes: number;
  lateNightMinutes: number;
  eventsCount: number;
  lateNightEvents: number;
}

const MINUTES_PER_DAY = 1440;
const SLOT_RE = /^([01]\d|2[0-3])([0-5]\d)$/;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `"23:00"` → 1380. Sai định dạng → `fallback` (không ném lỗi — giá trị đến từ hằng cấu hình, test khoá hình dạng). */
export function parseClock(hhmm: string, fallback: number): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

export function dayConfigFrom(limits: { bucketMinutes: number; continuousGapMinutes: number; lateNight: { start: string; end: string } }): DayConfig {
  return {
    bucketMinutes: limits.bucketMinutes,
    continuousGapMinutes: limits.continuousGapMinutes,
    lateNightStartMinute: parseClock(limits.lateNight.start, 23 * 60),
    lateNightEndMinute: parseClock(limits.lateNight.end, 5 * 60),
  };
}

/** Phút trong ngày mà ngày wellbeing bắt đầu: hết khung khuya nếu khung vắt qua nửa đêm, ngược lại 00:00. */
export function dayStartMinute(cfg: DayConfig): number {
  return cfg.lateNightStartMinute > cfg.lateNightEndMinute ? cfg.lateNightEndMinute : 0;
}

export function isLateNightMinute(minuteOfDay: number, cfg: DayConfig): boolean {
  const { lateNightStartMinute: start, lateNightEndMinute: end } = cfg;
  return start > end ? minuteOfDay >= start || minuteOfDay < end : minuteOfDay >= start && minuteOfDay < end;
}

/** Ngày wellbeing chứa thời điểm `at` tại múi giờ `tz`. */
export function wellbeingDateOf(at: Date, tz: string, cfg: DayConfig): string {
  const p = localParts(at, tz);
  const calendar = `${String(p.year).padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
  return p.hour * 60 + p.minute < dayStartMinute(cfg) ? addDaysToLocalDate(calendar, -1) : calendar;
}

/** Khe 15 phút + ngày wellbeing của `at` tại `tz` (đổi múi giờ giữa chừng không tạo ngày ảo: mỗi lần ghi tính lại từ thời điểm thật). */
export function bucketOf(at: Date, tz: string, cfg: DayConfig): BucketRef {
  const p = localParts(at, tz);
  const minute = p.hour * 60 + p.minute;
  const slotMinute = Math.floor(minute / cfg.bucketMinutes) * cfg.bucketMinutes;
  return { date: wellbeingDateOf(at, tz, cfg), slot: `${pad2(Math.floor(slotMinute / 60))}${pad2(slotMinute % 60)}` };
}

/** `HHmm` → phút trong ngày; `null` khi sai định dạng hoặc không nằm trên lưới khe (dữ liệu lạ bị bỏ, không làm hỏng tổng hợp). */
export function parseSlot(slot: string, cfg: DayConfig): number | null {
  const m = SLOT_RE.exec(slot);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return minute % cfg.bucketMinutes === 0 ? minute : null;
}

/**
 * Tổng hợp một ngày. `longestContinuousMinutes` = số khe có hoạt động của chuỗi dài nhất × `bucketMinutes` (khe trống ≤ `continuousGapMinutes` giữa hai khe vẫn nối chuỗi; phần trống KHÔNG được cộng vào —
 * thiên về không phóng đại). Khe trùng chỉ tính một lần; kết quả không phụ thuộc thứ tự đầu vào.
 */
export function summarizeDay(input: BucketDay, cfg: DayConfig): DailyMetrics {
  const start = dayStartMinute(cfg);
  const offsetOf = (minute: number): number => (minute - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  const active = new Map<number, number>();
  for (const slot of input.activeSlots) {
    const minute = parseSlot(slot, cfg);
    if (minute !== null) active.set(offsetOf(minute), minute);
  }

  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const offset of [...active.keys()].sort((a, b) => a - b)) {
    run = prev !== null && offset - (prev + cfg.bucketMinutes) <= cfg.continuousGapMinutes ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = offset;
  }

  let lateNightSlots = 0;
  for (const minute of active.values()) if (isLateNightMinute(minute, cfg)) lateNightSlots += 1;

  let eventsCount = 0;
  let lateNightEvents = 0;
  for (const [slot, raw] of Object.entries(input.eventSlots)) {
    const minute = parseSlot(slot, cfg);
    const n = Math.floor(raw);
    if (minute === null || !Number.isFinite(n) || n <= 0) continue;
    eventsCount += n;
    if (isLateNightMinute(minute, cfg)) lateNightEvents += n;
  }

  return {
    activeMinutes: active.size * cfg.bucketMinutes,
    longestContinuousMinutes: longest * cfg.bucketMinutes,
    lateNightMinutes: lateNightSlots * cfg.bucketMinutes,
    eventsCount,
    lateNightEvents,
  };
}

/** HASH Redis `{ "b:2330": "1", "e:2330": "3" }` → `BucketDay`. Trường lạ/giá trị hỏng bị bỏ. */
export function splitBucketHash(hash: Readonly<Record<string, string>>): BucketDay {
  const activeSlots: string[] = [];
  const eventSlots: Record<string, number> = {};
  for (const [field, value] of Object.entries(hash)) {
    if (field.startsWith("b:")) {
      if (value) activeSlots.push(field.slice(2));
    } else if (field.startsWith("e:")) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) eventSlots[field.slice(2)] = Math.floor(n);
    }
  }
  return { activeSlots, eventSlots };
}

export function isEmptyDay(day: BucketDay): boolean {
  return day.activeSlots.length === 0 && Object.keys(day.eventSlots).length === 0;
}
