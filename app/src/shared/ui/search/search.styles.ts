import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `SearchInput`.
 *
 * ── Số đo lấy từ Figma "BIDV OMNI MB" › section Search (259:96728) ───────────
 * Cao **48** · bo TRÒN HOÀN TOÀN (`Border/Rounded` = 9999) · đệm ngang 16
 * (`Padding/Pa16`) · khe giữa icon và chữ 8 (`Gap/Ga8`) · icon kính lúp **24** ·
 * nút xoá 20 · viền 1.
 *
 * ⚠️ 48 = `Padding/Pa12` + dòng chữ `BODY/T16-Regular` (lineHeight 24) +
 * `Padding/Pa12`, và đo pixel 10/10 hàng của cả hai kiểu đều ra 48 (viền trên
 * y=1705 → viền dưới y=1752). Bản trước ghi 40 và phải bù `hitSlop` cho đủ
 * ngưỡng chạm 44dp; 48 ≥ 44 nên ⛔ KHÔNG còn `hitSlop` nào ở `TextInput` —
 * thấy lại là dấu hiệu ai đó vừa hạ chiều cao xuống.
 *
 * ── Hai kiểu của bản thiết kế ───────────────────────────────────────────────
 * `stroke` (mặc định) — nền trắng + viền mảnh, dùng trên nền xám của trang.
 * `white`             — nền trắng KHÔNG viền, dùng khi ô nằm trên nền màu
 *                       (dải header xanh). Viền vẫn phải khai `border-transparent`:
 *                       ⛔ để trống thì React Native lấy borderColor mặc định là
 *                       ĐEN, và ô tìm kiếm có một khung đen quanh mình.
 *
 * ⚠️ MÀU không chép từ Figma (#ffffff / #eeeeee / #00453c / #e6e6e6) mà đi qua
 * token, nếu không thì chế độ tối hiện một ô trắng chói giữa nền đen.
 *
 * ⛔ `twMergeConfig` bắt buộc: `tailwind-variants` tạo thực thể `twMerge` RIÊNG.
 * Không truyền thì slot nhận cả cỡ chữ (`text-body-lg`) lẫn màu chữ (`text-fg-1`)
 * sẽ lặng lẽ ĐÁNH RƠI cỡ chữ — chữ vẫn hiện, chỉ sai cỡ, không lỗi nào báo.
 */
export const searchStyles = tv(
  {
    slots: {
      /**
       * ⚠️ `min-h-12` + `py-sm` chứ KHÔNG phải `h-control-md`, và tổng vẫn ra
       * đúng 48 của bản vẽ (12 + dòng chữ 24 + 12).
       *
       * Vì sao đổi: Android cho phóng cỡ chữ hệ thống tới 2×. Với chiều cao
       * CỨNG 48dp, dòng `text-body-lg` (16/24) ở mức "Lớn nhất" cao 48dp khít
       * khung rồi bị cắt mất chân dấu tiếng Việt (`Ộ`, `Ẳ`) — mà ô tìm kiếm
       * KHÔNG có ràng buộc "phải cao bằng ô bên cạnh" như hàng nút, nên đây là
       * số đo tiện tay chứ không phải ràng buộc thiết kế. Cho ô cao lên là xong,
       * không phải chặn cỡ chữ của người dùng.
       *
       * ⛔ `min-h-control-md` KHÔNG tồn tại: thang `control-*` chỉ nối vào
       * `theme.height`, còn `minHeight` ăn theo thang giãn cách. Gõ vào là
       * Tailwind không sinh class nào và NativeWind bỏ qua lặng lẽ.
       *
       * ⚠️ `tablet:max-w-content` (720dp) là phần THÊM so với bản vẽ (bản vẽ chỉ
       * có khung 375dp): ô tìm kiếm dài 1200dp trên máy tính bảng nằm ngang trông
       * như lỗi bố cục. CÙNG token với trần nội dung của `Screen` (không phải số
       * riêng): trong màn có trần, ô thẳng mép phải với thẻ/nút bên dưới; bản 560
       * cũ hụt 128dp so với cột 688. `max-w` chỉ CHẶN nên máy hẹp 320dp vẫn co lại
       * được; nơi gọi cần ô tràn hết bề ngang thì truyền `className="tablet:max-w-none"`.
       */
      field:
        'min-h-12 w-full flex-row items-center gap-xs rounded-full border px-4 py-sm tablet:max-w-content',
      /**
       * `p-0` bắt buộc: `TextInput` trên Android tự thêm đệm mặc định của nền
       * tảng. Để nguyên thì chữ lệch khỏi tâm ô và ô cao hơn 48dp của thiết kế.
       *
       * ⛔ KHÔNG còn `h-full`: chiều cao của khung nay là TỐI THIỂU, nên
       * `h-full` (100% của một khung chưa biết cao bao nhiêu) không giải ra
       * được số nào, và nó chặn đúng cái việc ô nhập tự cao lên khi người dùng
       * phóng cỡ chữ. Chữ vẫn nằm giữa nhờ `items-center` của khung.
       */
      input: 'flex-1 p-0 text-body-lg text-fg-1',
      clearButton: 'items-center justify-center',
    },
    variants: {
      variant: {
        stroke: { field: 'border-border-1 bg-bg-input' },
        white: { field: 'border-transparent bg-bg-input' },
      },
      /**
       * Khai SAU `variant` là có chủ đích: `tailwind-variants` gộp theo thứ tự
       * khai báo, nên màu viền của trạng thái mới đè được màu viền của kiểu.
       */
      state: {
        default: {},
        /** Figma: `Border/Primary/Active` — viền đậm màu thương hiệu lúc focus. */
        focused: { field: 'border-border-brand' },
        /**
         * Figma vẽ ô khoá CÓ viền `Border/Grey/Disable` #d9d9d9 (token repo
         * `border-2`) trên nền #e6e6e6 — đo pixel y=2232: x=429 là #d9d9d9,
         * từ x=430 mới sang #e6e6e6.
         *
         * ⛔ Đừng quay lại `border-transparent`: nền ô khoá và nền trang gần
         * nhau tới mức không viền là ô tan biến, và người dùng không còn thấy
         * "có một ô tìm kiếm đang bị khoá" — họ chỉ thấy một mảng xám.
         *
         * `disabled-1` đã pha sẵn alpha ⇒ ⛔ đừng thêm modifier `/xx`.
         */
        disabled: {
          field: 'border-border-2 bg-disabled-1',
          input: 'text-action-disabled-fg',
        },
      },
    },
    defaultVariants: { variant: 'stroke', state: 'default' },
  },
  { twMergeConfig },
);

export type SearchVariants = VariantProps<typeof searchStyles>;

/** Kiểu nền của ô tìm kiếm — `stroke` cho nền xám, `white` cho nền màu. */
export type SearchVariant = NonNullable<SearchVariants['variant']>;

/** Trạng thái suy ra trong component, không phải prop công khai. */
export type SearchState = NonNullable<SearchVariants['state']>;
