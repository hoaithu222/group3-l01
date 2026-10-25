export interface DeadlinePreset {
  key: string;
  label: string;
  /** `null` = không đặt hạn. */
  hours: number | null;
}

const NO_DEADLINE: DeadlinePreset = { hours: null, key: 'none', label: 'Không đặt hạn' };

/** BE giới hạn hạn tối đa 30 ngày (`LIMITS.announcement.deadlineMaxDays`) — các mốc dưới đều nằm trong. */
export const DEADLINE_PRESETS: readonly DeadlinePreset[] = [
  NO_DEADLINE,
  { hours: 24, key: '24h', label: '24 giờ' },
  { hours: 72, key: '3d', label: '3 ngày' },
  { hours: 168, key: '7d', label: '7 ngày' },
  { hours: 336, key: '14d', label: '14 ngày' },
];

export const DEFAULT_DEADLINE_PRESET_KEY = NO_DEADLINE.key;

const HOUR_MS = 3_600_000;

/** Khoá lạ → "Không đặt hạn" (an toàn hơn đoán một hạn). */
export function findDeadlinePreset(key: string): DeadlinePreset {
  return DEADLINE_PRESETS.find((preset) => preset.key === key) ?? NO_DEADLINE;
}

/** Tính theo giờ MÁY CHỦ (`serverNowMs`) vì BE kiểm "tương lai, ≤ 30 ngày" theo đồng hồ của nó. */
export function deadlineFromPreset(preset: DeadlinePreset, nowMs: number): string | undefined {
  return preset.hours === null ? undefined : new Date(nowMs + preset.hours * HOUR_MS).toISOString();
}
