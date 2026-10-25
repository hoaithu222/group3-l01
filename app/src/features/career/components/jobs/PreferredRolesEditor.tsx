import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';

import { JOB_LIMITS } from '../../constants/recruiter.constants';
import { addRole } from '../../schemas/career-settings.schemas';

export interface PreferredRolesEditorProps {
  disabled?: boolean;
  value: string[];
  onChange: (roles: string[]) => void;
}

/** Vị trí mong muốn dạng chip (app.md §3 "chip ≤ 5"): gõ rồi "Thêm"/Enter; chạm chip để bỏ. Bỏ trùng không phân biệt hoa/thường; 2–40 ký tự mỗi vị trí. */
export function PreferredRolesEditor({ disabled, onChange, value }: PreferredRolesEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const next = addRole(value, draft);
    setError(next.error);
    if (!next.error) setDraft('');
    onChange(next.roles);
  };

  return (
    <View className="gap-xs">
      <View className="flex-row items-end gap-xs">
        <View className="flex-1">
          <Input
            disabled={disabled}
            hint={`${String(value.length)}/${String(JOB_LIMITS.preferredRolesMax)}`}
            label="Vị trí mong muốn"
            maxLength={JOB_LIMITS.preferredRoleMax}
            message={error ?? undefined}
            messageTone="error"
            placeholder="Ví dụ: Frontend Developer"
            returnKeyType="done"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
          />
        </View>
        <Button
          disabled={disabled || !draft.trim()}
          label="Thêm"
          size="md"
          variant="secondary"
          onPress={add}
        />
      </View>
      {value.length > 0 ? (
        <View className="flex-row flex-wrap gap-xs">
          {value.map((role) => (
            <Chip
              key={role}
              disabled={disabled}
              label={role}
              selected
              size="sm"
              trailing={<Icon name="cancel" size={14} />}
              onPress={() => onChange(value.filter((r) => r !== role))}
            />
          ))}
        </View>
      ) : (
        <Text className="text-caption-sm text-fg-2">
          Thêm tối đa 5 vị trí để doanh nghiệp lọc đúng người.
        </Text>
      )}
    </View>
  );
}
