import { memo } from 'react';

import { Badge } from '@/shared/ui';

import type { FeatureRow } from '../utils/feature-rows';

/** Trạng thái MÃ của phân hệ: Sẵn sàng / Chưa có mã / Tạm dừng (D-13); cờ phụ thiếu hạ tầng riêng: Thiếu hạ tầng. */
const FeatureStatusBadge = memo(function FeatureStatusBadge({ row }: { row: FeatureRow }) {
  if (row.blocked) {
    return (
      <Badge color="warning" size="sm" variant="tinted">
        Tạm dừng (D-13)
      </Badge>
    );
  }
  if (row.available) {
    return (
      <Badge color="success" size="sm" variant="tinted">
        Sẵn sàng
      </Badge>
    );
  }
  // Cờ phụ mà phân hệ cha ĐÃ có mã: thiếu hạ tầng riêng (vd ghi hình cần S3 + Egress), không phải "chưa có mã".
  return row.parentAvailable ? (
    <Badge color="warning" size="sm" variant="tinted">
      Thiếu hạ tầng
    </Badge>
  ) : (
    <Badge color="neutral" size="sm" variant="tinted">
      Chưa có mã
    </Badge>
  );
});

export default FeatureStatusBadge;
