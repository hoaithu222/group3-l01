import { useState } from 'react';

import { applyRecapFormat, type RecapFormat, type TextSelection } from '../utils/markdown-insert.utils';

/**
 * Vùng chọn của ô soạn biên bản + thao tác chèn cú pháp (thanh `MarkdownLiteToolbar`). Tách khỏi ô soạn vì thanh công cụ PHẢI nằm ngoài
 * vùng cuộn (`KeyboardBar` bám bàn phím — đặt trong `ScrollView` là trôi theo nội dung). Chèn dựa trên vùng chọn cuối cùng ô báo
 * (`onSelectionChange`), rồi ép vùng chọn MỘT lần (`forced`) để con trỏ đứng đúng chỗ; lần báo kế tiếp của ô trả quyền lại cho người dùng.
 */
export function useMarkdownFormatting(value: string, onChange: (next: string) => void) {
  const [selection, setSelection] = useState<TextSelection>({ end: value.length, start: value.length });
  const [forced, setForced] = useState<TextSelection>();

  return {
    forced,
    format: (kind: RecapFormat) => {
      const result = applyRecapFormat(value, selection, kind);
      onChange(result.text);
      setSelection(result.selection);
      setForced(result.selection);
    },
    onSelectionChange: (next: TextSelection) => {
      setSelection(next);
      setForced(undefined);
    },
  };
}

export type MarkdownFormatting = ReturnType<typeof useMarkdownFormatting>;
