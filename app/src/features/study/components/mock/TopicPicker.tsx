import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';

import { MOCK_TAGS_MAX, type TopicCount } from '../../utils/mock-setup-utils';

export interface TopicPickerProps {
  selected: readonly string[];
  topics: readonly TopicCount[];
  onChange: (tags: string[]) => void;
}

/**
 * Chọn chủ đề cho đề thi (tuỳ chọn): chip nhiều lựa chọn kèm số câu của từng chủ đề, "Tất cả chủ đề" (mặc định = không lọc).
 * BE chỉ nhận tối đa 5 chủ đề (`createAttemptSchema.tags.max(5)`) — đủ 5 thì các chip còn lại khoá và có dòng chữ giải thích.
 */
export function TopicPicker({ onChange, selected, topics }: TopicPickerProps) {
  const full = selected.length >= MOCK_TAGS_MAX;
  return (
    <View className="gap-xs">
      <View className="flex-row flex-wrap gap-xs">
        <Chip
          label="Tất cả chủ đề"
          role="checkbox"
          selected={selected.length === 0}
          onPress={() => onChange([])}
        />
        {topics.map(({ count, tag }) => {
          const on = selected.includes(tag);
          return (
            <Chip
              key={tag}
              disabled={!on && full}
              label={`${tag} · ${count}`}
              role="checkbox"
              selected={on}
              onPress={() => onChange(on ? selected.filter((t) => t !== tag) : [...selected, tag])}
            />
          );
        })}
      </View>
      {full ? (
        <Text className="text-caption-lg text-fg-2">{`Chọn tối đa ${MOCK_TAGS_MAX} chủ đề.`}</Text>
      ) : null}
    </View>
  );
}
