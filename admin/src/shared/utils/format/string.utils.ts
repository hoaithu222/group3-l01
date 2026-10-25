/** Remove Vietnamese diacritics */
export function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Chuẩn hoá chuỗi để SO KHỚP TÌM KIẾM: bỏ dấu → hạ chữ thường → gộp khoảng trắng.
 *
 * Đây là dạng chuẩn DUY NHẤT dùng cho mọi ô tìm kiếm do người dùng gõ. Gõ
 * "met khoi" phải ra "Mét khối", "NGUYEN" phải ra "Nguyễn", "  ha  noi " phải ra
 * "Hà Nội". Chỉ `toLowerCase()` là KHÔNG đủ — xem `docs/rules/search-matching.md`.
 */
export function normalizeSearch(value: string | null | undefined): string {
  if (!value) return '';
  return stripDiacritics(String(value)).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * `haystack` có chứa `needle` không — bỏ dấu, không phân biệt hoa/thường.
 * Từ khoá rỗng → luôn khớp (không lọc).
 *
 * `needle` nhận chuỗi THÔ do người dùng gõ; hàm tự chuẩn hoá cả hai vế. Nếu đang
 * lọc trong vòng lặp lớn, chuẩn hoá `needle` một lần bằng `normalizeSearch()` rồi
 * gọi `includesNormalized()` để khỏi chuẩn hoá lại mỗi phần tử.
 */
export function includesSearch(
  haystack: string | null | undefined,
  needle: string | null | undefined,
): boolean {
  return includesNormalized(haystack, normalizeSearch(needle));
}

/** Như `includesSearch` nhưng `needle` ĐÃ được `normalizeSearch()` từ trước. */
export function includesNormalized(
  haystack: string | null | undefined,
  normalizedNeedle: string,
): boolean {
  if (!normalizedNeedle) return true;
  return normalizeSearch(haystack).includes(normalizedNeedle);
}

/**
 * Khớp từ khoá trên NHIỀU trường của cùng một bản ghi (mã, tên, ký hiệu…).
 * Trường `null`/`undefined` được bỏ qua.
 */
export function matchesSearch(
  fields: readonly (string | null | undefined)[],
  needle: string | null | undefined,
): boolean {
  const normalized = normalizeSearch(needle);
  if (!normalized) return true;
  return fields.some((field) => includesNormalized(field, normalized));
}

/** Remove special characters (keep Unicode letters and numbers) */
export function stripSpecialCharacters(str: string): string {
  return str.replace(/[^\p{L}\p{N}\s]/gu, '');
}

/** Truncate string with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
