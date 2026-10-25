import type { Insets } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import type { IconSize, ThemeColorKey } from '@/shared/theme';
import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Button`. (`LinkButton` có `link-button.styles.ts` riêng.)
 *
 * Tách khỏi file component vì `.tsx` phải ≤ 200 dòng (xem
 * `src/shared/ui/AGENTS.md`) — không phải vì công thức dùng lại ở đâu khác.
 * Cùng khuôn với `input/input.styles.ts`.
 *
 * ── Số đo lấy từ Figma "BIDV OMNI MB" ───────────────────────────────────────
 * Section `Button default` (259:80877) · `Button status` (259:84296) ·
 * `Buttons Link` (259:87708), thuộc tính biến thể trong Figma:
 * `Theme` × `Type` × `Size` × `State` × `Only icon`.
 *
 * Đo trên `Theme=Ma` (khách phổ thông) — `Pr`/`Vv` là bộ màu khác của CÙNG hình
 * học, và ở đây việc đổi màu theo hạng khách là việc của hệ token chứ không
 * phải của component.
 *
 *   Size=56px → cao 56 · đệm ngang 20 + 8 (khung nhãn) · chữ 16/24 · icon 24
 *   Size=48px → cao 48 · đệm ngang 16 + 8                · chữ 16/24 · icon 24
 *   Size=40px → cao 40 · đệm ngang 16 + 4                · chữ 16/24 · icon 24
 *   Size=32px → cao 32 · đệm ngang  8 + 2                · chữ 14/20 · icon 20
 *   Khe icon ↔ nhãn 4 · bo góc 9999 (`rounded-full`) · viền 1 ở nhóm outline.
 *
 * ⚠️ Đệm của Figma nằm ở HAI lớp: khung `container` (px-20/16/16/8) và khung
 * `label` bọc riêng chữ (px-8/8/4/2). Giữ nguyên cách chia đó — nếu cộng dồn
 * vào một chỗ thì nút CÓ icon sẽ thừa đệm ở phía icon.
 *
 * ⚠️ MÀU không chép từ Figma. `#00453C` → `bg-action-base`, không phải
 * `bg-[#00453C]`: chỉ token mới đổi được theo chế độ sáng/tối.
 *
 * ⛔ `twMergeConfig` bắt buộc: `tailwind-variants` tạo thực thể `twMerge` RIÊNG.
 * Không truyền thì slot `label` nhận cả cỡ chữ (`text-label-lg`) lẫn màu chữ
 * (`text-action-fg`) sẽ lặng lẽ ĐÁNH RƠI cỡ chữ — chữ vẫn hiện, chỉ sai cỡ, và
 * không có lỗi nào báo.
 */
