import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { Sparkles } from '../effects/Sparkles';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';
import { BannerBackdrop } from './BannerBackdrop';
import { BANNER_TONE, type BannerTone } from './banner-tone';

const banner = tv(
  {
    slots: {
      // `min-h-24` = 96dp: cao gọn, không ăn hết màn. Chữ dài hoặc có khe hành động thì banner CAO THÊM chứ không cắt chữ.
      root: 'min-h-24 flex-row items-center gap-xl overflow-hidden rounded-md px-md py-md',
      // ⚠️ `px-md` (16) + ô icon `size-6xl` (64) phải khớp `HALO_OFFSET` ở `BannerBackdrop` — quầng nền tâm ở ô icon.
      tile: 'size-6xl items-center justify-center rounded-md border-hairline border-border-1 bg-bg-1',
      // ⛔ `flex-1` bắt buộc: con của `flex-row` mặc định không co, tiêu đề dài sẽ đẩy ô icon ra khỏi mép phải.
      text: 'flex-1 gap-2xs',
      title: 'text-header-sm font-semibold text-fg-1',
      // `fg-2` chứ không `fg-3`: chữ mô tả trên nền `surface-*` cần ≥ 4.5:1 (xem tính toán ở `BannerBackdrop`).
      description: 'text-body-md text-fg-2',
    },
  },
  { twMergeConfig },
);

export interface ModuleBannerProps {
  /** Khe hành động dưới mô tả (thường một `Button size="sm"`). ⚠️ Có khe này thì banner cao hơn ~48dp. */
  action?: ReactNode;
  className?: string;
  /** Câu mô tả ngắn 1–2 dòng — nói phân hệ này làm gì hoặc trạng thái hiện tại; tối đa 3 dòng, dài hơn bị cắt. */
  description?: string;
  /** Icon lớn (twotone) trong ô bo tròn bên phải — chọn icon ĐÚNG NGHĨA của phân hệ. */
  icon: IconName;
  title: string;
  /** Tông màu — cùng bảy tông với `IconTile`, để ô icon trong danh sách bên dưới khớp màu banner. Mặc định `brand`. */
  tone?: BannerTone;
}

/**
 * Dải đầu màn "cửa vào" của một phân hệ — nền gradient nhẹ theo tông, quầng tròn mờ quanh icon lớn, tiêu đề + mô tả,
 * khe hành động tuỳ chọn. Thay cho khối chữ thuần trong thẻ trắng ở đầu màn Học/Lịch họp/Cố vấn/Thành tích…
 *
 * ```tsx
 * <ModuleBanner icon="calendar" title="Lịch họp" description="Cuộc họp sắp tới của bạn và nhóm" tone="info" />
 * ```
 *
 * ── Vì sao không dùng ảnh minh hoạ ───────────────────────────────────────────────────────────────────────────────────
 * `assets/images` không có ảnh minh hoạ và không thêm ảnh nhị phân/thư viện mới; hình dựng bằng `react-native-svg`
 * (`BannerBackdrop`) + token màu nên đổi theo chế độ sáng/tối mà không có file nào phải xuất lại.
 *
 * ── Trợ năng ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Tiêu đề mang `accessibilityRole="header"` (mốc để trình đọc màn hình nhảy giữa các khối). Phần trang trí (nền SVG,
 * ô icon) bị ẩn — ô icon là hình minh hoạ, nghĩa đã nằm ở tiêu đề. ⛔ Đừng đặt `AppBar` `title` trùng chữ với tiêu đề
 * banner rồi để cả hai đều là `header`: hai tiêu đề cùng nghĩa liền nhau làm TalkBack đọc lặp; banner nên nói điều MÀ
 * thanh tiêu đề chưa nói (mô tả phân hệ, trạng thái), hoặc màn dùng banner làm tiêu đề duy nhất.
 *
 * ⚠️ Banner không có `onPress`: nó là phần đầu trang chứ không phải nút. Cần bấm được thì đặt nút vào `action`.
 */
export function ModuleBanner({
  action,
  className,
  description,
  icon,
  title,
  tone = 'brand',
}: ModuleBannerProps) {
  const styles = banner();

  return (
    <View className={styles.root({ className })}>
      {/* ⛔ Trang trí thuần: `pointerEvents="none"` để không nuốt cú chạm của khe hành động; hai prop ẩn đi CÙNG NHAU
          (iOS chỉ nghe prop đầu, Android chỉ nghe prop sau). */}
      <View
        accessibilityElementsHidden
        className="absolute inset-0"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <BannerBackdrop tone={tone} />
      </View>
      <View className={styles.text()}>
        <Text accessibilityRole="header" className={styles.title()} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text className={styles.description()} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        {action ? <View className="mt-xs items-start">{action}</View> : null}
      </View>
      {/* Ba sao nhỏ cùng tông lấp lánh quanh ô icon — điểm nhấn của "cửa vào" phân hệ. ⚠️ Sao ≤ 10dp, lệch nhịp, chậm: KHÔNG
          tính là "vòng lặp nổi bật" của màn (`MOTION_LOOP`); tự đứng yên khi bật "Giảm chuyển động". */}
      <View className="relative">
        <View className={styles.tile()}>
          <Icon color={BANNER_TONE[tone].ink} name={icon} size="xl" variant="twotone" />
        </View>
        <Sparkles className="-inset-3" count={3} size={10} tone={BANNER_TONE[tone].ink} />
      </View>
    </View>
  );
}
