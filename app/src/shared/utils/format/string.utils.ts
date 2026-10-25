/**
 * So khớp chuỗi BỎ DẤU — dùng cho mọi ô tìm kiếm.
 *
 * ── Vì sao không dùng `toLowerCase().includes()` ─────────────────────────────
 * Người Việt gõ tìm kiếm KHÔNG BỎ DẤU. Đó không phải sự lười — trên bàn phím
 * điện thoại, gõ "met khoi" nhanh hơn hẳn "mét khối", và ai cũng làm vậy.
 *
 *     'Mét khối'.toLowerCase().includes('met khoi')   // false
 *     includesSearch('Mét khối', 'met khoi')          // true
 *
 * Kết quả rỗng ở ô tìm kiếm bị người dùng đọc là "app hỏng" hoặc "không có dữ
 * liệu", chứ không ai đoán ra là phải gõ đủ dấu. ESLint chặn cứng lối viết cũ —
 * xem selector số 2 trong `eslint.config.js`.
 *
 * ── Đ / đ phải xử lý riêng ───────────────────────────────────────────────────
 * `normalize('NFD')` tách được dấu thanh và dấu mũ vì chúng là ký tự tổ hợp
 * riêng. Nhưng `đ` (U+0111) là MỘT ký tự độc lập, không phải `d` + gạch ngang,
 * nên NFD không đụng tới nó. Thiếu bước thay tay thì gõ "dong" không ra "đồng"
 * và "da nang" không ra "Đà Nẵng" — đúng hai từ hay tìm nhất.
 */

/** Dấu thanh và dấu mũ sau khi `normalize('NFD')` tách ra. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Bỏ dấu + chuyển chữ thường + gom khoảng trắng thừa.
 *
 * Gom khoảng trắng vì bàn phím điện thoại rất hay chèn dấu cách thừa khi người
 * dùng sửa từ giữa câu — "bê  tông" phải khớp "bê tông".
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** `haystack` có chứa `needle` không, bỏ qua dấu và hoa/thường. */
export function includesSearch(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  const term = normalizeSearch(needle);
  if (!term) return true; // ô tìm kiếm rỗng ⇒ không lọc gì
  return normalizeSearch(haystack).includes(term);
}

/**
 * Khớp một bản ghi với từ khoá qua NHIỀU trường.
 *
 * @example
 *   items.filter((item) => matchesSearch(search, item.name, item.code, item.note))
 */
export function matchesSearch(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const term = normalizeSearch(needle);
  if (!term) return true;
  return fields.some((field) => (field ? normalizeSearch(field).includes(term) : false));
}

/**
 * Chữ cái đầu để hiển thị trên avatar khi không có ảnh.
 *
 * Lấy từ ĐẦU và CUỐI tên: người Việt gọi nhau bằng tên (chữ cuối), nên "Nguyễn
 * Văn An" phải ra "NA" chứ không phải "NV" — "NV" đọc lên không nhận ra ai.
 * Giữ NGUYÊN dấu: đây là chữ để nhìn, không phải để so khớp.
 */
export function getInitials(name: string | null | undefined, max = 2): string {
  if (!name?.trim()) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1 || max === 1) return (parts[0]?.[0] ?? '').toUpperCase();
  const first = parts[0]?.[0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Cắt bớt chuỗi quá dài, thêm dấu `…`. */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