export const buttonStyles = tv(
  {
    slots: {
      /**
       * Lớp nhận chạm. Mọi thứ NHÌN THẤY nằm ở `root`, phải tách vì dáng vẻ phụ
       * thuộc `pressed`, mà `pressed` chỉ có BÊN TRONG render-prop của
       * `Pressable`, tức là ở lớp con.
       *
       * `self-start` để nút ôm sát nội dung như trong Figma; đặt trong một cột
       * `items-stretch` mà không có nó thì nút bị kéo hết bề ngang màn hình.
       */
      pressable: 'self-start',
      root: 'relative flex-row items-center justify-center overflow-hidden rounded-full',
      content: 'flex-row items-center justify-center gap-2xs',
      label: 'text-center font-semibold',
      /** Phủ kín `root` để vòng quay nằm ĐÚNG chỗ nhãn vừa bị làm trong suốt. */
      spinner: 'absolute inset-0 items-center justify-center',
    },

    variants: {
      /**
       * Tên trong Figma → tên ở đây:
       *   Primary            → primary            (nền xanh đậm, chữ trắng)
       *   Secondary          → secondary          (viền xanh, nền trong suốt)
       *   Tertiary           → tertiary           (nền xanh nhạt)
       *   Neutral            → neutral            (nền đen)
       *   Neutral secondary  → neutral-secondary  (viền đen)
       *   Neutral tertiary   → neutral-tertiary   (nền xám)
       *   White              → white              (nền trắng, dùng trên nền tối)
       *   White secondary    → white-secondary    (viền trắng, dùng trên nền tối)
       *   Red / Green / Blue / Orange (+ Secondary) → danger / success / info /
       *     warning (+ `-secondary`) — đặt theo NGỮ NGHĨA chứ không theo màu:
       *     "nút đỏ" đổi màu theo theme thì tên gọi theo màu thành nói dối.
       */
      variant: {
        primary: { root: 'bg-action-base', label: 'text-action-fg' },
        secondary: { root: 'border-hairline border-border-brand', label: 'text-fg-brand' },
        tertiary: { root: 'bg-action-tint', label: 'text-fg-brand' },
        /**
         * ⚠️ `action-ink-fg`, KHÔNG phải `action-fg`. Hai token này chỉ trùng
         * nhau ở chế độ SÁNG. Ở chế độ tối `action-base` hoá sáng nên
         * `action-fg` thành xanh đậm — dùng nhầm thì chữ xanh đậm nằm trên nền
         * mực. Mỗi nền có token chữ RIÊNG chính là vì ca này.
         */
        neutral: { root: 'bg-action-ink', label: 'text-action-ink-fg' },
        'neutral-secondary': { root: 'border-hairline border-border-ink', label: 'text-fg-1' },
        'neutral-tertiary': { root: 'bg-action-grey', label: 'text-fg-1' },
        /**
         * `white` sống trên ảnh bìa / header tối ở CẢ HAI theme, nên nền và chữ
         * phải cố định. `text-fg-1` sẽ thành trắng ở chế độ tối → chữ trắng trên
         * nền trắng; `neutral-10` (#1A1A1A) giống nhau ở hai theme nên an toàn.
         */
        white: { root: 'bg-action-white', label: 'text-neutral-10' },
        'white-secondary': {
          root: 'border-hairline border-border-white',
          label: 'text-action-white',
        },
        /**
         * Nhóm trạng thái: nền `action-<họ>`, chữ `action-<họ>-fg`.
         * ⛔ Đừng thay bằng `text-action-fg` (trắng): ở chế độ tối nền của nhóm
         * này là bậc SÁNG (#F3B0B0…), chữ trắng trên đó không đọc được.
         */
        danger: { root: 'bg-action-error', label: 'text-action-error-fg' },
        'danger-secondary': { root: 'border-hairline border-border-error', label: 'text-error' },
        success: { root: 'bg-action-success', label: 'text-action-success-fg' },
        'success-secondary': {
          root: 'border-hairline border-border-success',
          label: 'text-success',
        },
        info: { root: 'bg-action-info', label: 'text-action-info-fg' },
        'info-secondary': { root: 'border-hairline border-border-info', label: 'text-info' },
        warning: { root: 'bg-action-warning', label: 'text-action-warning-fg' },
        'warning-secondary': {
          root: 'border-hairline border-border-warning',
          label: 'text-warning',
        },
      },

      /** 56 · 48 · 40 · 32 → `lg` · `md` · `sm` · `xs`. Trùng khít `h-control-*`. */
      size: {
        lg: { root: 'h-control-lg px-lg', label: 'px-xs text-label-lg' },
        md: { root: 'h-control-md px-md', label: 'px-xs text-label-lg' },
        sm: { root: 'h-control-sm px-md', label: 'px-2xs text-label-lg' },
        xs: { root: 'h-control-xs px-xs', label: 'px-3xs text-label-md' },
      },

      /** `Only icon=On`: ô vuông, không đệm ngang (bề rộng ở compound bên dưới). */
      iconOnly: {
        true: { root: 'px-0' },
      },

      /**
       * Chiếm hết bề ngang — dáng nút chính ở đáy màn hình.
       *
       * ⚠️ Trần bề rộng ở `tablet:` (≥600dp) là phần THÊM so với bản vẽ: bản vẽ
       * chỉ có khung điện thoại 375dp. Trên máy tính bảng nằm ngang, một nút
       * "Xác nhận" kéo dài 800dp trông như lỗi bố cục và ngón cái không với tới
       * hai đầu. 420 ≈ bề ngang của chiếc điện thoại rộng nhất, tức nút giữ
       * đúng tỉ lệ mà người dùng đã quen. Nơi gọi cần nút tràn thật (hộp thoại
       * toàn màn hình) thì truyền **`pressableClassName="tablet:max-w-none"`**.
       *
       * ⛔ Trần đặt ở `pressable`, KHÔNG ở `root`: `root` nằm BÊN TRONG lớp
       * nhận chạm, nên trần đặt ở đó chỉ thu HÌNH VẼ lại còn vùng chạm vẫn dài
       * hết bề ngang — người dùng bấm vào chỗ trống bên cạnh nút mà nút vẫn ăn
       * cú chạm, và không có lỗi nào báo.
       *
       * ⛔ Hệ quả: đường thoát PHẢI là `pressableClassName`, không phải
       * `className`. Prop `className` đi vào slot `root` (xem `Button.tsx`),
       * còn `pressable` dựng bằng `buttonStyles({ fullWidth }).pressable(…)` —
       * `tablet:max-w-none` truyền qua `className` rơi vào một node KHÔNG mang
       * trần: không lỗi, không cảnh báo, nút vẫn kẹt 420dp. Bản trước của chú
       * thích này hứa đúng như vậy suốt một thời gian.
       */
      fullWidth: {
        true: {
          pressable: 'w-full self-stretch tablet:max-w-[420px] tablet:self-center',
          root: 'w-full',
        },
      },

      /**
       * Trạng thái suy ra trong component, KHÔNG phải prop công khai.
       * Thân rỗng vì mọi hiệu ứng nằm ở `compoundVariants` — chúng phụ thuộc cả
       * `variant`, và tv() áp compound SAU mọi variant nên đè đúng thứ tự.
       *
       * ⛔ Figma còn `Hover` và `Focus`: BỎ. Điện thoại không có con trỏ chuột,
       * và `Focus` chỉ có nghĩa với bàn phím ngoài.
       */
      state: {
        default: {},
        press: {},
        disabled: {},
        loading: {},
      },
    },

    compoundVariants: [
      // ── Nút chỉ-icon: vuông, cạnh bằng đúng chiều cao ──────────────────────
      { iconOnly: true, size: 'lg', class: { root: 'w-14' } },
      { iconOnly: true, size: 'md', class: { root: 'w-12' } },
      { iconOnly: true, size: 'sm', class: { root: 'w-10' } },
      { iconOnly: true, size: 'xs', class: { root: 'w-8' } },

      // ── PRESS ─────────────────────────────────────────────────────────────
      { state: 'press', variant: 'primary', class: { root: 'bg-action-press' } },
      { state: 'press', variant: 'secondary', class: { root: 'border-border-brand-press' } },
      /**
       * ⚠️ Nhãn giữ `fg-brand` y như lúc thường, ⛔ KHÔNG đổi sang `action-press`.
       *
       * `action-press` là token NỀN, không phải token chữ. Trên bảng màu tối
       * CŨ, đặt nó lên nền `action-tint-strong` chỉ được **3.84:1** — dưới
       * ngưỡng 4.5 của chữ thường, và chỉ hỏng ở một chế độ nên mắt thường
       * không bắt được (`npm run check:contrast` mới là thứ tìm ra).
       * ⚠️ Bảng màu tối dựng lại kéo cặp đó lên **5.83:1**, tức là bây giờ nó
       * ĐẠT — nhưng nó đạt nhờ bảng màu, không nhờ luật nào, và lần chỉnh
       * `action-press` sau là mất. `fg-brand` là token CHỮ, cho
       * **6.76:1 sáng · 5.72:1 tối**.
       *
       * Phản hồi khi nhấn vẫn thấy rõ: chính cái NỀN đổi từ `action-tint` sang
       * `action-tint-strong`. Không cần đổi thêm màu chữ.
       */
      {
        state: 'press',
        variant: 'tertiary',
        class: { root: 'bg-action-tint-strong' },
      },
      { state: 'press', variant: 'neutral', class: { root: 'bg-action-ink-press' } },
      { state: 'press', variant: 'neutral-secondary', class: { root: 'border-border-ink-press' } },
      { state: 'press', variant: 'neutral-tertiary', class: { root: 'bg-action-grey-press' } },
      { state: 'press', variant: 'white', class: { root: 'bg-action-white-press' } },
      { state: 'press', variant: 'white-secondary', class: { root: 'border-border-white-medium' } },
      // Nhóm trạng thái: bậc `-press` riêng, đúng `Background/<họ>/Press` của Figma.
      { state: 'press', variant: 'danger', class: { root: 'bg-action-error-press' } },
      { state: 'press', variant: 'danger-secondary', class: { root: 'border-action-error-press' } },
      { state: 'press', variant: 'success', class: { root: 'bg-action-success-press' } },
      {
        state: 'press',
        variant: 'success-secondary',
        class: { root: 'border-action-success-press' },
      },
      { state: 'press', variant: 'info', class: { root: 'bg-action-info-press' } },
      { state: 'press', variant: 'info-secondary', class: { root: 'border-action-info-press' } },
      { state: 'press', variant: 'warning', class: { root: 'bg-action-warning-press' } },
      {
        state: 'press',
        variant: 'warning-secondary',
        class: { root: 'border-action-warning-press' },
      },

      // ── DISABLE ───────────────────────────────────────────────────────────
      {
        state: 'disabled',
        variant: [
          'primary',
          'tertiary',
          'neutral-tertiary',
          'danger',
          'success',
          'info',
          'warning',
        ],
        class: { root: 'bg-action-disabled', label: 'text-action-disabled-fg' },
      },
      /** Nút nền MỰC có bậc khoá riêng (Figma `Background/Ink/Disable` #E1E1E1). */
      {
        state: 'disabled',
        variant: 'neutral',
        class: { root: 'bg-action-disabled-ink', label: 'text-action-disabled-fg' },
      },
      {
        state: 'disabled',
        variant: [
          'secondary',
          'danger-secondary',
          'success-secondary',
          'info-secondary',
          'warning-secondary',
        ],
        class: { root: 'border-border-2 bg-transparent', label: 'text-action-disabled-fg' },
      },
      {
        state: 'disabled',
        variant: 'neutral-secondary',
        class: {
          root: 'border-border-ink-disabled bg-transparent',
          label: 'text-action-disabled-fg',
        },
      },
      {
        state: 'disabled',
        variant: 'white',
        class: { root: 'bg-action-white-disabled', label: 'text-action-disabled-fg' },
      },
      /**
       * ⚠️ Figma TÔ NỀN nút viền-trắng lúc khoá, không để nó rỗng:
       * `Background/White/Disable` = `#FFFFFFCC` (đo được `#CDCDCD` trên nền
       * bảng `#070707` ⇒ α = 0.80), chữ `#969696`. Tức nó trông y hệt `white`
       * lúc khoá.
       *
       * ⛔ Đừng "sửa" thành viền trắng mờ: để trong suốt trên ảnh bìa tối thì
       * nút khoá gần như BIẾN MẤT — người dùng không thấy có nút ở đó, chứ
       * không phải thấy một nút đang khoá. (Repo cũng không có bậc viền 80%:
       * chỉ có `border-white-medium` ở 60%.)
       */
      {
        state: 'disabled',
        variant: 'white-secondary',
        class: {
          root: 'border-transparent bg-action-white-disabled',
          label: 'text-action-disabled-fg',
        },
      },

      // ── LOADING ───────────────────────────────────────────────────────────
      /**
       * Nhãn chỉ TRONG SUỐT chứ không bị gỡ: nút phải giữ nguyên bề rộng, nếu
       * không bố cục giật đúng lúc người dùng đang nhìn vào nó.
       */
      { state: 'loading', class: { content: 'opacity-0' } },

      /**
       * ⛔ Nhóm ĐẶC và nhóm VIỀN lúc `loading` là HAI quy tắc khác hẳn nhau —
       * đừng gộp lại cho gọn (bản trước gộp, và 7 biến thể viền bị tô nền +
       * xoá viền, tức nút "đổi kiểu" ngay giữa lúc gửi).
       *
       * Nhóm ĐẶC: Figma đổi nền sang bậc NHẠT cùng tông rồi đặt vòng quay màu
       * đậm lên trên. Đo điểm ảnh cột `Loading`: Primary/Tertiary `#EBF5F5` ·
       * Neutral `#F1F1F1` · Neutral tertiary `#F6F6F6` · White trắng 40% ·
       * Red `#FBE6E6` · Green `#E6F4E7` · Blue `#E7EDF8` · Orange `#FDEFE6`.
       */
      { state: 'loading', variant: ['primary', 'tertiary'], class: { root: 'bg-action-tint' } },
      /**
       * ⚠️ `#F1F1F1` (`Background/Ink/Light`), KHÔNG phải `#F6F6F6` — lệch 5
       * bậc xám, nhìn ra ngay khi nút nằm cạnh một thẻ nền `#F1F1F1`.
       *
       * ⛔ Bẫy tên class: token tên là `bg-ink-light` ⇒ tiện ích phải là
       * `bg-` + tên token = **`bg-bg-ink-light`**. Viết `bg-ink-light` là đòi
       * một màu tên `ink-light` — không có, NativeWind bỏ qua ÂM THẦM.
       */
      { state: 'loading', variant: 'neutral', class: { root: 'bg-bg-ink-light' } },
      {
        state: 'loading',
        variant: 'neutral-tertiary',
        class: { root: 'bg-surface-neutral' },
      },
      /**
       * ⚠️ Trắng 40% (`Background/White/Light`), KHÔNG phải trắng đặc: đo được
       * `#6A6A6A` trên nền bảng `#070707` ⇒ α = 0.40.
       *
       * ⛔ Nền và màu vòng quay phải sửa CÙNG LÚC — xem `BUTTON_SPINNER_COLOR`
       * ở cuối file. Nền mờ 40% + vòng quay gần đen = vòng quay vô hình trên
       * ảnh bìa tối; nền trắng đặc + vòng quay trắng cũng vô hình.
       */
      { state: 'loading', variant: 'white', class: { root: 'bg-action-white-light' } },
      { state: 'loading', variant: 'danger', class: { root: 'bg-surface-error' } },
      { state: 'loading', variant: 'success', class: { root: 'bg-surface-success' } },
      { state: 'loading', variant: 'info', class: { root: 'bg-surface-info' } },
      { state: 'loading', variant: 'warning', class: { root: 'bg-surface-warning' } },
      /**
       * Nhóm VIỀN: Figma GIỮ NGUYÊN viền và KHÔNG tô nền (đo được nền
       * `#FFFFFF` = nền bảng ở mọi biến thể `-secondary` sáng, `#070707` ở
       * `white-secondary` trên bảng tối). Chỉ nhãn mờ đi, vòng quay hiện lên.
       *
       * ⛔ Đừng thêm `border-transparent` vào đây: xoá viền là xoá luôn hình
       * dáng duy nhất mà nhóm này có.
       */
      {
        state: 'loading',
        variant: [
          'secondary',
          'neutral-secondary',
          'white-secondary',
          'danger-secondary',
          'success-secondary',
          'info-secondary',
          'warning-secondary',
        ],
        class: { root: 'bg-transparent' },
      },
    ],

    defaultVariants: { variant: 'primary', size: 'md', state: 'default' },
  },
  { twMergeConfig },
);

