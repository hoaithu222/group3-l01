/**
 * Thời gian dự án ở độ chính xác THÁNG (trang công khai chỉ in `MM/yyyy`). BE định dạng tháng theo GIỜ VIỆT NAM (`formatMonthYear`, `Asia/Ho_Chi_Minh` = UTC+7 cố định, không có
 * giờ mùa hè) — nên app cũng GỬI mốc "đầu tháng theo giờ Việt Nam" và ĐỌC ngược theo UTC+7. Dùng giờ máy thì người ở múi giờ phía tây UTC+7 (đi du học) chọn "09/2026" mà BE in "08/2026".
 */
const VN_OFFSET_MS = 7 * 3_600_000;
const pad = (value: number): string => String(value).padStart(2, '0');

/** Ngày người dùng chọn ở lịch (giờ máy) → mốc ISO "00:00 ngày 1 của tháng đó, giờ Việt Nam". */
export function monthToIso(picked: Date): string {
  return `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-01T00:00:00+07:00`;
}

/** ISO của server → `Date` (giờ máy) ở ngày 1 của THÁNG THEO GIỜ VIỆT NAM, để lịch tô đúng tháng. `null` khi trống/không hợp lệ. */
export function isoToMonthDate(iso: string | null): Date | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const vn = new Date(time + VN_OFFSET_MS);
  return new Date(vn.getUTCFullYear(), vn.getUTCMonth(), 1);
}

/** "09/2026" theo giờ Việt Nam — cùng cách BE in; `null` ⇒ chuỗi rỗng. */
export function monthLabel(iso: string | null): string {
  const date = isoToMonthDate(iso);
  return date ? `${pad(date.getMonth() + 1)}/${date.getFullYear()}` : '';
}
