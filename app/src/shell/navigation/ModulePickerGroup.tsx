import { Pressable, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { ModuleIconTile } from './ModuleIconTile';
import { MAX_PINNED_MODULES } from './module-pins.store';
import type { ModuleConfig } from './types';

/** Trạng thái ghim cả tấm đang dùng — `null` ở nơi gọi = không vẽ nút ghim (Trang chủ không tách hero / chưa nạp xong sở thích). */
export interface ModulePinState {
  /** Đã ghim đủ `MAX_PINNED_MODULES` ⇒ nút ghim của phân hệ CHƯA ghim bị KHOÁ (lý do nói ở mô tả tấm + gợi ý trợ năng). */
  full: boolean;
  pinned: readonly string[];
  onToggle: (moduleId: string) => void;
}

export interface ModulePickerGroupProps {
  modules: readonly ModuleConfig[];
  pin: ModulePinState | null;
  title: string;
  onOpen: (module: ModuleConfig) => void;
}

const pinToggle = tv(
  {
    slots: {
      // 44dp vùng chạm (= ngưỡng `mobile-ux.md`); hàng có mô tả cao hơn thế nên nút không đội chiều cao hàng.
      hit: 'size-11 items-center justify-center rounded-full active:opacity-70',
      // Viên 36dp NHÌN THẤY được: có nền nên đọc ra là MỘT nút bấm, không phải hình trang trí cạnh chữ.
      face: 'size-9 items-center justify-center rounded-full',
    },
    variants: {
      state: {
        idle: { face: 'bg-surface-neutral' },
        pinned: { face: 'bg-surface-warning' },
        // Khoá: bỏ nền — viên "chìm" hẳn xuống, khác rõ với nút còn bấm được (không chỉ khác màu icon).
        blocked: { face: '' },
      },
    },
    defaultVariants: { state: 'idle' },
  },
  { twMergeConfig },
);

/**
 * Nút ghim/bỏ ghim ở cuối hàng. Icon `favorite` (trái tim) vì bộ icon hệ thống KHÔNG có "ghim" — cả repo dùng đúng icon này
 * cho hội thoại/kênh đã ghim. Trạng thái không chỉ nằm ở MÀU: đã ghim = viên nền cam + tim đặc; chưa ghim = viên xám + tim
 * mảnh; khoá = không nền + tim nhạt. Trình đọc màn hình nhận `selected` (đã ghim) · `disabled` (đủ ô) + nhãn + gợi ý lý do.
 *
 * ⚠️ Thay cho `ModulePinButton` (không có trạng thái khoá): chạm trần trước đây chỉ biết báo SAU khi bấm (dòng cảnh báo hiện
 * lên đẩy cả danh sách xuống — đúng cú "nhảy" bố cục lúc ghim). Giờ khoá sẵn + nói lý do ở mô tả tấm, không có gì chen vào.
 */
function PinToggle({
  disabled,
  pinned,
  title,
  onPress,
}: {
  disabled: boolean;
  pinned: boolean;
  title: string;
  onPress: () => void;
}) {
  const styles = pinToggle({ state: pinned ? 'pinned' : disabled ? 'blocked' : 'idle' });
  return (
    // ⛔ KHÔNG truyền `disabled` cho `Pressable`: nút bị khoá thì không nhận làm responder ⇒ cú chạm LỌT xuống hàng cha và MỞ phân
    // hệ (tấm đóng, điều hướng đi) — đúng lúc người dùng chỉ định ghim. Khoá chỉ nằm ở `accessibilityState` + dáng viên; chạm vẫn
    // tới `onPress`, nơi gọi nhận `full` từ store và rung nhịp "bị chặn" (lý do đã nói ở mô tả tấm).
    <Pressable
      accessibilityHint={
        disabled
          ? `Đã ghim đủ ${String(MAX_PINNED_MODULES)} phân hệ. Bỏ ghim một phân hệ khác trước.`
          : undefined
      }
      accessibilityLabel={pinned ? `Bỏ ghim ${title}` : `Ghim ${title} lên đầu Trang chủ`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: pinned }}
      className={styles.hit()}
      onPress={onPress}
    >
      {/* ⛔ `collapsable={false}`: viên chỉ có nền ở hai trong ba trạng thái — thiếu cờ này Android dựng view lúc nó mới CÓ nền mà
          không kèm `rounded-full` ⇒ viên tròn thành ô vuông (`docs/rules/styling-nativewind.md` → "Cạm bẫy"). */}
      <View className={styles.face()} collapsable={false}>
        {pinned ? (
          // Bộ icon không có nét đặc: `bulk` (ruột 20%) một mình nhạt — chồng thêm nét `linear` cùng màu cho viền cam rõ.
          <View>
            <Icon color="warning" name="favorite" size="sm" variant="bulk" />
            <View className="absolute">
              <Icon color="warning" name="favorite" size="sm" variant="linear" />
            </View>
          </View>
        ) : (
          <Icon color={disabled ? 'action-disabled-fg' : 'fg-2'} name="favorite" size="sm" />
        )}
      </View>
    </Pressable>
  );
}

/**
 * MỘT nhóm của `ModulePickerSheet` ("Phân hệ chính" / "Phân hệ khác"): tiêu đề nhóm (`Section`, vai `header` để trình đọc màn
 * hình nhảy giữa hai nhóm) + các hàng phân hệ dính nhau, kẻ ngăn trong NHÓM (hàng cuối không kẻ — khe giữa hai nhóm đã tách).
 *
 * Hàng: ô icon theo tông của phân hệ · tên (chữ chính) · mô tả · cuối hàng là nút ghim, hoặc mũi tên "mở ra" khi không ghim được.
 * ⚠️ Ghim KHÔNG đổi chỗ hàng (nhóm theo `placement`, thứ tự registry) — chỉ nút cuối hàng đổi dáng, cùng cỡ ⇒ không nhảy bố cục.
 * ⛔ Không tự khai `px-*`: nơi gọi bọc `SheetList` (lề 16 của tấm tràn viền) — khai thêm là tiêu đề nhóm thụt 32dp.
 */
export function ModulePickerGroup({ modules, pin, title, onOpen }: ModulePickerGroupProps) {
  return (
    <Section title={title} tone="default">
      <View accessibilityRole="menu">
        {modules.map((module, index) => {
          const pinned = pin?.pinned.includes(module.id) ?? false;
          return (
            <ListItem
              key={module.id}
              description={module.description}
              divider={index < modules.length - 1}
              emphasis="title"
              label={module.title}
              labelNumberOfLines={2}
              leading={<ModuleIconTile module={module} />}
              trailing={
                pin ? (
                  <PinToggle
                    disabled={pin.full && !pinned}
                    pinned={pinned}
                    title={module.title}
                    onPress={() => pin.onToggle(module.id)}
                  />
                ) : (
                  // Trang trí (không `label` ⇒ ẩn khỏi trình đọc màn hình): hàng đã là nút "mở phân hệ".
                  <Icon color="fg-2" name="arrow-right-small" size="sm" />
                )
              }
              onPress={() => onOpen(module)}
            />
          );
        })}
      </View>
    </Section>
  );
}