export type ButtonVariants = VariantProps<typeof buttonStyles>;
export type ButtonVariant = NonNullable<ButtonVariants['variant']>;
export type ButtonSize = NonNullable<ButtonVariants['size']>;
/** Suy ra trong component từ `disabled` / `loading` / `pressed`. */
export type ButtonState = NonNullable<ButtonVariants['state']>;

/**
 * Màu nội dung (icon + vòng quay) theo biến thể.
 *
 * ⛔ Phải có bảng RIÊNG bên cạnh công thức `tv()`: `<Icon>` nhận `color` là TÊN
 * TOKEN và `<ActivityIndicator>` nhận mã màu thô — cả hai đều KHÔNG nhận
 * `className`, nên không lấy được màu từ slot `label`. Sửa màu thì sửa cả hai
 * chỗ; đó là cái giá của việc React Native không có `currentColor`.
 */
export const BUTTON_CONTENT_COLOR: Record<ButtonVariant, ThemeColorKey> = {
  primary: 'action-fg',
  secondary: 'fg-brand',
  tertiary: 'fg-brand',
  // ⚠️ `action-ink-fg`, không phải `action-fg` — xem chú thích ở biến thể.
  neutral: 'action-ink-fg',
  'neutral-secondary': 'fg-1',
  'neutral-tertiary': 'fg-1',
  white: 'neutral-10',
  'white-secondary': 'action-white',
  danger: 'action-error-fg',
  'danger-secondary': 'error',
  success: 'action-success-fg',
  'success-secondary': 'success',
  info: 'action-info-fg',
  'info-secondary': 'info',
  warning: 'action-warning-fg',
  'warning-secondary': 'warning',
};

