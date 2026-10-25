import type { DeviceSummary } from '@/core/notifications';
import { Badge } from '@/shared/ui/badge';
import { LinkButton } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { formatRelative } from '@/shared/utils/format/date.utils';

import { devicePlatformLabel } from '../constants/notification.messages';

/** Biểu tượng theo nền tảng: điện thoại cho Android/iOS, máy tính (`lap`) cho trình duyệt web. */
const DEVICE_ICON: Record<DeviceSummary['platform'], IconName> = {
  ANDROID: 'phone',
  IOS: 'phone-2',
  WEB: 'lap',
};

export interface DeviceRowProps {
  device: DeviceSummary;
  /** Hàng cuối trong danh sách thì tắt kẻ chia — cùng mẫu `SessionRow`. */
  divider?: boolean;
  /** Chỉ TRUE cho đúng hàng đang chờ `DELETE` của chính nó. */
  isRemoving: boolean;
  /** Mất mạng — ẩn nút Gỡ (`app.md` §3), thay vì bấm rồi báo lỗi. */
  offline?: boolean;
  onRemove: (device: DeviceSummary) => void;
}

/**
 * Một dòng trong "Thiết bị nhận thông báo" (p0-06 `app.md` §3).
 *
 * ⛔ Thiết bị ĐANG DÙNG (`current`) KHÔNG có nút "Gỡ": gỡ xong thì máy này ngừng nhận thông báo mà app
 * vẫn coi mình đã đăng ký (bản ghi "đã đăng ký" nằm trong bộ nhớ đến khi khởi động lại), người dùng
 * không hiểu vì sao im lặng. Muốn ngừng thì tắt quyền thông báo hoặc đăng xuất.
 */
export function DeviceRow({
  device,
  divider = false,
  isRemoving,
  offline = false,
  onRemove,
}: DeviceRowProps) {
  const subtitle = [
    device.appVersion ? `Phiên bản ${device.appVersion}` : null,
    `Hoạt động ${formatRelative(device.lastSeenAt)}`.trimEnd(),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const platform = devicePlatformLabel(device.platform);

  return (
    <ListItem
      className="px-md py-sm"
      description={subtitle}
      divider={divider}
      label={platform}
      labelNumberOfLines={1}
      leading={
        // Icon theo loại thiết bị; máy đang dùng tông thương hiệu, máy khác trung tính.
        <IconTile
          name={DEVICE_ICON[device.platform]}
          tone={device.current ? 'brand' : 'neutral'}
        />
      }
      trailing={
        device.current ? (
          <Badge label="Thiết bị này" variant="brand" />
        ) : offline ? undefined : (
          // `LinkButton` đỏ thay cho nút khung `danger-secondary` — cùng lý do `SessionRow` (cả danh sách toàn viền đỏ).
          <LinkButton
            // Nhiều máy cùng nền tảng thì chỉ "Gỡ thiết bị Android" không phân biệt được nút nào của máy nào.
            accessibilityLabel={`Gỡ thiết bị ${platform}, ${subtitle}`}
            disabled={isRemoving}
            label="Gỡ"
            loading={isRemoving}
            tone="danger"
            onPress={() => onRemove(device)}
          />
        )
      }
    />
  );
}
