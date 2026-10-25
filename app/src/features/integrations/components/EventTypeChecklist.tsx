import { View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import { hapticSelection } from '@/shared/utils/haptics';

import { EVENT_TYPE_LABELS } from '../utils/integration-labels';

export interface EventTypeChecklistProps {
  /** Loại sự kiện nhà cung cấp hỗ trợ (`supportedEvents` từ BE). */
  supported: string[];
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/** Chọn loại sự kiện đăng vào kênh (app.md §2). Giữ THỨ TỰ của `supported` để lần lưu sau không đổi dạng vô cớ. */
export function EventTypeChecklist({
  supported,
  value,
  disabled,
  onChange,
}: EventTypeChecklistProps) {
  const selected = new Set(value);
  return (
    <View className="gap-xs">
      {supported.map((type) => (
        <Checkbox
          key={type}
          checked={selected.has(type)}
          disabled={disabled}
          label={EVENT_TYPE_LABELS[type] ?? type}
          // Rung "đổi lựa chọn" — tick/bỏ tick một loại sự kiện là thay đổi lựa chọn trong nhóm.
          onChange={(next) => {
            hapticSelection();
            onChange(supported.filter((t) => (t === type ? next : selected.has(t))));
          }}
        />
      ))}
    </View>
  );
}
