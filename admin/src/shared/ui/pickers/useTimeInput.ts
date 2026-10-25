import { useCallback, useEffect, useRef, useState } from 'react';
import { isCompleteDigitEntry, parseTimeInput, shouldReportWhileTyping } from './parse-time.utils';

/**
 * useTimeInput — toàn bộ hành vi GÕ TAY của `TimePicker`.
 *
 * Ba đường chốt giá trị, cố ý KHÁC nhau:
 *
 * | Lúc nào | Validate | Lưu | Ghi lại chữ trong ô | Đóng panel |
 * |---------|----------|-----|---------------------|------------|
 * | Đang gõ | chỉ lỗi không thể cứu bằng cách gõ thêm | không | chỉ khi đủ 4 chữ số | không |
 * | Dừng gõ (debounce) | ĐẦY ĐỦ | có | **KHÔNG** | không |
 * | Enter / rời ô | ĐẦY ĐỦ | có | có (dạng chuẩn) | có |
 *
 * ⛔ Nhánh debounce TUYỆT ĐỐI không được ghi lại chữ trong ô. Người dùng có thể
 * dừng giữa chừng vì đang nghĩ: gõ `9`, ngập ngừng, nếu ô tự thành `09:00` thì
 * hai ký tự `30` gõ tiếp sau đó rơi vào `09:0030` — hỏng đúng lúc họ đang gõ dở.
 * Lưu thì cứ lưu, còn chữ trong ô vẫn là thứ họ gõ cho tới khi rời ô.
 */
interface UseTimeInputOptions {
  /** Ghi giá trị đã chốt ("HH:mm" hoặc `null` = xoá) ra ngoài. */
  onCommit: (value: string | null) => void;
  /** Số ms im lặng thì coi như gõ xong → validate + lưu. `0` = tắt debounce. */
  commitDelay: number;
  /** Gọi khi người dùng chốt HẲN (Enter / rời ô) — dùng để đóng panel. */
  onSettled: () => void;
  /** Đẩy message lỗi ra ngoài để form hiện dưới field. `null` = hợp lệ. */
  onParseError?: (message: string | null) => void;
}

interface UseTimeInputResult {
  /** Message lỗi hiện hành, `null` khi hợp lệ. */
  parseError: string | null;
  /** Huỷ hẹn giờ đang chờ + xoá cờ lỗi — gọi khi chọn từ danh sách / bấm xoá. */
  reset: () => void;
  handleInputChange: (raw: string) => string | void;
  handleInputCommit: (raw: string) => string | void;
}

export function useTimeInput({
  onCommit,
  commitDelay,
  onSettled,
  onParseError,
}: UseTimeInputOptions): UseTimeInputResult {
  const [parseError, setParseError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Hẹn giờ bắn SAU khi component đã render lại nhiều lần → đọc callback qua ref
  // để luôn gọi bản mới nhất, tránh giữ closure cũ của lần render lúc đặt hẹn.
  const latest = useRef({ onCommit, onSettled, onParseError });
  useEffect(() => {
    latest.current = { onCommit, onSettled, onParseError };
  });

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const report = useCallback((message: string | null) => {
    setParseError(message);
    latest.current.onParseError?.(message);
  }, []);

  const cancelPending = useCallback(() => clearTimeout(timerRef.current), []);

  const reset = useCallback(() => {
    cancelPending();
    report(null);
  }, [cancelPending, report]);

  /** Chốt giá trị: validate ĐẦY ĐỦ, sai thì báo lỗi và giữ nguyên giá trị cũ. */
  const commit = useCallback(
    (raw: string): string | undefined => {
      const res = parseTimeInput(raw);
      if (!res.ok) {
        report(res.message);
        return undefined;
      }
      latest.current.onCommit(res.value);
      report(null);
      return res.value ?? '';
    },
    [report],
  );

  const handleInputChange = useCallback(
    (raw: string) => {
      const res = parseTimeInput(raw);
      // Đang gõ thì im lặng với lỗi còn cứu được: gõ `930` bắt buộc đi qua `93`
      // (= 93 giờ), báo đỏ ở đó là nháy đỏ giữa lúc người dùng gõ đúng.
      report(res.ok || !shouldReportWhileTyping(raw) ? null : res.message);

      cancelPending();
      // Dừng gõ đủ lâu = gõ xong → validate đầy đủ + lưu. KHÔNG lấy giá trị trả
      // về của `commit` (xem chú thích đầu file: không ghi lại chữ trong ô).
      if (commitDelay > 0) {
        timerRef.current = setTimeout(() => void commit(raw), commitDelay);
      }

      // Đủ 4 chữ số là đọc được chắc chắn → chèn dấu hai chấm ngay lúc gõ.
      if (res.ok && res.value && isCompleteDigitEntry(raw)) return res.value;
    },
    [cancelPending, commit, commitDelay, report],
  );

  const handleInputCommit = useCallback(
    (raw: string) => {
      cancelPending();
      const normalized = commit(raw);
      // Sai cú pháp → giữ panel mở để người dùng đọc lỗi và sửa tiếp.
      if (normalized === undefined) return;
      latest.current.onSettled();
      return normalized;
    },
    [cancelPending, commit],
  );

  return { parseError, reset, handleInputChange, handleInputCommit };
}
