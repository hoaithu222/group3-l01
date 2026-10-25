/**
 * Cắt text thành các đoạn khớp / không khớp từ khoá tìm kiếm — để bọc `<mark>`
 * đúng chỗ.
 *
 * So khớp: **không phân biệt hoa/thường, CÓ phân biệt dấu**. Đây không phải lựa
 * chọn tuỳ tiện — nó phải trùng khít nơi TÍNH ra tập kết quả, lệch nhau là hỏng
 * theo kiểu khó chịu nhất: danh sách báo có kết quả mà không tô vàng chữ nào,
 * hoặc ngược lại. Hai nơi đang dùng đều khớp đúng quy tắc này:
 *   · `useMessageSearch` (meeting-chat) — lọc phía client, cùng công thức.
 *   · Tìm kiếm toàn văn công văn — BE lọc bằng `EF.Functions.ILike` của
 *     PostgreSQL, vốn cũng bỏ qua hoa/thường nhưng GIỮ dấu.
 *
 * ⛔ CHỈ dùng để TÔ MÀU, TUYỆT ĐỐI KHÔNG dùng để LỌC. Lọc danh sách luôn đi qua
 *    `includesNormalized` / `matchesSearch` (`@/shared/utils/string.utils`) theo
 *    `search-matching.md` — hai việc khác nhau, đừng gộp.
 *
 * ⛔ KHÔNG thêm bỏ dấu (`stripDiacritics`) vào đây. Ngoài lý do phải khớp nơi
 *    lọc ở trên, còn một rào kỹ thuật cứng: `stripDiacritics` chạy
 *    `normalize('NFD')` — thao tác này LÀM ĐỔI ĐỘ DÀI chuỗi, nên chỉ số tìm được
 *    trên chuỗi đã chuẩn hoá không ánh xạ ngược về chuỗi gốc, và `<mark>` sẽ bọc
 *    lệch ký tự. Muốn bỏ dấu thì phải dựng bảng ánh xạ chỉ số, và với công văn
 *    thì việc đúng chỗ là bật `unaccent` phía Postgres.
 */

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * `text` rỗng hoặc `query` rỗng → trả nguyên 1 đoạn không khớp (caller render
 * bình thường, không cần nhánh riêng).
 */
export const splitByQuery = (text: string, query: string): HighlightSegment[] => {
  const q = query.trim().toLowerCase();
  if (!q || !text) return [{ text, hit: false }];

  const haystack = text.toLowerCase();
  const out: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = haystack.indexOf(q, cursor);
    if (idx === -1) {
      out.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (idx > cursor) out.push({ text: text.slice(cursor, idx), hit: false });
    // Cắt trên chuỗi GỐC (không phải `haystack`) để giữ nguyên hoa/thường user gõ.
    out.push({ text: text.slice(idx, idx + q.length), hit: true });
    cursor = idx + q.length;
  }

  return out;
};
