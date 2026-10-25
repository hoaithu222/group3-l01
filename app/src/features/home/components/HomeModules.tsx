import { View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Reveal } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
import { MAX_PINNED_MODULES, MIN_MODULES_FOR_HERO } from '@/shell/navigation/module-pins.store';

import { HOME_GRID_MAX_TILES } from '../constants/home-modules.constants';
import { useHomeModules } from '../hooks/useHomeModules';

import { HomeHeroCard } from './HomeHeroCard';
import { HomeModuleGrid } from './HomeModuleGrid';

/** Chiều cao thẻ hero (icon 48 + đệm 2 × 12) — khung xương giữ đúng chỗ để nội dung thật không làm màn giật. */
const HERO_HEIGHT = 72;
/** Một hàng lưới: đệm ô 2 × 8 + icon 40 + khe 4 + tên một dòng 17 (`HomeModuleTile`). */
const GRID_ROW_HEIGHT = 77;
/** Đệm trong của thẻ lưới (`p-xs`, trên + dưới). */
const GRID_PADDING = 16;
const GRID_COLUMNS = 4;

/**
 * KHU PHÂN HỆ cố định ngay dưới lời chào — bento hai tầng:
 *  · tầng 1 (hero): `MAX_PINNED_MODULES` thẻ lớn — phân hệ người dùng GHIM (nhấn giữ), còn trống thì điền theo lượt mở /
 *    thứ tự khai báo;
 *  · tầng 2 (lưới): phần còn lại, bốn cột.
 * Mỗi phân hệ đúng MỘT chỗ (hero thì không lặp ở lưới). "Tất cả (N)" luôn có: mở `ModulePickerSheet` — danh sách đầy
 * đủ kèm nút ghim RÕ RÀNG (nhấn giữ là cử chỉ ẩn), và là nơi chứa phần dư khi phân hệ nhiều hơn lưới chứa được.
 *
 * ✅ Ghim làm hero ĐỔI CHỖ mượt: mỗi thẻ bọc `Reveal animateLayout` với `key = module.id` — thẻ ở lại trượt sang chỗ mới,
 * thẻ mới lên thì hiện dần. ⛔ `key` phải là id (không phải chỉ số): theo chỉ số thì React tái dùng ô và không có gì trượt.
 *
 * Chưa nạp xong ghim/lượt mở (AsyncStorage bất đồng bộ) thì vẽ khung xương ĐÚNG HÌNH bố cục sắp hiện (hàng hero chỉ khi
 * đủ phân hệ để tách hero; lưới đúng số hàng) — vẽ tạm thứ tự mặc định rồi đổi chỗ là ô nhảy dưới ngón tay. Không còn
 * phân hệ nào (cờ tắt hết) thì ẩn cả khu.
 */
export function HomeModules() {
  const { badgeOf, canPin, heroes, loading, modules, onOpen, onTogglePin, pinnedIds, rest } =
    useHomeModules();
  const openPicker = useModulePickerStore((state) => state.open);

  if (modules.length === 0) return null;

  // Chỉ thẻ GHIM đầu tiên lấp lánh — một điểm nhấn cho "của tôi"; hero điền theo lượt mở (chưa ghim) thì không.
  const sparkleId = heroes.find((module) => pinnedIds.has(module.id))?.id;

  // `Reveal index={1}`: nhịp thứ hai sau lời chào (`HomeScreen`) — bọc Ở ĐÂY, sau nhánh `null`, để khu rỗng không để lại khối trống.
  return (
    <Reveal index={1}>
      <Section
        action={
          <LinkButton
            accessibilityLabel={`Mở danh sách tất cả ${String(modules.length)} phân hệ`}
            label={`Tất cả (${String(modules.length)})`}
            onPress={openPicker}
          />
        }
        title="Phân hệ"
      >
        {loading ? (
          <HomeModulesSkeleton count={modules.length} />
        ) : (
          <View className="gap-sm">
            {heroes.length > 0 ? (
              <View className="flex-row gap-sm">
                {heroes.map((module) => (
                  <Reveal key={module.id} animateLayout className="flex-1" kind="fade">
                    <HomeHeroCard
                      badge={badgeOf(module)}
                      canPin={canPin}
                      module={module}
                      pinned={pinnedIds.has(module.id)}
                      sparkle={module.id === sparkleId}
                      onOpen={onOpen}
                      onTogglePin={onTogglePin}
                    />
                  </Reveal>
                ))}
              </View>
            ) : null}
            <HomeModuleGrid
              badgeOf={badgeOf}
              canPin={canPin}
              modules={rest}
              onOpen={onOpen}
              onTogglePin={onTogglePin}
            />
          </View>
        )}
      </Section>
    </Reveal>
  );
}

/**
 * Khung xương cùng HÌNH với khu thật: số hero/số hàng lưới suy từ số phân hệ (đã biết ngay — chỉ ghim/lượt mở là chờ).
 * ⚠️ Cùng luật tách hero với `splitHomeModules`: dưới `MIN_MODULES_FOR_HERO` phân hệ thì KHÔNG có hàng hero — khung xương
 * vẽ hàng hero ở đó là màn "co" lại khi dữ liệu về.
 */
function HomeModulesSkeleton({ count }: { count: number }) {
  const heroCount = count >= MIN_MODULES_FOR_HERO ? MAX_PINNED_MODULES : 0;
  const gridRows = Math.ceil(Math.min(count - heroCount, HOME_GRID_MAX_TILES) / GRID_COLUMNS);

  return (
    <View className="gap-sm">
      {heroCount > 0 ? (
        <View className="flex-row gap-sm">
          {Array.from({ length: heroCount }, (_, index) => (
            <View key={index} className="flex-1">
              <Skeleton height={HERO_HEIGHT} variant="card" />
            </View>
          ))}
        </View>
      ) : null}
      {gridRows > 0 ? (
        <Skeleton height={gridRows * GRID_ROW_HEIGHT + GRID_PADDING} variant="card" />
      ) : null}
    </View>
  );
}
