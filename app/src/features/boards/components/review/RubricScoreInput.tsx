import * as Haptics from 'expo-haptics';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Stepper } from '@/shared/ui/stepper';

import { formatCriterionScore, SCORE_STEP } from '../../utils/review-score';

export interface RubricScoreInputProps {
  description?: string | null;
  disabled?: boolean;
  /** Câu lỗi tại ô (chưa chấm / ngoài khoảng); hiện khi có. */
  error?: string;
  label: string;
  max: number;
  /** `null` = chưa chấm. */
  value: number | null;
  onChange: (value: number) => void;
}

/**
 * Điểm MỘT tiêu chí (p4-05 app.md §2 `RubricScoreInput`): tên + mô tả + `Stepper` bước 0,5 tới điểm tối đa. Dùng `Stepper` chung (có
 * `accessibilityActions` tăng/giảm cho trình đọc màn hình) — số hiện theo quy ước Việt ("2,5") nhờ `formatValue`.
 *
 * `null` (chưa chấm) khác `0`: `Stepper` luôn cần một số nên khi chưa chấm nó đứng ở 0 và dòng bên dưới nói "Chưa chấm" — người chấm
 * KHÔNG vô tình nộp 0 cho tiêu chí mình chưa xem. Muốn cho 0 điểm thật thì bấm "Cho 0 điểm" (nút chỉ có khi chưa chấm).
 *
 * Chạm đúng điểm tối đa thì rung nhẹ MỘT lần (app.md §6) — báo "hết nấc" khi đang bấm + liên tục; `selectionAsync` là mức rung nhẹ nhất và
 * hệ điều hành tự bỏ qua khi người dùng tắt phản hồi xúc giác.
 */
export function RubricScoreInput({ description, disabled = false, error, label, max, value, onChange }: RubricScoreInputProps) {
  const change = (next: number) => {
    if (next === max && value !== max) void Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <View className="gap-xs">
      <View className="gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">{label}</Text>
        {description ? <Text className="text-body-md text-fg-2">{description}</Text> : null}
      </View>

      <View className="flex-row flex-wrap items-center gap-sm">
        <Stepper
          accessibilityLabel={`Điểm ${label}`}
          disabled={disabled}
          formatValue={formatCriterionScore}
          max={max}
          min={0}
          step={SCORE_STEP}
          value={value ?? 0}
          onChange={change}
        />
        <View className="shrink gap-3xs">
          <Text className="text-label-md text-fg-1">{value === null ? 'Chưa chấm' : `${formatCriterionScore(value)}/${max} điểm`}</Text>
          {value === null && !disabled ? <LinkButton label="Cho 0 điểm" size="sm" onPress={() => onChange(0)} /> : null}
        </View>
      </View>

      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-caption-lg text-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
