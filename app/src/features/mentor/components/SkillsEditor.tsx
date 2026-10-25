import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

import { MENTOR_LIMITS } from '../constants/mentor.constants';
import { addSkill } from '../schemas/mentor.schemas';

export interface SkillsEditorProps {
  /** Lỗi cấp trường (vd "Cần ít nhất 1 kỹ năng") — hiện dưới ô. */
  error?: string | null;
  value: string[];
  onChange: (skills: string[]) => void;
}

/** Nhập kỹ năng dạng chip (app.md §3 "chip nhập ≤ 10"): gõ rồi "Thêm"/Enter; chạm chip để bỏ. Bỏ trùng không phân biệt hoa/thường. */
export function SkillsEditor({ error, onChange, value }: SkillsEditorProps) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const add = () => {
    const next = addSkill(value, draft);
    setLocalError(next.error);
    if (!next.error) setDraft('');
    onChange(next.skills);
  };

  return (
    <View className="gap-xs">
      <View className="flex-row items-end gap-xs">
        <View className="flex-1">
          <Input
            hint={`${value.length}/${MENTOR_LIMITS.skillsMax}`}
            label="Kỹ năng cần"
            maxLength={MENTOR_LIMITS.skillMax}
            message={localError ?? error ?? undefined}
            messageTone="error"
            placeholder="Ví dụ: React Native"
            required
            returnKeyType="done"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
          />
        </View>
        <Button disabled={!draft.trim()} label="Thêm" size="md" variant="secondary" onPress={add} />
      </View>
      {value.length > 0 ? (
        <View className="flex-row flex-wrap gap-xs">
          {value.map((skill) => (
            <Chip
              key={skill}
              label={skill}
              selected
              size="sm"
              trailing={<Icon name="cancel" size={14} />}
              onPress={() => onChange(value.filter((s) => s !== skill))}
            />
          ))}
        </View>
      ) : (
        <Text className="text-caption-sm text-fg-2">
          Thêm ít nhất 1 kỹ năng để cố vấn phù hợp tìm thấy bài.
        </Text>
      )}
    </View>
  );
}
