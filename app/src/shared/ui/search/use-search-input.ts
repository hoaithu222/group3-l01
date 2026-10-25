import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { SearchInputHandle } from './SearchInput';

/**
 * Nhịp chờ mặc định giữa phím cuối và lượt lọc.
 *
 * 300ms là mức quen thuộc: đủ dài để một người gõ nhanh không kích hoạt lọc
 * giữa chừng, đủ ngắn để danh sách không có cảm giác trễ.
 */
export const SEARCH_DEBOUNCE_MS = 300;

export interface UseSearchInputOptions {
  /** Nhịp chờ, ms. Đặt `0` để lọc ngay (danh sách nhỏ, lọc trong bộ nhớ). */
  delay?: number;
  /** Nội dung có sẵn lúc mở màn hình — ví dụ từ khoá lấy lại từ URL. */
  initialValue?: string;
}

export interface UseSearchInputResult {
  /** Xoá ô nhập VÀ từ khoá lọc ngay lập tức, không đợi hết nhịp chờ. */
  clear: () => void;
  /** Trải thẳng vào `<SearchInput {...inputProps} />`. */
  inputProps: {
    defaultValue: string;
    ref: RefObject<SearchInputHandle | null>;
    onChangeText: (text: string) => void;
  };
  /** Từ khoá ĐÃ qua nhịp chờ — dùng để lọc, không phải để hiển thị trong ô. */
  value: string;
}

/**
 * Nối ô tìm kiếm với tầng lọc mà KHÔNG biến ô nhập thành controlled.
 *
 * ── ⛔ Vì sao không `useState` thẳng trên `value` của ô nhập ─────────────────
 * `<TextInput value={search} onChangeText={setSearch}>` ghi ĐÈ nội dung ô mỗi
 * lần state đổi. Khi state đi qua một nhịp bất đồng bộ (chính là debounce ở
 * đây), cú ghi đè rơi đúng vào lúc bộ gõ Telex đang ghép dấu: trên Android chữ
 * MẤT DẤU hoặc con trỏ nhảy về đầu. Người dùng gõ "Đà Nẵng" ra "Da Nang" rồi
 * kết luận "tìm kiếm hỏng".
 *
 * Ở đây ô nhập giữ chữ của chính nó (`defaultValue`, uncontrolled) và hook chỉ
 * mang RA một bản sao đã trễ nhịp cho tầng lọc. Hai chiều không bao giờ gặp
 * nhau, nên không có cú ghi đè nào.
 *
 * ⚠️ Nhớ bọc phép lọc trong `useMemo` theo `value` — nếu không thì mỗi lần vẽ
 * lại đều lọc lại cả danh sách và ô nhập giật khi gõ trên máy yếu.
 *
 * @example
 *   const search = useSearchInput();
 *   const rows = useMemo(() => filterRows(data, search.value), [data, search.value]);
 *   <SearchInput {...search.inputProps} />
 */
export function useSearchInput({
  delay = SEARCH_DEBOUNCE_MS,
  initialValue = '',
}: UseSearchInputOptions = {}): UseSearchInputResult {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<SearchInputHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * ⛔ Dọn hẹn giờ khi component rời màn hình. Thiếu bước này thì `setValue`
   * chạy trên một component đã tháo — React 19 không còn cảnh báo, nhưng lượt
   * lọc vẫn tốn công vô ích và giữ lại tham chiếu tới cả danh sách cũ.
   */
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChangeText = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      if (delay <= 0) {
        setValue(text);
        return;
      }
      timer.current = setTimeout(() => setValue(text), delay);
    },
    [delay],
  );

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    ref.current?.clear();
    setValue('');
  }, []);

  const inputProps = useMemo(
    () => ({ defaultValue: initialValue, onChangeText: handleChangeText, ref }),
    [handleChangeText, initialValue],
  );

  return { clear, inputProps, value };
}
