import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook input search an toàn với IME (Telex/VNI tiếng Việt, IME Nhật/Hàn/Trung).
 *
 * Vì sao cần: input controlled (`value` + `onChange`) bị bug IME — mỗi keystroke
 * `setState` → React re-render → React ghi lại `value` xuống DOM → cắt ngang
 * composition của IME → mất dấu / lặp ký tự (vd: gõ "dự" thành "dư·ự").
 *
 * Cách giải quyết: input uncontrolled (`defaultValue` + `ref`). Trong khi compose,
 * React KHÔNG đụng DOM `value` → IME hoạt động bình thường. Chỉ commit ra parent
 * (gọi `onChange`) khi: (1) keystroke ASCII không qua IME, hoặc (2) `compositionEnd`
 * sau khi IME ghép xong dấu. Khi `value` từ parent đổi vì lý do ngoài (reset filter,
 * URL navigate), sync ngược qua imperative ref — bỏ qua nếu đang compose.
 *
 * @example
 * const { inputProps, clear } = useImeSafeSearchInput(search, setSearch);
 * <Input {...inputProps} placeholder="Tìm…" />
 * {search && <button onClick={clear}>×</button>}
 */
export function useImeSafeSearchInput(value: string, onChange: (next: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  // Sync parent → DOM khi value đổi từ ngoài (reset, URL nav). Skip khi compose.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || isComposingRef.current) return;
    if (el.value !== value) el.value = value;
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isComposingRef.current) return;
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      onChange((e.target as HTMLInputElement).value);
    },
    [onChange],
  );

  const clear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    onChange('');
  }, [onChange]);

  return {
    inputProps: {
      ref: inputRef,
      defaultValue: value,
      onChange: handleChange,
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
    },
    clear,
  };
}