/**
 * ⛔ KHÔNG còn bảng "màu chữ/icon lúc bấm".
 *
 * Trước đây chỉ `tertiary` có mục riêng (`action-press`), và nó là một lỗi
 * tương phản: `action-press` là token NỀN, đặt lên nền `action-tint-strong`
 * chỉ được **3.84:1** trên bảng màu tối cũ (bảng màu tối mới cho 5.83:1, nhưng
 * đó là ăn may chứ không phải luật). Nay mọi biến thể giữ nguyên màu nội dung khi
 * bấm — phản hồi đến từ cái NỀN đổi, không phải từ màu chữ.
 *
 * Cần cho một biến thể đổi màu nội dung lúc bấm thì dựng lại bảng này, ⚠️ nhưng
 * phải chạy `npm run check:contrast` xác nhận cặp mới đạt ở CẢ HAI chế độ.
 */

export const BUTTON_DISABLED_CONTENT_COLOR: ThemeColorKey = 'action-disabled-fg';

/**
 * Màu vòng quay — đậm hơn nội dung thường vì nền lúc `loading` đã chuyển sang
 * bậc nhạt cùng tông (xem compound `state: 'loading'` ở trên).
 *
 * ⛔ Hai biến thể `white*` là NGOẠI LỆ và phải đi kèm nền tương ứng: chúng sống
 * trên ảnh bìa / header TỐI, nền lúc gửi chỉ là trắng 40% (`white`) hoặc trong
 * suốt (`white-secondary`). Vòng quay `neutral-10` (#1A1A1A) trên đó gần như
 * vô hình — Figma đo được vòng quay `#FAFAFA`, tức TRẮNG.
 */
