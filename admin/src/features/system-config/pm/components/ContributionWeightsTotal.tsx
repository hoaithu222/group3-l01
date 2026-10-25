import { memo } from 'react';

import { Badge, Text } from '@/shared/ui';

import { CONTRIBUTION_WEIGHT_TOTAL } from '../constants/pm.constants';
import { isWeightsTotalValid } from '../utils/contribution-defaults';

export interface ContributionWeightsTotalProps {
  /** Tổng ba trọng số đang nhập (tính lại theo từng lần gõ). */
  total: number;
}

/**
 * Dòng "Tổng trọng số" dưới ba ô trọng số (p4-06 admin.md §2.1): luôn hiện `tổng / 100`; lệch 100 thì báo lỗi NGAY tại
 * dòng này (không gắn vào ô nào — lỗi thuộc cả ba) và form không gửi được.
 */
const ContributionWeightsTotal = memo(function ContributionWeightsTotal({
  total,
}: ContributionWeightsTotalProps) {
  const valid = isWeightsTotalValid(total);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Text size="small" weight="medium">
          Tổng trọng số
        </Text>
        <Badge color={valid ? 'success' : 'error'} size="sm" variant="tinted">
          {`${total} / ${CONTRIBUTION_WEIGHT_TOTAL}`}
        </Badge>
      </div>
      {!valid && (
        <Text role="alert" size="small" skin="error">
          {`Tổng trọng số phải bằng ${CONTRIBUTION_WEIGHT_TOTAL} (hiện là ${total}).`}
        </Text>
      )}
    </div>
  );
});

export default ContributionWeightsTotal;
