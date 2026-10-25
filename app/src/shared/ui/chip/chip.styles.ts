import { type Insets } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style và số đo của `Chip`.
 *
 * Tách khỏi `Chip.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`) — không phải vì công thức dùng lại ở đâu khác.
 * Cùng lý do, cùng cách chia như `input/input.styles.ts`.
 */
export const chip = tv(
  {
    slots: {
      /**
       * `Pressable` chỉ là lớp nhận chạm — mọi thứ nhìn thấy nằm ở `root`.
       * Phải tách vì dáng vẻ phụ thuộc `pressed`, mà `pressed` chỉ có BÊN
       * TRONG render-prop, tức là ở lớp con.
       */
      pressable: '',
      root: 'flex-row items-center justify-center gap-2xs rounded-full border',
      /**
       * Khối nhãn, tách khỏi `root` để khe `trailing` đứng NGOÀI ô trợ năng —
       * vì sao thì xem chú thích trong `Chip.tsx`. `shrink` để nhãn dài co lại
       * chứ không đẩy dấu ✕ ra khỏi chip.
       */
      body: 'min-w-0 shrink flex-row items-center gap-2xs',
      avatar: 'overflow-hidden rounded-full bg-bg-3',
      avatarImage: 'h-full w-full',
      // 4dp đệm hai bên nhãn: Figma bọc chữ trong một khung riêng có Pa4,
      // nên khoảng cách chữ ↔ viền là đệm ngoài CỘNG 4 chứ không phải đệm ngoài.
      label: 'px-2xs text-center',
    },
    variants: {
      // Chiều cao / đệm / cỡ ảnh đại diện đo thẳng từ Figma (Size = 32 · 40 · 48).
      // ⚠️ Chiều cao là số CỨNG, nên nhãn phải có `maxFontSizeMultiplier` —
      // xem chú thích ở chỗ vẽ `<Text>` trong `Chip.tsx`.
      size: {
        sm: { root: 'h-control-xs pl-xs pr-xs', avatar: 'h-xl w-xl', label: 'text-label-md' },
        md: { root: 'h-control-sm pl-xs pr-xs', avatar: 'h-3xl w-3xl', label: 'text-body-lg' },
        lg: { root: 'h-control-md pl-sm pr-sm', avatar: 'h-3xl w-3xl', label: 'text-body-lg' },
      },
      // ⛔ Màu thương hiệu đi qua `border-brand`/`fg-brand`, không qua `primary-*`: thang
      // `primary-*` KHÔNG đảo theo chế độ nên `text-primary-7` trên chip tối còn 1.00:1.
      // `disabled` giữ nền trắng theo Figma, chỉ chữ đổi sang bậc `action-disabled-fg`.
      state: {
        default: { root: 'border-border-brand-subtle bg-bg-1', label: 'font-regular text-fg-1' },
        press: { root: 'border-border-brand-press bg-bg-1', label: 'font-regular text-fg-brand' },
        selected: {
          root: 'border-border-brand bg-surface-primary',
          label: 'font-semibold text-fg-brand',
        },
        disabled: {
          // Figma `Size=48, Disabled=on` (259:97196) khai đích danh
          // `Border/Ink/Disable` #E1E1E1 — token của repo là `border-ink-disabled`,
          // dành riêng cho trạng thái khoá. `border-1` (#E6E6E6) lệch một bậc:
          // gần như không thấy ở chế độ sáng, nhưng nó là viền TRUNG TÍNH chung,
          // nên đổi bảng màu một lần là chip khoá hết trông như bị khoá.
          root: 'border-border-ink-disabled bg-bg-1',
          label: 'font-regular text-action-disabled-fg',
        },
      },
      /** Có ảnh đại diện thì đệm trái thu lại, vì ảnh đã tròn sẵn (Figma: 8 → 4). */
      hasAvatar: {
        true: { root: 'pl-2xs' },
      },
      fullWidth: {
        true: { pressable: 'flex-1', root: 'w-full' },
      },
    },
    compoundVariants: [{ size: 'lg', hasAvatar: true, class: { root: 'pl-xs' } }],
    defaultVariants: { size: 'md', state: 'default' },
  },
  // ⛔ BẮT BUỘC. `tailwind-variants` tạo thực thể `twMerge` RIÊNG; không truyền
  // thì `label` vừa có cỡ chữ (`text-body-lg`) vừa có màu (`text-fg-1`) sẽ lặng lẽ
  // ĐÁNH RƠI cỡ chữ — chữ vẫn hiện, chỉ sai cỡ, không có lỗi nào báo.
  { twMergeConfig },
);

type ChipVariants = VariantProps<typeof chip>;

export type ChipSize = NonNullable<ChipVariants['size']>;

/**
 * Bù vùng chạm cho đủ 44dp theo chiều dọc.
 *
 * ⚠️ Quên là hỏng thật: chip `sm` chỉ cao 32dp — người dùng bấm trượt xuống
 * mép dưới, không có gì xảy ra, và họ bấm lại hai ba lần rồi kết luận app đơ.
 * Chỉ nới theo chiều DỌC: chip nằm cạnh nhau theo hàng ngang với khe 8dp, nới
 * ngang thì vùng chạm hai chip chồng lên nhau và cú chạm rơi vào nhầm chip.
 */
export const HIT_SLOP: Record<ChipSize, Insets | undefined> = {
  sm: { bottom: 6, top: 6 },
  md: { bottom: 2, top: 2 },
  lg: undefined,
};
