import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { SearchInputHandle } from '@/shared/ui/search';

import { WORKSPACE_SEARCH_DEBOUNCE_MS } from '../constants/workspace-search.constants';

export interface UseSearchTextInputOptions {
  /** Nhịp chờ sau phím cuối, ms — mặc định 300 (app.md p5-04 §2). */
  delay?: number;
  /** Từ khoá có sẵn lúc mở màn (`?q=`). */
  initialValue?: string;
}

export interface UseSearchTextInputResult {
  /** Điền một từ khoá vào ô (chạm mục "tìm gần đây") và tìm NGAY, không đợi nhịp chờ. */
  apply: (term: string) => void;
  /** Trải vào `<SearchInput key={inputKey} {...inputProps} />` — ⛔ `key` phải viết riêng, không nằm trong `inputProps`. */
  inputKey: number;
  inputProps: {
    defaultValue: string;
    ref: RefObject<SearchInputHandle | null>;
    onChangeText: (text: string) => void;
    onSubmitEditing: (event: { nativeEvent: { text: string } }) => void;
  };
  /** Chốt từ khoá NGAY (nhấn "Tìm" trên bàn phím). */
  submit: (text: string) => void;
  /** Từ khoá ĐÃ qua nhịp chờ — để tìm, không phải để hiển thị trong ô. */
  value: string;
}

/**
 * Nối ô tìm với tầng tìm mà KHÔNG biến ô thành controlled (IME-safe, app.md p5-04 §4).
 *
 * ── ⛔ Vì sao không `useState` thẳng trên `value` của ô nhập ─────────────────
 * `<TextInput value={q} onChangeText={setQ}>` mà `q` đi qua một nhịp bất đồng bộ (debounce) sẽ ghi ĐÈ nội dung ô đúng lúc
 * bộ gõ Telex đang ghép dấu: trên Android chữ MẤT DẤU hoặc con trỏ nhảy về đầu ("Đà Nẵng" ra "Da Nang"). Ô ở đây giữ chữ
 * của chính nó (`defaultValue`), hook chỉ mang RA một bản sao đã trễ nhịp; hai chiều không bao giờ gặp nhau.
 *
 * ── Điền chữ từ ngoài (`apply`) ──────────────────────────────────────────────
 * `useSearchInput` chung không cho đặt chữ (ô uncontrolled). Ở đây điền bằng cách DỰNG LẠI ô với `defaultValue` mới
 * (`inputKey` đổi) — vẫn không có cú ghi đè nào lên ô đang gõ vì chỉ xảy ra khi người dùng chạm mục gợi ý, không phải
 * giữa lúc gõ. Ô mới không tự lấy focus (app.md §7: "không tự mở bàn phím lại").
 */
export function useSearchTextInput({
  delay = WORKSPACE_SEARCH_DEBOUNCE_MS,
  initialValue = '',
}: UseSearchTextInputOptions = {}): UseSearchTextInputResult {
  const [value, setValue] = useState(initialValue);
  const [seed, setSeed] = useState({ key: 0, text: initialValue });
  const ref = useRef<SearchInputHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ⛔ Dọn hẹn giờ khi rời màn: `setValue` chạy trên component đã tháo là lượt tìm vô ích tốn hạn mức.
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChangeText = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      // Xoá sạch ô: hiện "tìm gần đây" ngay, không để kết quả cũ nằm lại thêm một nhịp.
      if (delay <= 0 || text.length === 0) {
        setValue(text);
        return;
      }
      timer.current = setTimeout(() => setValue(text), delay);
    },
    [delay],
  );

  const submit = useCallback((text: string) => {
    clearTimeout(timer.current);
    setValue(text);
  }, []);

  const apply = useCallback((term: string) => {
    clearTimeout(timer.current);
    setSeed((prev) => ({ key: prev.key + 1, text: term }));
    setValue(term);
  }, []);

  const onSubmitEditing = useCallback(
    (event: { nativeEvent: { text: string } }) => submit(event.nativeEvent.text),
    [submit],
  );

  const inputProps = useMemo(
    () => ({ defaultValue: seed.text, onChangeText, onSubmitEditing, ref }),
    [seed.text, onChangeText, onSubmitEditing],
  );

  return { apply, inputKey: seed.key, inputProps, submit, value };
}
