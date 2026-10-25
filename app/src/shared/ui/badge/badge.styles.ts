import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Badge`.
 *
 * Tách khỏi `Badge.tsx` vì bảng biến thể dài hơn phần logic khá nhiều: thiết kế
 * có 7 tông × 3 dáng × 2 cỡ, mà logic của component chỉ là "chọn nội dung nào
 * để vẽ". Để chung một file thì phần đọc được (JSX) bị chôn dưới 120 dòng bảng
 * màu — cùng lý do `input/` tách `input.styles.ts`.
 *
 * Nguồn: Figma "BIDV OMNI MB" — section `Badge` (259:96768):
 *  · component set `Badge` (259:96898) — biến thể `Size` × `Status` × `Only text`;
 *  · component set `Orther badge` (259:96833) — `promotion` / `Hot / mới` /
 *    `notification`, tức là dáng NỀN ĐẶC.
 *
 * ── Số đo lấy từ Figma ───────────────────────────────────────────────────────
 *   soft   small 24dp cao · medium 28dp cao · đệm ngang 8 (`Padding/Pa8`)
 *   solid  small 20dp cao · medium 24dp cao · đệm ngang 4 / 6
 *   số     small 16×16 · medium 24×24
 *   bo góc 16 (`Border/Bo16` = `rounded-sm`) · viền 1dp · khe 4 (`Gap/Ga4`)
 */
const badge = tv(
  {
    slots: {
      root: 'flex-row items-center justify-center gap-2xs self-start',
      label: 'text-center font-semibold',
    },

    variants: {
      /**
       * Tông màu. Tên theo NGỮ NGHĨA của repo, không theo tên màu trong Figma:
       * cột "BLUE" của bản thiết kế là `info`, "RED" là `error`, "BRAND" là
       * `brand`. Đặt tên theo màu thì đổi bảng màu một lần là tên nói dối.
       *
       * ⚠️ Viền dùng nhóm `border-*-subtle`, KHÔNG dùng bậc thang `info-3`.
       * Thiết kế gọi đích danh `Border/<tông>/Medium` (#B6C7EA cho info…), và
       * `border-info-subtle` giữ ĐÚNG giá trị đó ở chế độ sáng rồi lật xuống
       * #274169 ở chế độ tối. Bậc `info-3` thì giống hệt nhau ở hai chế độ, nên
       * trên nền tối nó thành một đường xanh nhạt chói hơn cả chữ bên trong.
       *
       * ── ⛔ Hai chữ `border`, và đó không phải lỗi gõ ──────────────────────
       * Token tên là `border-info-subtle`, tiện ích viền là `border-` ⇒ class
       * đúng là `border-border-info-subtle`. Viết `border-info-subtle` là đòi
       * bậc `subtle` của HỌ MÀU `info` — bậc đó không tồn tại, Tailwind không
       * sinh class nào, NativeWind bỏ qua ÂM THẦM và huy hiệu mất hẳn viền.
       */
      variant: {
        info: { root: 'border-border-info-subtle bg-surface-info', label: 'text-info' },
        success: { root: 'border-border-success-subtle bg-surface-success', label: 'text-success' },
        warning: { root: 'border-border-warning-subtle bg-surface-warning', label: 'text-warning' },
        error: { root: 'border-border-error-subtle bg-surface-error', label: 'text-error' },
        brand: { root: 'border-border-brand-subtle bg-surface-primary', label: 'text-fg-brand' },
        /**
         * ⚠️ Nền lệch bản vẽ MỘT bậc, có chủ ý: Figma `Status=neutral`
         * (259:97043) khai `Background/Ink/Light` #F1F1F1, token của repo là
         * `bg-ink-light`; ở đây dùng `surface-neutral` #F6F6F6 — chênh 2% độ
         * sáng, mắt không tách được. Đổi lấy tính nhất quán mà
         * `src/shared/ui/AGENTS.md` chốt: alert/badge/chip đi chung họ
         * `surface-*`, nên lần đổi bảng màu sau cả ba nhóm dịch cùng nhau thay
         * vì badge `neutral` trôi riêng một mình. Viền `border-strong` (#969696)
         * và chữ `fg-1` thì khớp đúng bản vẽ; chữ đo 16.1:1 sáng · 11.37:1 tối.
         */
        neutral: { root: 'border-border-strong bg-surface-neutral', label: 'text-fg-1' },
        disabled: { root: 'border-border-2 bg-bg-2', label: 'text-action-disabled-fg' },
      },

      /**
       * Dáng vẻ.
       *  · `soft`  — nền nhạt + viền + chữ cùng tông (bảng `Badge` của Figma);
       *  · `solid` — nền đặc + chữ trắng (`promotion`, `Hot / mới`, số thông báo);
       *  · `text`  — chỉ có chữ (cột "NEUTRAL/ONLY TEXT").
       */
      appearance: {
        soft: { root: 'border-hairline' },
        /**
         * Viền cùng màu nền TRANG (`bg-1`) chứ không phải trắng cứng.
         *
         * Figma khai `Border/White/Default` vì bản vẽ chỉ có theme sáng. Vòng
         * viền này tồn tại để tách con số khỏi biểu tượng nằm dưới nó
         * (`BadgeAnchor`) — nên nó phải trùng NỀN, không phải trùng màu trắng.
         * Để trắng cứng thì ở theme tối con số có một quầng sáng quanh mình.
         *
         * ⛔ KHÔNG khai màu chữ ở đây. Màu chữ của dáng đặc phụ thuộc TỪNG tông
         * và nằm ở `compoundVariants` bên dưới — xem đoạn "Nền đặc" để biết vì
         * sao một màu chữ dùng chung là hỏng ở chế độ tối.
         */
        solid: { root: 'border-hairline border-bg-1' },
        text: { root: 'border-0 bg-transparent' },
      },

      size: { sm: {}, md: {} },

      /**
       * Hình dạng, suy ra từ nội dung chứ không phải người gọi tự chọn:
       * có `dot` thì là chấm, có `count` thì là số, còn lại là viên thuốc.
       */
      shape: {
        pill: { root: 'rounded-sm' },
        count: { root: 'rounded-full px-2xs' },
        dot: { root: 'rounded-full' },
      },
    },

    compoundVariants: [
      /**
       * ── Viên thuốc: cao 24/28 ở dáng soft, 20/24 ở dáng nền đặc ────────────
       *
       * ⚠️ `min-h-` chứ KHÔNG phải `h-`, dù bản vẽ chốt chiều cao. Trần
       * `maxFontSizeMultiplier={1.3}` ở `Badge.tsx` KHÔNG đủ cho hai dáng nhỏ
       * nhất: nhãn 10/16 của `solid sm` ở trần 1.3 cao 20.8dp trong hộp `h-5`
       * (20dp), và huy hiệu SỐ `h-4` (16dp) thì tràn ngay từ hệ số 1.05. Chiều
       * cao ở đây là số đo TIỆN TAY chứ không phải ràng buộc — huy hiệu đứng
       * một mình hoặc treo góc (`BadgeAnchor` đặt `absolute`), cao thêm vài dp
       * không làm hàng nào so le. Ở cỡ chữ thường `min-h-` cho ra ĐÚNG con số
       * cũ vì nội dung luôn thấp hơn sàn.
       */
      { shape: 'pill', size: 'sm', appearance: ['soft', 'text'], class: { root: 'min-h-6 px-xs' } },
      { shape: 'pill', size: 'md', appearance: ['soft', 'text'], class: { root: 'min-h-7 px-xs' } },
      { shape: 'pill', size: 'sm', appearance: 'solid', class: { root: 'min-h-5 px-2xs' } },
      { shape: 'pill', size: 'md', appearance: 'solid', class: { root: 'min-h-6 px-1.5' } },

      // ── Số: ô vuông tối thiểu 16/24, nở ra khi có 2–3 chữ số ───────────────
      { shape: 'count', size: 'sm', class: { root: 'min-h-4 min-w-4' } },
      { shape: 'count', size: 'md', class: { root: 'min-h-6 min-w-6' } },

      /**
       * Chấm KHÔNG có trong Figma — thiết kế chỉ vẽ dạng số. Thêm vào vì mọi
       * chỗ dùng "có cái gì đó mới" mà không đếm được (tab, mục menu) đều cần
       * nó, và tự vẽ một `View` tròn ở từng nơi thì mỗi nơi một cỡ.
       * 8/10dp lấy theo tỉ lệ nửa chiều cao của dạng số.
       */
      { shape: 'dot', size: 'sm', class: { root: 'h-2 w-2' } },
      { shape: 'dot', size: 'md', class: { root: 'h-2.5 w-2.5' } },

      /**
       * ── Nền đặc: mỗi tông một CẶP nền + chữ ────────────────────────────────
       *
       * ⛔ Nền đi qua họ `action-*` chứ KHÔNG qua token ngữ nghĩa trần
       * (`bg-warning`, `bg-error`…), và chữ đi qua `action-*-fg` CÙNG CẶP.
       *
       * Vì sao: thang ngữ nghĩa ĐẢO CHIỀU ở chế độ tối. `bg-warning` tối là
       * #FFBE45 (vàng rực), `bg-success` tối là #4ADE9B, `bg-error` tối là
       * #FF7B7B — đặt chữ trắng cứng lên đó đo được 1.65 / 1.72 / 2.51:1, tức
       * là huy hiệu thành một mảng màu SÁNG trống: chữ có đó nhưng không đọc
       * được. Cặp `action-*` + `action-*-fg` thì đảo ĐỒNG BỘ (nền sáng ⇒ chữ
       * mực), nên ở chế độ tối lên 7.0–9.0:1.
       *
       * ✅ Ở chế độ SÁNG màu nền KHÔNG đổi một chút nào so với bản cũ:
       * `action-error` = #C30000 = `error`, `action-warning` = #D35801 =
       * `warning`, `action-success` = #00810E, `action-info` = #1043A9 — đúng
       * `Background/<tông>/Default` của Figma. Đây thuần là vá chế độ tối.
       *
       * ⚠️ Cùng cơ chế mà tông `neutral` ngay bên dưới đã tránh được từ đầu —
       * năm tông trên chỉ là chỗ bị bỏ sót.
       */
      {
        appearance: 'solid',
        variant: 'info',
        class: { root: 'bg-action-info', label: 'text-action-info-fg' },
      },
      {
        appearance: 'solid',
        variant: 'success',
        class: { root: 'bg-action-success', label: 'text-action-success-fg' },
      },
      {
        appearance: 'solid',
        variant: 'warning',
        class: { root: 'bg-action-warning', label: 'text-action-warning-fg' },
      },
      {
        appearance: 'solid',
        variant: 'error',
        class: { root: 'bg-action-error', label: 'text-action-error-fg' },
      },
      {
        appearance: 'solid',
        variant: 'brand',
        class: { root: 'bg-action-base', label: 'text-action-fg' },
      },
      /**
       * Tông trung tính ở dáng đặc dùng bậc thang cố định `ink-5` chứ không phải
       * `action-ink`: `action-ink` sáng lên thành #E8EEEC ở theme tối, mà nền
       * `ink-5` thì GIỐNG NHAU ở hai chế độ — nên đây là tông duy nhất mà chữ
       * trắng cứng (`white-10`) đúng ở cả sáng lẫn tối (17.40:1).
       */
      {
        appearance: 'solid',
        variant: 'neutral',
        class: { root: 'bg-ink-5', label: 'text-white-10' },
      },
      {
        appearance: 'solid',
        variant: 'disabled',
        class: { root: 'bg-action-disabled', label: 'text-action-disabled-fg' },
      },

      // ── Cỡ chữ ────────────────────────────────────────────────────────────
      // Figma: soft 12/16 (small) · 14/20 (medium).
      {
        shape: 'pill',
        size: 'sm',
        appearance: ['soft', 'text'],
        class: { label: 'text-label-sm' },
      },
      {
        shape: 'pill',
        size: 'md',
        appearance: ['soft', 'text'],
        class: { label: 'text-label-md' },
      },
      /**
       * ⚠️ Figma ghi 8px cho cỡ small của nhóm nền đặc. Thang chữ của repo dừng
       * ở 10px (`label-xs`) và cố tình không có bậc nhỏ hơn: dưới 10px thì dấu
       * hai tầng tiếng Việt (`Ẳ`, `Ộ`) dính vào nhau trên màn hình mật độ thấp.
       * Lệch 2px này là CÓ CHỦ Ý — xem `docs/rules/styling-nativewind.md`.
       */
      {
        shape: ['pill', 'count'],
        size: 'sm',
        appearance: 'solid',
        class: { label: 'text-label-xs' },
      },
      // Figma: 13/16 → vai trò `caption-lg` (13/17).
      {
        shape: ['pill', 'count'],
        size: 'md',
        appearance: 'solid',
        class: { label: 'text-caption-lg' },
      },
    ],

    defaultVariants: { appearance: 'soft', shape: 'pill', size: 'md', variant: 'neutral' },
  },
  // ⛔ BẮT BUỘC — không truyền thì `label` vừa có cỡ chữ vừa có màu sẽ lặng lẽ
  // đánh rơi cỡ chữ. Xem `docs/rules/styling-nativewind.md`.
  { twMergeConfig },
);

type BadgeVariants = VariantProps<typeof badge>;

export type BadgeAppearance = NonNullable<BadgeVariants['appearance']>;
export type BadgeSize = NonNullable<BadgeVariants['size']>;
export type BadgeVariant = NonNullable<BadgeVariants['variant']>;

export { badge };
