import { createContext, useContext } from 'react';

interface RadioGroupContextValue {
  onChange: (value: string) => void;
  value: string | undefined;
}

/**
 * Kênh nối `RadioGroup` với các `Radio` con.
 *
 * ── Vì sao dùng context chứ không truyền prop ───────────────────────────────
 * Chọn một trong nhiều nghĩa là chọn cái này thì BỎ cái kia — quy tắc đó không
 * nằm ở một nút nào cả, nó nằm ở NHÓM. Nếu mỗi `Radio` tự giữ `selected` thì
 * nơi gọi phải tự viết lại đúng quy tắc đó ở mọi màn hình, và ca hỏng kinh điển
 * là hai nút cùng sáng vì một nhánh cập nhật state quên tắt nút cũ.
 *
 * Context cũng cho phép đặt `Radio` sâu trong bố cục (trong `Card`, trong hàng
 * của `FlatList`) mà không phải xâu prop qua từng tầng.
 *
 * Tách ra file riêng để `Radio` và `RadioGroup` cùng nhập được mà không tạo
 * vòng — `import/no-cycle` chặn cứng.
 */
export const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export function useRadioGroup(): RadioGroupContextValue {
  const context = useContext(RadioGroupContext);

  /**
   * ⛔ Ném lỗi chứ không im lặng rơi về "chưa chọn".
   *
   * `Radio` không có provider thì nó vẫn VẼ RA bình thường, chỉ là bấm mãi
   * không sáng. Lỗi kiểu đó lọt qua cả `tsc` lẫn code review và chỉ lộ ra khi
   * người dùng thật không chọn được phương thức thanh toán. Ném ngay ở lần
   * render đầu tiên thì lập trình viên thấy liền.
   */
  if (!context) {
    throw new Error('<Radio> phải nằm trong <RadioGroup> — nhóm mới là nơi giữ giá trị đang chọn.');
  }

  return context;
}
