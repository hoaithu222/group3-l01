import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SPACING } from '@/shared/theme';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { SelectSheet, type SelectOption } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ContributionPeriods, PeriodKey } from '../api/contribution.types';
import { ALL_PERIOD, monthLabel, periodKindOf, weekLabel } from '../utils/period-labels';

export interface PeriodPickerProps {
  period: PeriodKey;
  /** `undefined` khi còn tải — hiện khung xương thay vì chip cụt. */
  periods: ContributionPeriods | undefined;
  onChange: (period: PeriodKey) => void;
}

type OpenPicker = 'MONTH' | 'WEEK' | null;

/**
 * Bộ chọn kỳ báo cáo (app.md §3): chip "Toàn bộ" · "Tháng" · "Tuần". Hai chip sau mở tấm chọn từ danh sách kỳ CÓ dữ liệu (`/periods`, mới nhất trước);
 * khi đang chọn một tháng/tuần thì chip hiện luôn tên kỳ ("Tháng 9/2026"). Kỳ tính theo múi giờ của nhóm nên "tuần 37" là cùng một tuần với mọi người.
 * Chưa có tháng/tuần nào (bảng chưa có thẻ xong) thì chip đó bị khoá.
 */
export function PeriodPicker({ period, periods, onChange }: PeriodPickerProps) {
  const [open, setOpen] = useState<OpenPicker>(null);
  const kind = periodKindOf(period);

  if (!periods) {
    return (
      <View className="flex-row gap-xs px-md">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-full" />
        ))}
      </View>
    );
  }

  const monthOptions: SelectOption[] = periods.months.map((key) => ({ label: monthLabel(key), value: key }));
  const weekOptions: SelectOption[] = periods.weeks.map((key) => ({ label: weekLabel(key), value: key }));
  // Đổi kỳ = đổi lựa chọn trong nhóm ⇒ nhịp `selection` (cả chip "Toàn bộ" lẫn chọn tháng/tuần trong tấm).
  const choose = (key: string) => {
    hapticSelection();
    onChange(key);
    setOpen(null);
  };

  return (
    <View>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', gap: SPACING.xs, paddingHorizontal: SPACING.md }}
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Chip
          label="Toàn bộ"
          leading={<Icon color="fg-brand" name="history" size="sm" />}
          role="radio"
          selected={kind === 'ALL'}
          size="sm"
          onPress={() => {
            hapticSelection();
            onChange(ALL_PERIOD);
          }}
        />
        <Chip
          disabled={monthOptions.length === 0}
          label={kind === 'MONTH' ? monthLabel(period) : 'Tháng'}
          leading={<Icon color={monthOptions.length === 0 ? 'fg-2' : 'fg-brand'} name="calendar" size="sm" />}
          role="radio"
          selected={kind === 'MONTH'}
          size="sm"
          onPress={() => setOpen('MONTH')}
        />
        <Chip
          disabled={weekOptions.length === 0}
          label={kind === 'WEEK' ? weekLabel(period) : 'Tuần'}
          leading={<Icon color={weekOptions.length === 0 ? 'fg-2' : 'fg-brand'} name="calendar" size="sm" />}
          role="radio"
          selected={kind === 'WEEK'}
          size="sm"
          onPress={() => setOpen('WEEK')}
        />
      </ScrollView>

      <SelectSheet
        options={monthOptions}
        title="Chọn tháng"
        value={kind === 'MONTH' ? period : undefined}
        visible={open === 'MONTH'}
        onChange={choose}
        onClose={() => setOpen(null)}
      />
      <SelectSheet
        options={weekOptions}
        title="Chọn tuần"
        value={kind === 'WEEK' ? period : undefined}
        visible={open === 'WEEK'}
        onChange={choose}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}
