import { useState } from 'react';
import { Text } from 'react-native';

import { Input, type InputProps } from '@/shared/ui/input';

import { bpsToPercentText, percentTextToBps } from '../domain/percent';

export interface PercentFieldProps extends Pick<
  InputProps,
  'accessibilityLabel' | 'className' | 'disabled' | 'size'
> {
  /** Basis points (1% = 100); `null` = ô trống. Chỉ là giá trị KHỞI TẠO — sau đó ô tự giữ chữ đang gõ. */
  initialBps: number | null;
  onChange: (bps: number | null) => void;
}

/**
 * Ô nhập PHẦN TRĂM (tối đa 2 chữ số thập phân) đổi ra basis points.
 *
 * ⚠️ Giữ CHỮ đang gõ trong state của chính ô, không ghi ngược từ `bps`: gõ "33,"
 * (chưa tới phần thập phân) mà ô ghi lại `bpsToPercentText(3300)` = "33" thì dấu
 * phẩy biến mất và không gõ nổi "33,5". Cha muốn đặt lại giá trị (nút "Chia đều")
 * thì đổi `key` để ô dựng lại từ `initialBps` — không dùng effect đồng bộ (lint
 * `set-state-in-effect` chặn, và nó cũng đánh nhau với người đang gõ).
 */
export function PercentField({ initialBps, onChange, ...inputProps }: PercentFieldProps) {
  const [text, setText] = useState(() => bpsToPercentText(initialBps));

  return (
    <Input
      {...inputProps}
      inputMode="decimal"
      keyboardType="decimal-pad"
      placeholder="0"
      trailing={<Text className="text-label-lg text-fg-2">%</Text>}
      value={text}
      onChangeText={(next) => {
        const cleaned = next.replace(/[^\d.,]/g, '');
        setText(cleaned);
        onChange(percentTextToBps(cleaned));
      }}
    />
  );
}
