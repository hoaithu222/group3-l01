import { useCallback, useState } from 'react';

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

/**
 * State đồng bộ xuống `localStorage`.
 *
 * Ba điểm dễ sai đã xử lý ở đây:
 *
 * 1. **Cập nhật không bị mất.** Giá trị mới luôn tính từ `prev` của React chứ
 *    KHÔNG từ biến `storedValue` bắt trong closure. Bản trước dùng closure nên
 *    hai lời gọi `setValue(v => v + 1)` trong cùng một tick đều đọc CÙNG một
 *    giá trị cũ — lần đầu bị nuốt.
 *
 * 2. **Hết chỗ lưu không làm sập giao diện.** `setItem` ném `QuotaExceededError`
 *    khi đầy, và ném thẳng ở chế độ riêng tư của Safari. Nhánh đọc vốn đã có
 *    `try/catch`, nhánh ghi thì chưa — nên lỗi bay lên tận component.
 *
 * 3. **`setValue` giữ nguyên danh tính.** Deps cũ có `storedValue` nên hàm đổi
 *    sau mỗi lần set, làm hỏng `memo` của mọi component con nhận nó.
 *
 * Ghi vào kho nằm TRONG updater để "set xong là đã lưu" — đúng thứ nơi gọi
 * mong đợi. StrictMode ở môi trường phát triển gọi updater hai lần, nhưng cả
 * hai lần ghi cùng một chuỗi byte nên vô hại.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, SetValue<T>, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      // Giá trị hỏng (JSON sai) hoặc trình duyệt chặn kho lưu.
      return initialValue;
    }
  });

  const setValue: SetValue<T> = useCallback(
    (value) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(key, JSON.stringify(next));
          } catch {
            // Hết quota / chế độ riêng tư: giữ giá trị trong bộ nhớ, bỏ ghi đĩa.
          }
        }
        return next;
      });
    },
    [key],
  );

  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Như trên — không có gì để chữa, và không đáng làm sập giao diện.
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
