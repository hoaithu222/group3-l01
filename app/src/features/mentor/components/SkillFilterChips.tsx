import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { hapticSelection } from '@/shared/utils/haptics';

import { addSkill } from '../schemas/mentor.schemas';

export interface SkillFilterChipsProps {
  /** Kỹ năng gợi ý (lấy từ các bài đang hiện) — chạm để thêm vào bộ lọc. */
  suggestions: string[];
  value: string[];
  onChange: (skills: string[]) => void;
}

/**
 * Bộ lọc kỹ năng (app.md §3): chip đang chọn (chạm để bỏ) + chip gợi ý + ô nhập kỹ năng khác. Lọc ở SERVER — bài phải có
 * ĐỦ mọi kỹ năng đã chọn (`GET /mentor/posts?skills=`). `role="checkbox"` để trình đọc màn hình đọc "đã chọn".
 */
export function SkillFilterChips({ onChange, suggestions, value }: SkillFilterChipsProps) {
  const [draft, setDraft] = useState('');
  const picked = new Set(value.map((s) => s.toLowerCase()));
  const extra = suggestions.filter((s) => !picked.has(s.toLowerCase())).slice(0, 8);

  // Bật/tắt một kỹ năng = đổi lựa chọn của bộ lọc ⇒ nhịp rung "chọn" (danh sách tải lại sau một nhịp debounce, rung báo cú chạm đã nhận).
  const toggle = (skill: string) => {
    hapticSelection();
    onChange(
      picked.has(skill.toLowerCase())
        ? value.filter((s) => s.toLowerCase() !== skill.toLowerCase())
        : addSkill(value, skill).skills,
    );
  };
  const submitDraft = () => {
    onChange(addSkill(value, draft).skills);
    setDraft('');
  };

  return (
    <View className="gap-xs">
      <ScrollView
        contentContainerClassName="gap-xs px-md"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {value.map((skill) => (
          <Chip
            key={`on-${skill}`}
            label={skill}
            role="checkbox"
            selected
            size="sm"
            trailing={<Icon name="cancel" size={14} />}
            onPress={() => toggle(skill)}
          />
        ))}
        {/* Dấu "+" trước chip gợi ý: nói rằng chạm là THÊM vào bộ lọc (chip đang chọn có "✕" để bỏ) — hai nhóm chip không lẫn nhau. */}
        {extra.map((skill) => (
          <Chip
            key={`sg-${skill}`}
            label={skill}
            leading={<Icon color="fg-2" name="add" size={14} />}
            role="checkbox"
            selected={false}
            size="sm"
            onPress={() => toggle(skill)}
          />
        ))}
      </ScrollView>
      <View className="flex-row items-center gap-xs px-md">
        <View className="flex-1">
          <Input
            accessibilityLabel="Thêm kỹ năng để lọc"
            placeholder="Thêm kỹ năng, ví dụ React"
            returnKeyType="done"
            size="sm"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitDraft}
          />
        </View>
        <Button
          disabled={!draft.trim()}
          label="Lọc"
          size="md"
          variant="secondary"
          onPress={submitDraft}
        />
      </View>
    </View>
  );
}
