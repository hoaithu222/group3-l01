import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import { RadioGroupContext } from './radio-context';

export interface RadioGroupProps {
  /** Nhãn của cả nhóm cho trình đọc màn hình ("Phương thức nhận tiền"). */
  accessibilityLabel?: string;
  /** Các `<Radio>` con. Đặt sâu bao nhiêu tầng cũng được — nối bằng context. */
  children: ReactNode;
  className?: string;
  onChange: (value: string) => void;
  /** Giá trị đang chọn. `undefined` = chưa chọn gì. */
  value: string | undefined;
}

/**
 * Nhóm chọn một trong nhiều.
 *
 * ```tsx
 * <RadioGroup accessibilityLabel="Kỳ hạn" value={term} onChange={setTerm}>
 *   <Radio label="1 tháng" value="1m" />
 *   <Radio label="3 tháng" value="3m" />
 * </RadioGroup>
 * ```
 *
 * ⚠️ Nhóm KHÔNG tự giữ state. Giá trị đang chọn gần như luôn là một phần của
 * form (react-hook-form) hoặc của state màn hình; để component tự giữ thêm một
 * bản nữa là có hai nguồn sự thật, và chúng lệch nhau ngay lần đầu form reset.
 */
export function RadioGroup({
  accessibilityLabel,
  children,
  className,
  onChange,
  value,
}: RadioGroupProps) {
  /**
   * ⛔ `useMemo` không phải để "cho nhanh": không có nó thì object context là
   * một tham chiếu MỚI ở mỗi lần cha vẽ lại, và MỌI `Radio` con vẽ lại theo —
   * kể cả nhóm 20 kỳ hạn nằm trong danh sách cuộn.
   */
  const context = useMemo(() => ({ onChange, value }), [onChange, value]);

  return (
    <RadioGroupContext.Provider value={context}>
      <View
        accessibilityLabel={accessibilityLabel}
        /**
         * ⛔ Đừng đặt `accessible` cho khung này: nó gộp mọi `Radio` con thành
         * MỘT phần tử và người dùng khiếm thị hết đường bấm từng lựa chọn.
         * `radiogroup` chỉ để trình đọc màn hình đọc thêm câu "nhóm N lựa chọn".
         */
        accessibilityRole="radiogroup"
        className={cn('gap-4', className)}
      >
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
}
