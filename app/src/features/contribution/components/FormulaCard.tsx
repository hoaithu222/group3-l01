import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

import type { ContributionFormula } from '../api/contribution.types';
import {
  COMPONENT_KEYS,
  COMPONENT_LABELS,
  formatPoints,
  formulaChangeText,
} from '../utils/contribution-format';

export interface FormulaCardProps {
  formula: ContributionFormula;
  /** Múi giờ của nhóm — thời điểm "trọng số đổi lúc…" theo đó. */
  timezone: string;
  /** Có nút "Đổi trọng số" hay không (OWNER/ADMIN, bảng chưa lưu trữ, đang online). Thành viên khác chỉ ĐỌC công thức. */
  canEdit: boolean;
  onEdit: () => void;
}

/**
 * Thẻ công thức (app.md §3 `FormulaCard`): trọng số dạng CHỮ + thanh (60 / 20 / 20), định nghĩa từng thành phần do SERVER trả (hiển thị nguyên văn),
 * số giờ cho phép trễ, điểm thẻ chưa gán, và dòng minh bạch "Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60/20/20)". Mọi thành viên thấy đúng công
 * thức đang tính điểm cho mình; chỉ OWNER/ADMIN có "Đổi trọng số" (kèm cảnh báo trong tấm) — không có nút sửa điểm ở bất kỳ đâu.
 */
export function FormulaCard({ formula, timezone, canEdit, onEdit }: FormulaCardProps) {
  const changed = formulaChangeText(formula, timezone);

  return (
    <Card
      className="gap-md"
      footer={
        canEdit ? (
          <Button iconLeft="setting2" label="Đổi trọng số" variant="secondary" onPress={onEdit} />
        ) : undefined
      }
    >
      {COMPONENT_KEYS.map((key) => (
        <View key={key} className="gap-3xs">
          <View className="flex-row items-baseline justify-between gap-xs">
            <Text className="text-label-lg font-semibold text-fg-1">{COMPONENT_LABELS[key]}</Text>
            <Text className="text-label-lg font-semibold text-fg-1">{`${formula.weights[key]}%`}</Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-bg-3">
            <View className="h-2 rounded-full bg-action-base" style={{ width: `${formula.weights[key]}%` }} />
          </View>
          <Text className="text-body-md text-fg-2">{formula.definitions[key]}</Text>
        </View>
      ))}
      <Text className="text-body-md text-fg-2">
        {`Cho phép trễ ${formula.onTimeGraceHours} giờ sau cuối ngày hạn · Thẻ chưa gán điểm tính ${formatPoints(formula.unestimatedPoints)} điểm`}
      </Text>
      {changed ? <Text className="text-body-md font-semibold text-fg-1">{changed}</Text> : null}
    </Card>
  );
}
