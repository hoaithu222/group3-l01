import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { BadgeAnchor } from '@/shared/ui/badge';
import { CountBadge } from '@/shared/ui/count-badge';
import { Sparkles } from '@/shared/ui/effects';
import { Icon } from '@/shared/ui/icon';
import { PressableScale } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';
import { ModuleIconTile } from '@/shell/navigation/ModuleIconTile';
import { moduleTone } from '@/shell/navigation/module-tone';
import type { ModuleConfig } from '@/shell/navigation/types';

import { PIN_ACTION } from '../constants/home-modules.constants';

import { HomeHeroGlow } from './HomeHeroGlow';

/**
 * Thẻ LỚN tầng 1 của khu phân hệ: icon tông màu 48dp bên trái (kèm số chưa đọc), bên phải xếp chồng tên (MỘT dòng) +
 * mô tả (MỘT dòng). Bố cục NGANG nên thẻ chỉ cao ~72dp — bản dọc (icon trên, chữ dưới) cao gấp rưỡi và ăn hết màn đầu
 * tiên; hero chỉ cần thứ bậc (to hơn ô lưới, có mô tả), không cần cao.
 *
 * Nhãn/mô tả đều MỘT dòng, `flex-1` + `numberOfLines`: hai thẻ đứng cạnh nhau không được lệch chiều cao vì một bên
 * xuống dòng. Tên/mô tả dài bị cắt ở đây nhưng `accessibilityLabel` vẫn đọc đủ.
 *
 * ── Nhấn ────────────────────────────────────────────────────────────────────
 * `PressableScale` (co nhẹ + nền `bg-2` lúc nhấn) thay cho `active:opacity-80` chỉ làm mờ — khó thấy dưới ngón tay.
 * ✅ `className="grow"` + `fill`: lớp bọc `Reveal` ở `HomeModules` là ô `flex-1` của hàng, thẻ lấp đủ chiều cao ô ⇒ hai
 * thẻ cao BẰNG nhau kể cả khi cỡ chữ hệ thống to. ⚠️ `grow` chứ không `flex-1` (xem chú thích `GROW` ở `PressableScale`).
 *
 * ── Ghim ────────────────────────────────────────────────────────────────────
 * Nhấn giữ = ghim/bỏ ghim (kèm hành động trợ năng `togglePin`, vì nhấn giữ là cử chỉ ẨN). Dấu ghim là phần tử flex cuối
 * hàng tên — KHÔNG phải lớp `absolute`: tên dài đã chiếm trọn `flex-1` thì dấu tuyệt đối sẽ đè lên đuôi chữ.
 *
 * ── Điểm nhấn ───────────────────────────────────────────────────────────────
 * Quầng tông màu TĨNH ở góc (`HomeHeroGlow`, cần `overflow-hidden` ở khối thẻ để bị cắt theo góc bo). `sparkle` (chỉ thẻ
 * GHIM đầu tiên — `HomeModules` chọn) thêm vài sao lấp lánh nhỏ quanh icon. ⛔ Không vòng lặp nổi bật nào ở đây: quỹ một
 * vòng của Trang chủ đã dành cho `GlowOrbs` sau lời chào.
 */
export function HomeHeroCard({
  badge,
  canPin,
  module,
  pinned,
  sparkle = false,
  onOpen,
  onTogglePin,
}: {
  badge?: number;
  canPin: boolean;
  module: ModuleConfig;
  pinned: boolean;
  /** Lấp lánh quanh icon — CHỈ thẻ ghim đầu tiên (một điểm nhấn, không phải mọi thẻ). */
  sparkle?: boolean;
  onOpen: (module: ModuleConfig) => void;
  onTogglePin: (module: ModuleConfig) => void;
}) {
  const unread = badge !== undefined && badge > 0 ? badge : 0;
  const label = [
    module.description ? `${module.title}. ${module.description}` : module.title,
    pinned ? 'đã ghim' : null,
    unread > 0 ? `${String(unread)} chưa đọc` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      accessibilityActions={
        canPin
          ? [{ label: pinned ? 'Bỏ ghim' : 'Ghim lên đầu Trang chủ', name: PIN_ACTION }]
          : undefined
      }
      accessibilityLabel={label}
      accessibilityRole="button"
      className="grow"
      contentClassName={({ pressed }) =>
        cn(
          'flex-row items-center gap-sm overflow-hidden rounded-md p-sm',
          pressed ? 'bg-bg-2' : 'bg-bg-1',
        )
      }
      fill
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === PIN_ACTION) onTogglePin(module);
      }}
      onLongPress={canPin ? () => onTogglePin(module) : undefined}
      onPress={() => onOpen(module)}
    >
      <HomeHeroGlow tone={moduleTone(module.id)} />
      <BadgeAnchor
        badge={unread > 0 ? <CountBadge count={unread} size="sm" /> : undefined}
        className="self-center"
      >
        <ModuleIconTile module={module} size="lg" />
        {sparkle ? <IconSparkles /> : null}
      </BadgeAnchor>

      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-3xs">
          <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {module.title}
          </Text>
          {pinned ? <Icon color="warning" name="favorite" size={14} variant="bulk" /> : null}
        </View>
        {module.description ? (
          <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
            {module.description}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * Sao lấp lánh quanh ô icon 48dp (tràn 8dp mỗi phía, vẫn nằm trong đệm `p-sm` + góc bo của thẻ nên không bị cắt).
 * ✅ Tách component: chỉ thẻ CÓ sao mới theo dõi tiêu điểm màn (`useIsScreenFocused`) — sang tab khác thì sao đứng yên.
 * ⚠️ Huy hiệu chưa đọc vẽ SAU (nằm trên) nên che sao góc trên-phải khi có số — chấp nhận: số quan trọng hơn sao.
 */
function IconSparkles() {
  const focused = useIsScreenFocused();
  return <Sparkles active={focused} className="-inset-2" count={3} size={8} />;
}
