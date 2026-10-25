import { memo } from 'react';
import { useWatch } from 'react-hook-form';

import { NumberField, Text } from '@/shared/ui';

import {
  CONTRIBUTION_GRACE_HOURS_MAX,
  CONTRIBUTION_UNESTIMATED_MAX,
  CONTRIBUTION_UNESTIMATED_STEP,
  CONTRIBUTION_WEIGHT_TOTAL,
} from '../constants/pm.constants';
import type { ContributionWeightsValue } from '../schemas/contribution-defaults.schema';
import { weightsTotal } from '../utils/contribution-defaults';
import ContributionWeightsTotal from './ContributionWeightsTotal';

/**
 * Các ô của thẻ "Đóng góp — mặc định cho bảng mới" (p4-06 admin.md §2.1): ba trọng số + dòng tổng, số giờ cho phép
 * trễ, điểm tính cho thẻ chưa gán story points. Phải nằm trong `<Form>` (chỉ đọc thì các ô hiện dạng chữ).
 */
const ContributionDefaultsFields = memo(function ContributionDefaultsFields() {
  const weights = useWatch({ name: 'weights' }) as Partial<ContributionWeightsValue> | undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Text size="small" weight="medium">
          Trọng số điểm đóng góp
        </Text>
        <Text size="tiny" skin="muted">
          {`Ba trọng số là số nguyên 0–${CONTRIBUTION_WEIGHT_TOTAL}, tổng bằng ${CONTRIBUTION_WEIGHT_TOTAL}. Thành phần chưa có dữ liệu được bỏ ra và chia lại theo phần còn lại.`}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          description="Theo story points của thẻ đã hoàn thành."
          label="Điểm thẻ (story points)"
          max={CONTRIBUTION_WEIGHT_TOTAL}
          min={0}
          name="weights.points"
        />
        <NumberField
          description="Tỷ lệ thẻ hoàn thành đúng hạn trên thẻ có hạn."
          label="Đúng hạn"
          max={CONTRIBUTION_WEIGHT_TOTAL}
          min={0}
          name="weights.onTime"
        />
        <NumberField
          description="Trung bình điểm bạn cùng nhóm chấm chéo."
          label="Điểm chấm chéo"
          max={CONTRIBUTION_WEIGHT_TOTAL}
          min={0}
          name="weights.peer"
        />
      </div>
      <ContributionWeightsTotal total={weightsTotal(weights)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberField
          description={`Sau cuối ngày hạn vẫn tính đúng hạn (0–${CONTRIBUTION_GRACE_HOURS_MAX} giờ).`}
          label="Cho phép trễ (giờ)"
          max={CONTRIBUTION_GRACE_HOURS_MAX}
          min={0}
          name="onTimeGraceHours"
        />
        <NumberField
          description={`Điểm tính cho thẻ chưa gán story points (0–${CONTRIBUTION_UNESTIMATED_MAX}, bước 0,5).`}
          label="Điểm cho thẻ chưa gán story points"
          max={CONTRIBUTION_UNESTIMATED_MAX}
          min={0}
          name="unestimatedPoints"
          step={CONTRIBUTION_UNESTIMATED_STEP}
        />
      </div>
    </div>
  );
});

export default ContributionDefaultsFields;
