import { memo, type ReactNode } from 'react';

import { Badge, BoxPanel, Callout, Text } from '@/shared/ui';
import { formatDate, formatRelativeTime } from '@/shared/utils/format/format.utils';

import { MEDIA_HEALTH_META } from '../constants/media.constants';
import type { MediaHealth, MediaStatus } from '../types/media-status.types';

export interface MediaHealthCardProps {
  health: MediaHealth;
  /** `undefined` khi chưa cấu hình (BE trả `503 MEDIA_001`, không có body). */
  status: MediaStatus | undefined;
}

interface HealthRowProps {
  label: string;
  children: ReactNode;
}

const HealthRow = memo(function HealthRow({ label, children }: HealthRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Text size="small" skin="muted">
        {label}
      </Text>
      <div className="text-body-14-medium text-fg-1">{children}</div>
    </div>
  );
});

/** "12:03 21/09/2026 (5 phút trước)" — hoặc câu "chưa nhận" khi `null`. */
function formatWebhook(iso: string | null): string {
  if (!iso) return 'Chưa nhận webhook nào';
  return `${formatDate(iso, 'HH:mm DD/MM/YYYY')} (${formatRelativeTime(iso)})`;
}

/**
 * Sức khoẻ máy chủ media (admin.md p0-08 §2) — chỉ ĐỌC. Trạng thái luôn kèm CHỮ cạnh màu
 * (Hoạt động / Chậm / Không kết nối / Chưa cấu hình). Không hiện khoá, secret hay URL nội bộ:
 * BE không trả chúng (D-24).
 */
const MediaHealthCard = memo(function MediaHealthCard({ health, status }: MediaHealthCardProps) {
  const meta = MEDIA_HEALTH_META[health];

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        <Badge color={meta.color} dot size="sm" variant="tinted">
          {meta.label}
        </Badge>
      }
      title="Sức khoẻ máy chủ media"
    >
      <div className="flex flex-col gap-2 p-2">
        {health === 'NOT_CONFIGURED' && (
          <Callout
            description="Thiếu cấu hình LIVEKIT_* trên server — chưa thể bật Gọi thoại/video hay Họp. Cấu hình xong, tab này tự cập nhật ở lượt làm mới kế tiếp."
            intent="warning"
            title="Máy chủ media chưa được cấu hình"
          />
        )}
        {health === 'UNREACHABLE' && (
          <Callout
            description="Máy chủ đã được cấu hình nhưng BE không với tới được (mạng, chứng chỉ hoặc dịch vụ LiveKit đang dừng). Cuộc gọi/họp mới sẽ không tạo được."
            intent="error"
            title="Không kết nối được máy chủ media"
          />
        )}
        {health === 'SLOW' && (
          <Callout
            description="Máy chủ media phản hồi chậm bất thường; chất lượng cuộc gọi có thể bị ảnh hưởng."
            intent="warning"
            title="Máy chủ media đang chậm"
          />
        )}

        {status && (
          <>
            <HealthRow label="Cấu hình">
              {status.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </HealthRow>
            <HealthRow label="Kết nối">
              {status.reachable ? 'Với tới được' : 'Không với tới được'}
            </HealthRow>
            <HealthRow label="Độ trễ">
              {status.latencyMs === null ? '—' : `${status.latencyMs} ms`}
            </HealthRow>
            <HealthRow label="Webhook gần nhất">{formatWebhook(status.lastWebhookAt)}</HealthRow>
          </>
        )}
      </div>
    </BoxPanel>
  );
});

export default MediaHealthCard;
