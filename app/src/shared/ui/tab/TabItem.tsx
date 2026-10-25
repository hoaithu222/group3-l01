import { Pressable, Text, View, type Insets, type LayoutChangeEvent } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { TabItemData, TabsVariant } from './tab.types';

/**
 * Một tab trong `Tabs`.
 *
 * Số đo lấy từ Figma (`259:93807`): cao 40dp ở kiểu viên nén (đệm dọc 8 + icon
 * 24), đệm ngang 16, cách icon 8, nhãn 14/20 semibold. Kiểu gạch chân cao 48dp
 * với vạch 2dp chạy hết bề rộng tab.
 */
const tabItem = tv(
  {
    slots: {
      /** Lớp nhận chạm. Dáng vẻ nằm ở `root` vì nó phụ thuộc `pressed`. */
      pressable: '',
      /**
       * ⚠️ `px-2 phone:px-4` — mobile-first, đệm 16dp của Figma chỉ áp từ 390dp.
       *
       * Ở chế độ chia đều (`grow`), 4 tab trên máy 320dp cho mỗi tab 80dp; đệm
       * 16+16 ăn mất 32 ⇒ nhãn chỉ còn 48dp và "Chuyển tiền" cụt thành "Chuy…".
       * Thu ĐỆM chứ ⛔ KHÔNG thu chiều cao hay cỡ chữ: vùng chạm vẫn là cả cột
       * (`pressable` mang `flex-1`), nên co đệm không lấy đi một dp chạm nào.
       */
      root: 'flex-row items-center justify-center gap-2 px-2 phone:px-4',
      /**
       * ⛔ `shrink` — thiếu nó thì `numberOfLines={1}` ở dưới VÔ TÁC DỤNG.
       * `<Text>` của React Native mặc định `flexShrink: 0`, nên bề rộng nhãn
       * không bao giờ bị chặn và không có gì để cắt bớt. Ca đo được: 3 tab CÓ
       * ICON chia đều trên máy 360dp ⇒ mỗi tab 106.7dp, trừ `px-2` còn 90.7;
       * icon 24 + khe 8 + "Chuyển tiền" ~78 = 110 ⇒ nhãn trào ra ~10dp mỗi bên
       * và ĐÈ LÊN tab bên cạnh, không có lỗi nào báo.
       *
       * ⚠️ Đây mới là chỗ phải sửa, không phải cái đệm: `px-4 → px-2` ở trên
       * đã thu hết mức thu được mà vẫn thiếu ~19dp.
       *
       * ⚠️ `shrink` chứ KHÔNG phải `flex-1`: `root` canh giữa
       * (`justify-center`), cho nhãn `flex-1` là nó chiếm hết chỗ trống ⇒ icon
       * dạt sát mép trái, huy hiệu dạt sát mép phải, cụm tab không còn ở giữa.
       *
       * ⚠️ KHÔNG cần `min-w-0` (thói quen mang từ web sang): Yoga không có
       * `min-width: auto`, nên riêng `flexShrink: 1` đã đủ cho nhãn co xuống
       * dưới bề rộng nội dung.
       */
      label: 'shrink text-label-md font-semibold',
      /**
       * Figma KHÔNG vẽ badge cho tab. Hình ở đây dựng theo badge đếm của phần còn lại trong hệ: chấm tròn 16dp, nền
       * đỏ, số 10/16. ⚠️ Phải là CẶP `action-error`/`action-error-fg` (đảo cùng chiều khi sang chế độ tối; đo được
       * 6.32:1 sáng · 7.02:1 tối) — `action-fg` là màu chữ ghép với nền XANH thương hiệu.
       * ⚠️ `min-h-4` chứ KHÔNG phải `h-4`: hộp 16dp vừa khít lineHeight 16 của `text-label-xs`, phóng cỡ chữ hệ thống một
       * nấc là con số trào ra ngoài vòng tròn. Hộp nở theo chữ, vẫn gọn trong tab nhờ trần `BADGE_MAX_FONT_SCALE`.
       */
      badge: 'min-h-4 min-w-4 items-center justify-center rounded-full bg-action-error px-1',
      badgeLabel: 'text-label-xs font-semibold text-action-error-fg',
    },
    variants: {
      variant: {
        pill: { root: 'h-10 rounded-full' },
        underline: { root: 'h-12' },
      },
      selected: {
        true: {},
        // Tab không được chọn: chữ và icon cùng một mực phụ ở CẢ HAI kiểu.
        false: { label: 'text-fg-2' },
      },
      /** Chia đều bề rộng hàng. Tắt khi hàng cuộn ngang — lúc đó tab ôm nội dung. */
      grow: { true: { pressable: 'flex-1' } },
      pressed: { true: {} },
    },
    compoundVariants: [
      // ⛔ Tab viên nén CHƯA chọn PHẢI có nền đặc trùng khay (`bg-bg-1`), không phải "không nền": đã đo trên máy Android,
      // tab đổi từ KHÔNG nền → `bg-action-base` lúc được chọn thì MẤT `rounded-full` (viên nén thành hình chữ nhật vuông
      // góc sau mỗi lần chạm; lần dựng đầu vẫn tròn). Có nền từ đầu thì chọn chỉ là đổi màu → bo góc còn nguyên.
      { variant: 'pill', selected: false, class: { root: 'bg-bg-1' } },
      {
        variant: 'pill',
        selected: true,
        class: { root: 'bg-action-base', label: 'text-action-fg' },
      },
      // ⛔ Phản hồi nhấn của viên nén KHÔNG dùng `opacity` (làm cả viên nén tím phai còn tab chưa chọn gần như không đổi):
      // đổi NỀN theo token nhấn như `Button` — `action-press` (đảo chiều đúng ở chế độ tối) / `action-tint`. Đặt SAU hai
      // nền trên để đè đúng. Kiểu gạch chân không có nền nên vẫn dùng độ mờ.
      { variant: 'pill', selected: true, pressed: true, class: { root: 'bg-action-press' } },
      { variant: 'pill', selected: false, pressed: true, class: { root: 'bg-action-tint' } },
      { variant: 'underline', pressed: true, class: { root: 'opacity-60' } },
      {
        variant: 'underline',
        selected: true,
        // Vạch chỉ báo (màu NHẤN) giờ là MỘT vạch trượt chung của cả hàng — xem `TabsIndicator.tsx`.
        class: { label: 'text-fg-brand' },
      },
    ],
    defaultVariants: { selected: false, variant: 'pill' },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

/**
 * Màu icon phải là TOKEN dạng chuỗi, không phải className: `<Icon>` nhuộm SVG
 * qua prop `color`, mà prop đó không nhận class.
 */
function iconColor(variant: TabsVariant, selected: boolean): ThemeColorKey {
  if (!selected) return 'fg-2';
  return variant === 'pill' ? 'action-fg' : 'fg-brand';
}

/**
 * Item kiểu viên nén cao đúng 40dp theo Figma (`259:93807`) — thiếu 4dp so với
 * ngưỡng chạm 44dp của `docs/rules/mobile-ux.md`. Nới 2dp trên/dưới thay vì
 * phóng to hình: phóng to thì khay ngoài 48dp sai theo cả hàng.
 * ⚠️ Kiểu gạch chân đã cao 48dp nên KHÔNG nới — nới thêm là vùng chạm ăn sang
 * nội dung ngay dưới hàng tab.
 */
const PILL_HIT_SLOP: Insets = { bottom: 2, top: 2 };

/**
 * Trần hệ số phóng cỡ chữ của NHÃN tab.
 *
 * ⚠️ Chiều cao tab là RÀNG BUỘC THIẾT KẾ: kiểu `pill` nằm trong một khay bo
 * tròn cao 48dp (tab 40 + đệm 4 mỗi bên), tab nào cao hơn là phá khay. Nên ⛔
 * không đổi sang `min-h-` — chặn cỡ chữ.
 *
 * Số lấy từ chỗ trống thật: (chiều cao tab − 4dp thở) ÷ lineHeight 20 của
 * `text-label-md` ⇒ pill 40 → 1.8 · underline 48 → 2.2, mà 2.0 đã là mức phóng
 * tối đa của Android nên ghi 2. Bỏ trần thì ở mức "Cỡ chữ: Lớn nhất" nhãn cao
 * 40dp khít đúng tab `pill` và bị cắt mất chân dấu tiếng Việt.
 */
const LABEL_MAX_FONT_SCALE: Record<TabsVariant, number> = { pill: 1.8, underline: 2 };

/**
 * Trần cho con số trong badge. Hộp badge đã là `min-h-` nên nó nở theo chữ —
 * trần này chỉ để nó không nở quá tab: 16 × 1.3 ≈ 21dp, còn thừa chỗ trong tab
 * 40dp kể cả khi nhãn bên cạnh cũng đang phóng to.
 */
const BADGE_MAX_FONT_SCALE = 1.3;

interface TabItemProps {
  grow: boolean;
  item: TabItemData;
  /** Chỉ kiểu `underline` cần: `Tabs` đo vị trí từng tab để trượt vạch chỉ báo tới đó. */
  onLayout?: (event: LayoutChangeEvent) => void;
  onPress: () => void;
  selected: boolean;
  variant: TabsVariant;
}

export function TabItem({ grow, item, onLayout, onPress, selected, variant }: TabItemProps) {
  return (
    <Pressable
      accessibilityLabel={item.accessibilityLabel}
      accessibilityRole="tab"
      /** ⚠️ Vai `tab` đọc khoá `selected` — `checked` là của checkbox/switch. */
      accessibilityState={{ selected }}
      className={tabItem({ grow }).pressable()}
      hitSlop={variant === 'pill' ? PILL_HIT_SLOP : undefined}
      onLayout={onLayout}
      onPress={onPress}
    >
      {({ pressed }) => {
        const styles = tabItem({ pressed, selected, variant });

        return (
          <View className={styles.root()}>
            {item.icon ? <Icon color={iconColor(variant, selected)} name={item.icon} /> : null}
            {/* `numberOfLines={1}`: nhãn dài làm tab cao gấp đôi và cả hàng so le.
                `maxFontSizeMultiplier`: chiều cao tab là số cứng — xem
                `LABEL_MAX_FONT_SCALE`. */}
            <Text
              className={styles.label()}
              maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE[variant]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            {item.badge == null ? null : (
              <View className={styles.badge()}>
                <Text
                  className={styles.badgeLabel()}
                  maxFontSizeMultiplier={BADGE_MAX_FONT_SCALE}
                  numberOfLines={1}
                >
                  {item.badge}
                </Text>
              </View>
            )}
          </View>
        );
      }}
    </Pressable>
  );
}
