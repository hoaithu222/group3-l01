import { Controller, type Control } from 'react-hook-form';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { DatePicker } from '@/shared/ui/date-picker';

import type { ProjectFormValues } from '../../schemas/portfolio-project.schemas';
import { isoToMonthDate, monthToIso } from '../../utils/portfolio-period';

export interface PeriodFieldProps {
  control: Control<ProjectFormValues>;
  name: 'periodFrom' | 'periodTo';
  label: string;
  disabled?: boolean;
}

/**
 * Ô chọn THÁNG cho thời gian dự án (app.md p6-07 §3): trang công khai chỉ in `MM/yyyy`, nên chọn theo tháng. Giá trị trong form là chuỗi ISO (hoặc `null` = chưa khai) — quy đổi
 * tháng ↔ mốc ISO theo GIỜ VIỆT NAM ở `portfolio-period.ts`. Tuỳ chọn: có nút "Xoá" để bỏ ngày đã chọn (DatePicker không có ô xoá).
 */
export function PeriodField({ control, disabled = false, label, name }: PeriodFieldProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View className="gap-3xs">
          <DatePicker
            disabled={disabled}
            error={fieldState.error?.message}
            label={label}
            mode="single"
            precision="month"
            title={label}
            value={isoToMonthDate(field.value)}
            onChange={(picked) => field.onChange(monthToIso(picked))}
          />
          {field.value ? (
            <View className="items-start">
              <Button
                accessibilityLabel={`Xoá ${label.toLowerCase()}`}
                disabled={disabled}
                label="Xoá"
                size="xs"
                variant="tertiary"
                onPress={() => field.onChange(null)}
              />
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
