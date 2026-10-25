import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ScanMode } from '../api/plagiarism.types';

interface ScanModeSelectorProps {
  onChange: (mode: ScanMode) => void;
  value: ScanMode;
}

const MODES: readonly { description: string; label: string; value: ScanMode }[] = [
  {
    description: 'So các tệp bạn chọn với nhau (cần ít nhất 2 tệp)',
    label: 'Trong các tệp đã chọn',
    value: 'WITHIN_SELECTION',
  },
  {
    description: 'So mỗi tệp đã chọn với mọi tài liệu khác trong nhóm',
    label: 'Toàn bộ tài liệu nhóm',
    value: 'WORKSPACE',
  },
];

/**
 * Chọn chế độ so sánh (app.md `ScanModeSelector`, be.md `PlagiarismScanMode`).
 *
 * ⚠️ Mô tả thụt `pl-8` (32dp) = vòng radio 24 + khe `gap-2` 8 của `Radio` ⇒ thẳng cột với NHÃN, không lệch như `pl-lg`
 * (20) cũ. Chữ mô tả `fg-2` — `fg-3` chỉ 2.96:1, không đọc được trên thẻ trắng.
 */
export function ScanModeSelector({ onChange, value }: ScanModeSelectorProps) {
  return (
    <Card>
      <RadioGroup
        accessibilityLabel="Chế độ so sánh"
        value={value}
        onChange={(next) => {
          hapticSelection();
          onChange(next as ScanMode);
        }}
      >
        <View className="gap-md">
          {MODES.map((mode) => (
            <View key={mode.value} className="gap-2xs">
              <Radio label={mode.label} value={mode.value} />
              <Text className="pl-8 text-body-md text-fg-2">{mode.description}</Text>
            </View>
          ))}
        </View>
      </RadioGroup>
    </Card>
  );
}
