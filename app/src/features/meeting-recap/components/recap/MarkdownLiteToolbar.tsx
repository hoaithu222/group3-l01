import { ScrollView } from 'react-native';

import { Button } from '@/shared/ui/button';
import { KeyboardBar } from '@/shared/ui/keyboard';

import type { RecapFormat } from '../../utils/markdown-insert.utils';

const TOOLS: { accessibilityLabel: string; kind: RecapFormat; label: string }[] = [
  { accessibilityLabel: 'In đậm', kind: 'bold', label: 'Đậm' },
  { accessibilityLabel: 'In nghiêng', kind: 'italic', label: 'Nghiêng' },
  { accessibilityLabel: 'Danh sách', kind: 'list', label: '• Danh sách' },
  { accessibilityLabel: 'Việc cần làm', kind: 'todo', label: '☐ Việc cần làm' },
  { accessibilityLabel: 'Tiêu đề nhỏ', kind: 'heading', label: 'Tiêu đề' },
];

/**
 * Thanh chèn nhanh markdown-lite của trình soạn biên bản (app.md §3/§7): nằm TRÊN bàn phím (`KeyboardBar` — không bị bàn phím che, không
 * cộng vùng an toàn đáy), cuộn ngang khi máy hẹp. Nút có CHỮ ("Đậm", "Việc cần làm") thay vì ký hiệu trần — người dùng không biết markdown.
 * Việc chèn là hàm thuần `applyRecapFormat` do màn gọi (IME-safe: chỉ chạy khi bấm nút, trên chữ `onChangeText` đã giao).
 */
export function MarkdownLiteToolbar({ onFormat }: { onFormat: (kind: RecapFormat) => void }) {
  return (
    <KeyboardBar
      leading={
        <ScrollView
          contentContainerClassName="gap-xs"
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {TOOLS.map((tool) => (
            <Button
              key={tool.kind}
              accessibilityLabel={tool.accessibilityLabel}
              label={tool.label}
              size="sm"
              variant="secondary"
              onPress={() => onFormat(tool.kind)}
            />
          ))}
        </ScrollView>
      }
    />
  );
}
