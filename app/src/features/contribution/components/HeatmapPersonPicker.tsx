import { useState } from 'react';
import { ScrollView } from 'react-native';

import { SPACING } from '@/shared/theme';
import { Chip } from '@/shared/ui/chip';
import { SelectSheet, type SelectOption } from '@/shared/ui/select';

export interface HeatmapPersonPickerProps {
  /** Nhãn chip phạm vi rộng nhất: "Cả bảng" (báo cáo của bảng) hoặc "Cả nhóm" (heatmap cấp nhóm). */
  allLabel: string;
  /** Người chọn được (`value` = id người dùng). Rỗng ⇒ chip "Thành viên" khoá. */
  options: readonly SelectOption[];
  /** `'all'` hoặc id người. */
  value: string;
  onChange: (userId: string) => void;
}

/**
 * Bộ chọn phạm vi của biểu đồ hoạt động, dùng chung cho heatmap của BẢNG (`HeatmapMemberPicker`, danh sách lấy từ báo cáo đóng góp) và của cả NHÓM
 * (`WorkspaceActivityScreen`, danh sách lấy từ thành viên nhóm): chip phạm vi rộng nhất và chip "Thành viên" mở tấm chọn người (ô tìm khi > 8 người).
 * Người đã chọn hiện TÊN trên chip — trạng thái đọc được bằng chữ, không chỉ bằng màu.
 */
export function HeatmapPersonPicker({ allLabel, options, value, onChange }: HeatmapPersonPickerProps) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);

  return (
    <>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', gap: SPACING.xs }}
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Chip label={allLabel} role="radio" selected={value === 'all'} size="sm" onPress={() => onChange('all')} />
        <Chip
          disabled={options.length === 0}
          label={chosen ? chosen.label : 'Thành viên'}
          role="radio"
          selected={value !== 'all'}
          size="sm"
          onPress={() => setOpen(true)}
        />
      </ScrollView>
      <SelectSheet
        options={options}
        searchable={options.length > 8}
        searchPlaceholder="Tìm thành viên"
        title="Xem hoạt động của"
        value={value === 'all' ? undefined : value}
        visible={open}
        onChange={(userId) => {
          onChange(userId);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
