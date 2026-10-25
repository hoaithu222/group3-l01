import { Text, View } from 'react-native';

import { Radio, RadioGroup } from '@/shared/ui/radio';

import { FILL_MATCH_MODES, type FillMatchMode } from '../../api/study.types';
import { MATCH_MODE_LABELS } from '../../constants/study.constants';

/** Ví dụ ngắn cho từng cách so khớp — người soạn thấy ngay "Hà Nội" có chấp nhận "ha noi" không, khỏi phải đoán từ tên chế độ. */
const MATCH_MODE_EXAMPLES: Record<FillMatchMode, string> = {
  EXACT: 'Phải giống từng ký tự: "Hà Nội" ≠ "hà nội".',
  IGNORE_ACCENTS: 'Chấp nhận "ha noi", "HÀ NỘI" cho đáp án "Hà Nội".',
  IGNORE_CASE: 'Chấp nhận "hà nội" cho đáp án "Hà Nội", nhưng vẫn phải đủ dấu.',
};

export interface MatchModeFieldProps {
  value: FillMatchMode;
  onChange: (mode: FillMatchMode) => void;
}

/** Cách so khớp đáp án điền chỗ trống: ba lựa chọn, mỗi lựa chọn kèm ví dụ một dòng. */
export function MatchModeField({ onChange, value }: MatchModeFieldProps) {
  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Cách so khớp</Text>
      <RadioGroup
        accessibilityLabel="Cách so khớp đáp án"
        value={value}
        onChange={(mode) => onChange(mode as FillMatchMode)}
      >
        {FILL_MATCH_MODES.map((mode) => (
          <View key={mode} className="min-h-[44px] justify-center gap-3xs py-2xs">
            <Radio label={MATCH_MODE_LABELS[mode]} value={mode} />
            <Text className="pl-8 text-caption-sm text-fg-2">{MATCH_MODE_EXAMPLES[mode]}</Text>
          </View>
        ))}
      </RadioGroup>
    </View>
  );
}