export const BUTTON_SPINNER_COLOR: Record<ButtonVariant, ThemeColorKey> = {
  primary: 'action-base',
  secondary: 'action-base',
  tertiary: 'action-base',
  neutral: 'action-ink',
  'neutral-secondary': 'action-ink',
  'neutral-tertiary': 'action-ink',
  white: 'action-white',
  'white-secondary': 'action-white',
  danger: 'action-error',
  'danger-secondary': 'action-error',
  success: 'action-success',
  'success-secondary': 'action-success',
  info: 'action-info',
  'info-secondary': 'action-info',
  warning: 'action-warning',
  'warning-secondary': 'action-warning',
};

/** Figma: icon 24 ở cỡ 56/48/40, 20 ở cỡ 32. Cũng là cỡ vòng quay lúc `loading`. */
export const BUTTON_ICON_SIZE: Record<ButtonSize, IconSize> = {
  lg: 'md',
  md: 'md',
  sm: 'md',
  xs: 'sm',
};

/**
 * Trần hệ số phóng cỡ chữ của hệ điều hành, theo TỪNG cỡ nút.
 *
 * ⚠️ Chiều cao nút ở đây là RÀNG BUỘC THIẾT KẾ chứ không phải số đo tiện tay:
 * viên thuốc `h-control-*` phải cao bằng nhau trên cả một hàng ("Huỷ / Xác
 * nhận"), và nhãn đã bị `numberOfLines={1}` ép đúng một dòng. Nên ⛔ KHÔNG đổi
 * sang `min-h-` như `input/input.styles.ts` — thay vào đó chặn hệ số phóng chữ.
 *
 * Quên là hỏng THẬT: Android cho phóng cỡ chữ tới 2×. Ở mức "Cỡ chữ: Lớn nhất",
 * nhãn 14/20 của nút `xs` cao 40dp trong hộp cao đúng 32dp — `overflow-hidden`
 * của `root` xén ngang dòng chữ, người dùng thấy một viên thuốc có nửa chữ.
 *
 * Số lấy từ chỗ trống THẬT: (chiều cao nút − 4dp thở) ÷ lineHeight của nhãn.
 *   lg 56 ÷ 24 → 2.0 (bằng đúng mức tối đa của Android, tức không chặn gì)
 *   md 48 ÷ 24 → 1.8 · sm 40 ÷ 24 → 1.5 · xs 32 ÷ 20 → 1.3
 *
 * ⚠️ Đây là TRẦN, không phải hệ số: ở mức phóng thường cỡ chữ KHÔNG nhỏ đi.
 */
