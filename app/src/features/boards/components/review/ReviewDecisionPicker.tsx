import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { ReviewDecision } from '../../api/reviews.types';

export interface ReviewDecisionPickerProps {
  disabled?: boolean;
  value: ReviewDecision | null;
  onChange: (decision: ReviewDecision) => void;
}

const OPTIONS: { description: string; icon: 'checkmark-circle' | 'edit'; label: string; value: ReviewDecision }[] = [
  { description: 'Thẻ đạt yêu cầu, tính vào số lượt duyệt.', icon: 'checkmark-circle', label: 'Duyệt', value: 'APPROVED' },
  {
    description: 'Thẻ quay về cột Đang làm. Cần ghi nhận xét cho người làm.',
    icon: 'edit',
    label: 'Yêu cầu sửa',
    value: 'REQUEST_CHANGES',
  },
];

/**
 * Hai lựa chọn LỚN có icon + chữ (p4-05 app.md §7: "không phải công tắc màu"). Dùng `ListItem selected` — thứ DUY NHẤT đưa trạng thái
 * "đang chọn" tới trình đọc màn hình — kèm dấu tick nhìn thấy được ở khe `trailing` (màu không được là dấu hiệu duy nhất). Vùng chạm là
 * cả hàng (≥ 44dp).
 */
export function ReviewDecisionPicker({ disabled = false, value, onChange }: ReviewDecisionPickerProps) {
  return (
    <Card padded={false}>
      <View accessibilityLabel="Quyết định chấm" accessibilityRole="radiogroup">
        {OPTIONS.map((option, index) => {
          const selected = value === option.value;
          return (
            <ListItem
              key={option.value}
              description={option.description}
              disabled={disabled}
              divider={index < OPTIONS.length - 1}
              label={option.label}
              leading={<Icon color={selected ? 'fg-brand' : 'fg-2'} name={option.icon} />}
              selected={selected}
              trailing={selected ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" /> : undefined}
              onPress={() => onChange(option.value)}
            />
          );
        })}
      </View>
    </Card>
  );
}
