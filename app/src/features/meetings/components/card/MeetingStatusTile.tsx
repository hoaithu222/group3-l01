import { IconTile, type IconTileSize, type IconTileTone } from '@/shared/ui/icon-tile';
import type { IconName } from '@/shared/ui/icon';

import type { MeetingStatus } from '../../api/meetings.types';

/**
 * Icon + tông theo trạng thái cuộc họp — CÙNG bảng màu với `MeetingStatusBadge` (sắp tới = xanh dương, đang diễn ra = xanh
 * lá, đã kết thúc = xám, đã huỷ = đỏ) để ô icon và nhãn chữ bên cạnh không nói hai màu khác nhau. `audio` (sóng âm) là icon
 * gần nhất với "đang diễn ra trực tiếp" trong bộ — bộ không có icon "live"/"record".
 */
const STATUS_TILE: Record<MeetingStatus, { icon: IconName; tone: IconTileTone }> = {
  CANCELLED: { icon: 'cancel', tone: 'danger' },
  ENDED: { icon: 'checkmark-circle', tone: 'neutral' },
  LIVE: { icon: 'audio', tone: 'success' },
  SCHEDULED: { icon: 'calendar', tone: 'info' },
};

/**
 * Ô icon trạng thái — TRANG TRÍ (nghĩa đã có ở nhãn `MeetingStatusBadge` liền kề, nên ⛔ không gắn nhãn trợ năng thứ hai).
 */
export function MeetingStatusTile({
  size,
  status,
}: {
  size?: IconTileSize;
  status: MeetingStatus;
}) {
  const { icon, tone } = STATUS_TILE[status];
  return <IconTile name={icon} size={size} tone={tone} />;
}
