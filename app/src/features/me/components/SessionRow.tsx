import type { SessionSummary } from '@/core/api/auth';
import { Badge } from '@/shared/ui/badge';
import { LinkButton } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { formatRelative } from '@/shared/utils/format/date.utils';

import {
  maskIpAddress,
  sessionDeviceLabel,
  sessionRevokeAccessibilityLabel,
} from '../constants/session.messages';

export interface SessionRowProps {
  /** Hàng cuối trong danh sách thì tắt kẻ chia — cùng mẫu danh sách `ListItem` trong `Card`. */
  divider?: boolean;
  /** Chỉ TRUE cho đúng hàng đang chờ `DELETE` của chính nó — xem `SessionsScreen`. */
  isRevoking: boolean;
  session: SessionSummary;
  onRevoke: (session: SessionSummary) => void;
}

/**
 * Một dòng trong danh sách "Phiên đăng nhập" (p0-01 mục 10).
 *
 * ⛔ Phiên `isCurrent` KHÔNG có nút "Thu hồi" — BE tự chặn `DELETE` lên chính
 * phiên đang gọi API (400 `ValidationError`), nhưng ẩn nút ở UI để không tạo
 * trải nghiệm bấm-rồi-báo-lỗi. Thay vào đó hiện huy hiệu "Thiết bị này".
 */
export function SessionRow({ divider = false, isRevoking, onRevoke, session }: SessionRowProps) {
  // Chỉ IP RÚT GỌN + thời điểm hoạt động gần nhất — nhãn phương thức đăng nhập đã nằm
  // trong `sessionDeviceLabel()` khi không có `userAgent`, nhắc lại ở đây với
  // ca có `userAgent` là thừa chữ trên một hàng vốn đã hẹp.
  const subtitle = [
    session.isOriginDevice ? 'Thiết bị gốc' : session.isNewDevice ? 'Mới' : null,
    maskIpAddress(session.ipAddress),
    formatRelative(session.lastUsedAt),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <ListItem
      className="px-md py-sm"
      description={subtitle || undefined}
      divider={divider}
      label={sessionDeviceLabel(session)}
      labelNumberOfLines={1}
      leading={
        // Ô icon: thiết bị đang dùng tông thương hiệu, phiên khác trung tính (cùng dấu hiệu với huy hiệu "Thiết bị này").
        <IconTile
          name={session.authMethod === 'BIOMETRIC' ? 'faceid' : 'phone'}
          tone={session.isCurrent ? 'brand' : 'neutral'}
        />
      }
      trailing={
        session.isCurrent ? (
          <Badge label="Thiết bị này" variant="brand" />
        ) : (
          // `LinkButton` đỏ thay cho nút khung `danger-secondary`: mỗi phiên một nút khung đỏ xếp dọc là cả danh sách toàn viền đỏ,
          // tranh nổi bật với chính nội dung hàng. Hành động vẫn đi qua hộp xác nhận nên không cần nút to.
          <LinkButton
            accessibilityLabel={sessionRevokeAccessibilityLabel(session)}
            disabled={isRevoking}
            label="Thu hồi"
            loading={isRevoking}
            tone="danger"
            onPress={() => onRevoke(session)}
          />
        )
      }
    />
  );
}
