import { useCallback, useRef, useState, type Ref, type RefObject } from 'react';
import type { TextInput } from 'react-native';

export interface UseInputClearOptions {
  /** Bật nút xoá. Tắt thì hook không giữ state nào và `visible` luôn `false`. */
  clearable: boolean;
  /** Nội dung có sẵn của ô UNCONTROLLED — quyết định nút xoá có hiện ngay từ đầu. */
  defaultValue?: string;
  disabled: boolean;
  readOnly: boolean;
  /** Ref của nơi gọi. Hook trả về một ref GỘP để gắn vào `TextInput`. */
  ref?: Ref<TextInput>;
  /** Có mặt ⇒ ô CONTROLLED (ví dụ `FormInput`), nội dung suy thẳng từ đây. */
  value?: string;
}

export interface UseInputClearResult {
  /** Xoá sạch ô nhập rồi giữ lại con trỏ. Gắn vào `onPress` của nút xoá. */
  clear: () => void;
  /** ⛔ PHẢI gắn vào `ref` của `TextInput`, nếu không `clear()` không xoá được gì. */
  setRef: (node: TextInput | null) => void;
  /** Gọi trong `onChangeText` để bật/tắt nút xoá theo nội dung. */
  track: (text: string) => void;
  visible: boolean;
}

/**
 * Gắn cùng một node cho hai ref — hook giữ một bản để gọi `.clear()`, nơi gọi
 * giữ một bản để `.focus()`.
 *
 * ⚠️ Bản sao của `assignRef` trong `FormInput.tsx`, cố ý KHÔNG gom chung: đây là
 * ba dòng, còn gom lại thì `FormInput` (tầng form) phải nhập từ một file tên là
 * "clear" (tầng nút xoá) — một phụ thuộc ngược, khó đọc hơn hẳn cái nó tiết kiệm.
 */
function assignRef(target: Ref<TextInput> | undefined, node: TextInput | null) {
  if (typeof target === 'function') target(node);
  else if (target) (target as RefObject<TextInput | null>).current = node;
}

/**
 * Trạng thái của nút xoá (×) trong ô nhập.
 *
 * ── ⛔ Vì sao KHÔNG giữ nguyên văn nội dung ô trong state ────────────────────
 * `Input` cố ý cho phép dùng UNCONTROLLED (`defaultValue`), vì `value=` ghi đè
 * nội dung ngay giữa lúc bộ gõ Telex đang ghép dấu — trên Android là MẤT DẤU
 * hoặc con trỏ nhảy về đầu (`SearchInput.tsx` giải thích đầy đủ, ESLint chặn
 * cứng ca ô tìm kiếm). Nút xoá KHÔNG được phép phá hợp đồng đó.
 *
 * Nên ở đây chỉ giữ MỘT BOOLEAN "ô có chữ hay chưa", và nó không bao giờ chảy
 * ngược vào `TextInput`. React bỏ qua `setState` khi giá trị không đổi, nên biến
 * này chỉ gây vẽ lại đúng hai lần: lúc ô chuyển từ rỗng sang có chữ và ngược
 * lại — chứ không phải mỗi phím gõ. Cùng cách của `SearchInput`.
 *
 * ── Ô CONTROLLED (`FormInput`) thì lấy thẳng từ `value` ─────────────────────
 * Không thì `form.reset()` xoá giá trị mà nút × vẫn còn đó: người dùng bấm vào
 * một nút không làm gì và tưởng app đơ.
 *
 * ── ⛔ Vì sao phải có ref, không chỉ gọi `onChangeText('')` ─────────────────
 * Ô uncontrolled giữ chữ trong bộ nhớ của NATIVE. Báo cho nơi gọi biết "giá trị
 * mới là chuỗi rỗng" KHÔNG xoá được đám chữ đang hiện trên màn hình — mắt vẫn
 * thấy chữ cũ trong khi tầng lọc đã coi như ô rỗng. `.clear()` là lệnh đi thẳng
 * xuống native, đúng thứ ô uncontrolled cần.
 */
export function useInputClear(
  { clearable, defaultValue, disabled, readOnly, ref, value }: UseInputClearOptions,
  onChangeText?: (text: string) => void,
): UseInputClearResult {
  const innerRef = useRef<TextInput | null>(null);
  const [typed, setTyped] = useState((defaultValue ?? '').length > 0);

  const setRef = useCallback(
    (node: TextInput | null) => {
      innerRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const controlled = value !== undefined;

  return {
    clear: () => {
      innerRef.current?.clear();
      setTyped(false);
      onChangeText?.('');
      // Giữ bàn phím: người dùng bấm × là để gõ LẠI, không phải để thoát ô.
      // Thả focus ở đây thì bàn phím sập xuống rồi họ phải chạm thêm một lần
      // nữa — trên form 9 ô thì đó là 9 cú chạm thừa.
      innerRef.current?.focus();
    },
    setRef,
    track: (text: string) => {
      if (!clearable || controlled) return;
      setTyped(text.length > 0);
    },
    /**
     * ⛔ Ô KHOÁ và ô CHỈ ĐỌC không được có nút xoá: cả hai đều nói "nội dung này
     * không sửa được", mà một nút xoá nằm ngay trong ô lại nói ngược lại.
     */
    visible: clearable && !disabled && !readOnly && (controlled ? value.length > 0 : typed),
  };
}
