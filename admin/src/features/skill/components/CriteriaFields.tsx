import { memo } from 'react';

import { NumberField, Text, ToggleField } from '@/shared/ui';

import { SKILL_LIMITS as L } from '../constants/skill.constants';

/**
 * Nhóm tiêu chí cấp huy hiệu (admin.md p6-06 §2.2) — số task Done bắt buộc, story points tối thiểu (bước 0,5), điểm review TB tối thiểu (bước 0,1),
 * bắt buộc qua review. Hai ngưỡng tuỳ chọn: 0 = không áp dụng. BE kiểm lại (`SKILL_002`).
 */
const CriteriaFields = memo(function CriteriaFields() {
  return (
    <fieldset className="flex flex-col gap-3">
      <Text as="legend" weight="bold">
        Tiêu chí cấp huy hiệu
      </Text>
      <NumberField
        label="Số task Done tối thiểu"
        max={L.requiredTasksDoneMax}
        min={1}
        name="requiredTasksDone"
        required
      />
      <NumberField
        description="Tổng story points (chia đều khi thẻ nhiều người làm). 0 = không áp dụng."
        label="Story points tối thiểu"
        max={L.minStoryPointsMax}
        min={0}
        name="minStoryPoints"
        step={0.5}
      />
      <NumberField
        description="Thang 10, trung bình các task đã qua chấm chéo. 0 = không áp dụng."
        label="Điểm review trung bình tối thiểu"
        max={L.peerScoreMax}
        min={0}
        name="minAvgPeerScore"
        step={0.1}
      />
      <ToggleField
        description="Mọi task được tính phải có điểm chấm chéo."
        label="Bắt buộc qua review"
        name="requireReview"
      />
    </fieldset>
  );
});

export default CriteriaFields;
