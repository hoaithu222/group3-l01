import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import type { ReviewLimits } from '../../schemas/review.schemas';
import {
  addCriterion,
  moveCriterion,
  removeCriterion,
  rubricDraftTotal,
  updateCriterion,
  type RubricDraft,
} from '../../utils/rubric-draft';
import { RubricCriterionRow } from './RubricCriterionRow';

export interface RubricBuilderProps {
  disabled?: boolean;
  drafts: readonly RubricDraft[];
  limits: Pick<ReviewLimits, 'criterionDescriptionMax' | 'criterionLabelMax' | 'rubricCriteriaMax'>;
  onChange: (drafts: RubricDraft[]) => void;
}

/**
 * Danh sách tiêu chí đánh giá (p4-05 app.md §2 `RubricBuilder`): thêm / xoá / Lên-Xuống, tên, mô tả, điểm tối đa và TỔNG điểm tối đa.
 * Rỗng là hợp lệ: "Không dùng tiêu chí — người chấm cho điểm 0–10". Đổi tiêu chí chỉ áp cho lượt chấm MỚI (lượt đang mở giữ bản chụp cũ) —
 * màn cha nói điều đó ở cảnh báo; kiểm hợp lệ ở `validateReviewConfig`, BE kiểm lại (`REVIEW_004`).
 */
export function RubricBuilder({ disabled = false, drafts, limits, onChange }: RubricBuilderProps) {
  const total = rubricDraftTotal(drafts);

  return (
    <View className="gap-sm">
      {drafts.length === 0 ? (
        <Text className="text-body-md text-fg-2">Không dùng tiêu chí — người chấm cho điểm chung từ 0 đến 10.</Text>
      ) : null}

      {drafts.map((draft, index) => (
        <RubricCriterionRow
          key={draft.key}
          canMoveDown={index < drafts.length - 1}
          canMoveUp={index > 0}
          descriptionMax={limits.criterionDescriptionMax}
          disabled={disabled}
          draft={draft}
          index={index}
          labelMax={limits.criterionLabelMax}
          onChange={(patch) => onChange(updateCriterion(drafts, draft.key, patch))}
          onMove={(direction) => onChange(moveCriterion(drafts, draft.key, direction))}
          onRemove={() => onChange(removeCriterion(drafts, draft.key))}
        />
      ))}

      {drafts.length > 0 ? (
        <Text accessibilityLiveRegion="polite" className="text-label-md font-semibold text-fg-1">{`Tổng điểm tối đa: ${total}`}</Text>
      ) : null}

      <Button
        disabled={disabled || drafts.length >= limits.rubricCriteriaMax}
        iconLeft="add"
        label="Thêm tiêu chí"
        variant="secondary"
        onPress={() => onChange(addCriterion(drafts))}
      />
    </View>
  );
}
