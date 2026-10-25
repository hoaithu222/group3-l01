import { Text } from 'react-native';

import { BadgeAnchor } from '@/shared/ui/badge';
import { CountBadge } from '@/shared/ui/count-badge';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';
import { ModuleIconTile } from '@/shell/navigation/ModuleIconTile';
import type { ModuleConfig } from '@/shell/navigation/types';

import { PIN_ACTION } from '../constants/home-modules.constants';

/** Ô nhỏ (~77dp) co mạnh hơn mặc định 0.97 mới thấy được dưới ngón tay — vẫn chưa tới mức nhoè chữ (`PressableScale`). */
const TILE_SCALE = 0.94;

/**
 * Một ô của lưới phân hệ (tầng 2): icon tông màu 40dp + tên TỐI ĐA HAI dòng, căn giữa, bên dưới; rộng đúng 1/4 hàng
 * (`w-1/4`, phần trăm của cha — không tính px nên hàng không bao giờ tụt xuống 3 ô vì lỗi làm tròn).
 *
 * Vùng chạm là cả ô (~77dp × ≥ 64dp, vượt 44dp). Số chưa đọc cưỡi lên góc icon (`BadgeAnchor`, `self-center` để đè
 * `self-start` mặc định — không thì icon dạt trái ô). Nhấn giữ = ghim lên hero (cùng cử chỉ với thẻ hero, kèm hành động
 * trợ năng).
 *
 * ✅ Tên HAI dòng (bản cũ một dòng cắt "Tìm cố…"): `fill` cho khối nhìn thấy cao bằng ô ⇒ ô tên ngắn vẫn cao bằng ô tên hai
 * dòng cùng hàng (hàng `flex-wrap` kéo giãn mọi ô theo ô cao nhất), vệt nhấn `bg-2` phủ đều. Tên dài hơn nữa bị cắt nhưng
 * `accessibilityLabel` vẫn đọc đủ.
 */
export function HomeModuleTile({
  badge,
  canPin,
  module,
  onOpen,
  onTogglePin,
}: {
  badge?: number;
  canPin: boolean;
  module: ModuleConfig;
  onOpen: (module: ModuleConfig) => void;
  onTogglePin: (module: ModuleConfig) => void;
}) {
  const unread = badge !== undefined && badge > 0 ? badge : 0;

  return (
    <PressableScale
      accessibilityActions={canPin ? [{ label: 'Ghim lên đầu Trang chủ', name: PIN_ACTION }] : undefined}
      accessibilityLabel={unread > 0 ? `${module.title}, ${String(unread)} chưa đọc` : module.title}
      accessibilityRole="button"
      className="w-1/4"
      contentClassName={({ pressed }) =>
        cn('min-h-16 items-center gap-2xs rounded-sm px-3xs py-xs', pressed && 'bg-bg-2')
      }
      fill
      scaleTo={TILE_SCALE}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === PIN_ACTION) onTogglePin(module);
      }}
      onLongPress={canPin ? () => onTogglePin(module) : undefined}
      onPress={() => onOpen(module)}
    >
      <BadgeAnchor
        badge={unread > 0 ? <CountBadge count={unread} size="sm" /> : undefined}
        className="self-center"
      >
        <ModuleIconTile module={module} />
      </BadgeAnchor>
      <Text className="text-center text-caption-lg text-fg-1" numberOfLines={2}>
        {module.title}
      </Text>
    </PressableScale>
  );
}
