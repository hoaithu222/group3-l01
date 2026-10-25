import { View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { ReportReason } from '../api/moderation.types';
import { REPORT_REASON_OPTIONS } from '../constants/moderation.constants';

export interface ReportReasonListProps {
  disabled?: boolean;
  onChange: (reason: ReportReason) => void;
  value: ReportReason | null;
}

/**
 * Sáu lý do báo cáo, MỖI lý do một dòng mô tả ngắn (app.md p1-08 §7).
 *
 * Dùng `ListItem` (có `description` + `selected`) chứ không `Radio`: `Radio` chỉ nhận `label`, mà mô tả
 * là chỗ người dùng phân biệt "Spam" với "Lừa đảo" — cùng lý do `SelectOptionRow` không dùng `Radio`.
 * Trạng thái "đang chọn" đi qua ba đường: `selected` (trình đọc màn hình), nền tint, và dấu tick — màu
 * không được là dấu hiệu duy nhất.
 */
export function ReportReasonList({ disabled, onChange, value }: ReportReasonListProps) {
  return (
    <View accessibilityLabel="Lý do báo cáo" accessibilityRole="radiogroup">
      {REPORT_REASON_OPTIONS.map((option, index) => {
        const selected = option.value === value;
        return (
          <ListItem
            key={option.value}
            description={option.description}
            disabled={disabled}
            divider={index < REPORT_REASON_OPTIONS.length - 1}
            label={option.label}
            labelNumberOfLines={2}
            selected={selected}
            trailing={selected ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" /> : null}
            onPress={() => onChange(option.value)}
          />
        );
      })}
    </View>
  );
}