export const BUTTON_MAX_FONT_SCALE: Record<ButtonSize, number> = {
  lg: 2,
  md: 1.8,
  sm: 1.5,
  xs: 1.3,
};

/**
 * Bù vùng chạm cho đủ 44dp theo chiều DỌC — nút CÓ CHỮ.
 *
 * ⚠️ Quên là hỏng thật: nút `xs` chỉ cao 32dp — người dùng bấm trượt xuống mép
 * dưới, không có gì xảy ra, rồi họ kết luận app đơ.
 *
 * Chỉ nới theo chiều DỌC: nút có chữ hay nằm cạnh nhau theo hàng ngang (cặp
 * "Huỷ / Xác nhận" ở đáy màn), nới ngang thì vùng chạm hai nút chồng lên nhau
 * và cú chạm rơi vào NHẦM nút — lỗi tệ hơn hẳn lỗi bấm trượt.
 */
export const BUTTON_HIT_SLOP: Record<ButtonSize, Insets | undefined> = {
  lg: undefined,
  md: undefined,
  sm: { bottom: 2, top: 2 },
  xs: { bottom: 6, top: 6 },
};

/**
 * Nút chỉ-icon là Ô VUÔNG nên nó hụt 44dp ở CẢ HAI chiều (`xs` 32×32, `sm`
 * 40×40) — nới đối xứng, không chỉ dọc.
 *
 * ⚠️ Lập luận "nới ngang thì hai nút chồng vùng chạm" ở `BUTTON_HIT_SLOP`
 * KHÔNG áp dụng ở đây: nút chỉ-icon gần như luôn đứng một mình (góc app bar,
 * cuối ô nhập) chứ không đi thành cặp liền kề. Dùng chung bảng kia thì nút
 * "Đóng" cỡ `xs` chỉ có 32dp bề ngang — hụt 12dp so với ngưỡng.
 */
export const BUTTON_HIT_SLOP_ICON_ONLY: Record<ButtonSize, Insets | undefined> = {
  lg: undefined,
  md: undefined,
  sm: { bottom: 2, left: 2, right: 2, top: 2 },
  xs: { bottom: 6, left: 6, right: 6, top: 6 },
};
