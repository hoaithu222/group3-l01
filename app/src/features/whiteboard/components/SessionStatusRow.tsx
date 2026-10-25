import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';

import {
  statusBanner,
  statusLabel,
  type SessionSnapshot,
  type StatusTone,
} from '../collab/session-status';

export interface SessionStatusRowProps {
  archived: boolean;
  /** Đã chạm trần phần tử (engine trả `'limit'`) hoặc bảng còn ≤ 5% chỗ. */
  full: boolean;
  nearLimit: boolean;
  /** Người xem/bảng lưu trữ/server hạ xuống chỉ đọc — không có gì để lưu. */
  readOnly: boolean;
  snapshot: SessionSnapshot;
  tokenProblem: boolean;
}

const BADGE_VARIANT: Record<StatusTone, 'error' | 'neutral' | 'success' | 'warning'> = {
  error: 'error',
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
};

/**
 * Dải trạng thái dưới `AppBar` (app.md §3 "trạng thái đồng bộ"): chấm trạng thái BẰNG CHỮ ("Đã lưu"/"Đang đồng bộ…"/"Mất kết nối"/"Chưa lưu được — sẽ
 * thử lại") + tối đa MỘT banner ưu tiên cao nhất (`statusBanner`: bảng đầy > lưu trữ > chỉ xem > ngoại tuyến > sắp đầy > phiên không làm mới được).
 * `accessibilityLiveRegion="polite"`: đổi trạng thái lưu được đọc lên mà không giật tiêu điểm của người dùng. `SAVE_FAILED` KHÔNG toast (BE chớp tắt
 * sẽ spam) — chỉ đổi chấm này.
 */
export function SessionStatusRow({
  archived,
  full,
  nearLimit,
  readOnly,
  snapshot,
  tokenProblem,
}: SessionStatusRowProps) {
  const label = statusLabel(snapshot, readOnly);
  const banner = statusBanner({ archived, full, nearLimit, readOnly, snapshot, tokenProblem });

  return (
    <View className="gap-xs px-md pb-xs pt-2xs">
      <View accessibilityLiveRegion="polite" className="min-h-[32px] flex-row items-center">
        <Badge label={label.text} size="sm" variant={BADGE_VARIANT[label.tone]} />
      </View>
      {banner ? <Alert description={banner.text} tone={banner.tone} /> : null}
    </View>
  );
}
