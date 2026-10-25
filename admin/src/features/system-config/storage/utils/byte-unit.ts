const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Chọn MỘT đơn vị byte chung cho cả trục (theo giá trị lớn nhất) — Recharts chia vạch "đẹp" trên số
 * liệu thô, nên trục theo byte cho vạch lẻ kiểu `5,25 MB · 10,5 MB`. Đổi sang đơn vị đã chọn trước rồi
 * mới đưa vào chart thì vạch tròn (`5 · 10 · 15 · 20`) và đơn vị in một lần ở trục.
 */
export function pickByteUnit(maxBytes: number): { unit: (typeof UNITS)[number]; divisor: number } {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) return { unit: 'B', divisor: 1 };
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(maxBytes) / Math.log(1024)));
  return { unit: UNITS[i]!, divisor: 1024 ** i };
}
