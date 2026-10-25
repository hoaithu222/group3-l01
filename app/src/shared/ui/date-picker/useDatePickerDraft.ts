import { useState } from 'react';

import type { DatePickerProps, DateRange } from './date-picker.types';
import { toDay, toLocalDate } from './date-picker.utils';

/** Khoảng rỗng dùng lại — mỗi lần mở lịch không tạo thêm object mới. */
const EMPTY_RANGE: DateRange = { end: null, start: null };

/**
 * Trạng thái mở/đóng và BẢN NHÁP của `DatePicker`.
 *
 * Tách khỏi `DatePicker.tsx` để file component giữ dưới 200 dòng
 * (`src/shared/ui/AGENTS.md`), và vì phần "khi nào `onChange` được gọi" là chỗ
 * dễ sai nhất của cả nhóm — gom lại một chỗ thì đọc được cả ba nhịp cùng lúc:
 *
 *  · `single` (mặc định) — bấm ngày là gọi `onChange` NGAY rồi đóng tấm. Figma:
 *    "Chọn ngày đồng thời close bottom sheet".
 *  · `single` + `confirm` — chạy trên bản nháp, chỉ "Áp dụng" mới báo ra ngoài.
 *    Đây là mẫu "Button ÁP DỤNG: optional" mà Design Note của nhóm ① cho phép.
 *  · `range` — luôn chạy trên bản nháp: giữa hai nhịp, khoảng mới có MỘT đầu;
 *    bắn ra lúc đó là màn hình cha gọi API với dữ liệu nửa vời.
 *
 * ⚠️ Mọi nhánh đều kiểm `props.mode` TẠI CHỖ chứ không qua một biến `isRange`:
 * TypeScript chỉ thu hẹp được union phân biệt khi so sánh trực tiếp trên
 * `props`, qua biến trung gian thì `onChange` mất kiểu.
 */
export function useDatePickerDraft(props: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(EMPTY_RANGE);
  /** Bản nháp của chế độ một ngày — CHỈ dùng khi `confirm`. */
  const [singleDraft, setSingleDraft] = useState<Date | null>(null);

  const isRange = props.mode === 'range';
  const confirmSingle = props.mode !== 'range' && (props.confirm ?? false);

  return {
    /** Chế độ một ngày CÓ bật nút "Áp dụng". */
    confirmSingle,
    draft,
    isRange,
    open,
    setDraft,
    setSingleDraft,
    singleDraft,
    close: () => setOpen(false),

    openSheet: () => {
      /* Nạp lại bản nháp từ giá trị đang có MỖI LẦN mở: lần trước người dùng có
         thể đã bấm vài ngày rồi đóng bằng ✕ — những cú bấm đó phải mất đi. */
      if (props.mode === 'range') setDraft(props.value ?? EMPTY_RANGE);
      else {
        const current = toDay(props.value);
        setSingleDraft(current ? toLocalDate(current) : null);
      }
      setOpen(true);
    },

    /** Nút "Áp dụng" — chốt bản nháp rồi đóng. */
    confirm: () => {
      if (props.mode === 'range') {
        if (draft.start && draft.end) props.onChange?.(draft);
      } else if (singleDraft) props.onChange?.(singleDraft);
      setOpen(false);
    },

    /** Nhịp "bấm ngày là xong" của chế độ một ngày KHÔNG bật `confirm`. */
    pickSingle: (value: Date) => {
      if (props.mode !== 'range') props.onChange?.(value);
      setOpen(false);
    },
  };
}
