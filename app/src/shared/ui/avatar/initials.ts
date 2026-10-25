/**
 * Sinh chữ viết tắt từ tên người dùng — dùng khi avatar KHÔNG có ảnh.
 *
 * ── Vì sao là một hàm riêng chứ không viết thẳng trong `Avatar.tsx` ──────────
 * Đây là chỗ duy nhất trong nhóm có logic thật sự (chứ không phải bố cục), và
 * nó sai âm thầm: chữ viết tắt vẫn hiện, chỉ là hiện SAI. Tách ra thì test bám
 * thẳng vào quy tắc, không phải đi vòng qua cây React.
 *
 * ── ⚠️ Tiếng Việt: hai cái bẫy, cả hai đều không báo lỗi ─────────────────────
 *
 *  1. **Dấu tách rời (NFD)**. `"Ánh"` có thể được lưu ở hai dạng: `Á` là MỘT ký
 *     tự (NFC, U+00C1), hoặc `A` + dấu sắc rời (NFD, U+0041 U+0301). Chuỗi từ
 *     backend/JWT hay rơi vào dạng NFD. Lấy `word[0]` trên bản NFD ra chữ `A`
 *     KHÔNG DẤU — "Nguyễn Văn Ánh" thành `NA` thay vì `NÁ`, và không có lỗi nào
 *     báo. `normalize('NFC')` gộp lại thành một ký tự trước khi cắt.
 *
 *  2. **Cắt theo `[0]` là cắt theo UTF-16 code unit**, không phải theo ký tự.
 *     Với chữ Việt thì `[0]` đủ dùng sau khi NFC, nhưng tên có emoji hoặc chữ
 *     ngoài BMP sẽ bị cắt còn nửa cặp surrogate và render ra ô vuông. `Array.from`
 *     duyệt theo CODE POINT nên an toàn với mọi đầu vào.
 *
 * ⛔ Viết hoa bằng `toUpperCase()` ở TẦNG DỮ LIỆU, không bằng class `uppercase`.
 * NativeWind dịch `uppercase` thành `textTransform` của native, và trên Android
 * vai trò chữ có lineHeight dưới ~1.47× sẽ **cắt cụt dấu** của `Ấ`/`Ộ`. Viết hoa
 * sẵn trong chuỗi thì `Avatar` được tự do chọn vai trò chữ theo cỡ (xem chú
 * thích trong `Avatar.tsx`), miễn là vai trò đó đủ cao — không phụ thuộc vào
 * `text-overline` là vai trò IN HOA duy nhất.
 */

/** Ký tự đầu tiên của một từ, tính theo CODE POINT và đã viết hoa. */
function firstLetter(word: string): string {
  const [head] = Array.from(word);
  if (!head) return '';
  // `toUpperCase()` của một vài ký tự trả về NHIỀU ký tự (`ß` → `SS`). Cắt lại
  // theo code point để mỗi từ đóng góp đúng một chữ cái.
  return Array.from(head.toUpperCase())[0] ?? '';
}

/**
 * `Nguyễn Văn Ánh` → `NÁ` · `Ánh` → `Á` · `nguyễn văn ánh` → `NÁ`
 *
 * Quy tắc: chữ đầu của từ ĐẦU cộng chữ đầu của (`maxLength - 1`) từ CUỐI. Người
 * Việt gọi nhau bằng TÊN (từ cuối) chứ không phải bằng họ, nên `Nguyễn Văn Ánh`
 * phải ra `NÁ` — lấy hai từ đầu sẽ ra `NV`, đúng thói quen phương Tây và sai ở
 * đây.
 *
 * @param name      Tên đầy đủ. Chuỗi rỗng hoặc chỉ có khoảng trắng trả về `''`.
 * @param maxLength Số chữ cái tối đa. Thiết kế dùng 1 chữ; mặc định 2 vì danh
 *                  sách người chuyển tiền cần phân biệt được hai người trùng họ.
 */
export function getInitials(name: string, maxLength = 2): string {
  const words = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const [head] = words;
  if (!head || maxLength < 1) return '';

  const picked =
    words.length <= maxLength
      ? words
      : // `slice` từ cuối lên: `maxLength = 1` thì KHÔNG lấy từ cuối nào cả —
        // viết `slice(-(maxLength - 1))` sẽ là `slice(0)`, tức LẤY CẢ MẢNG.
        [head, ...words.slice(words.length - maxLength + 1)];

  return picked.map(firstLetter).join('');
}
