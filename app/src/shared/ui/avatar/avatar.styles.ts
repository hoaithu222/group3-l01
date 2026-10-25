import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Avatar`.
 *
 * Tách khỏi file component vì `.tsx` phải ≤ 200 dòng (xem
 * `src/shared/ui/AGENTS.md`) — cùng khuôn với `button/button.styles.ts`.
 *
 * ── Số đo lấy từ Figma "BIDV OMNI MB → Avatar" (`259:94388`) ─────────────────
 * Bốn cỡ **48 · 40 · 32 · 24**, luôn TRÒN, chấm trạng thái ở góc dưới phải. Hai cỡ lớn `xl` 64 · `2xl` 96 là mở rộng
 * ngoài Figma cho đầu trang hồ sơ/nhóm (xem biến thể `size`).
 *
 * | Cỡ | Chữ viết tắt | Chấm | Viền trắng CHẤM | Viền trắng KHUNG |
 * |----|--------------|------|-----------------|------------------|
 * | 48 | 16/24        | 12   | 2dp             | 2dp              |
 * | 40 | **14/20**    | 12   | 2dp             | 2dp              |
 * | 32 | **10/16**    | 8    | 1.5dp           | 1.5dp            |
 * | 24 | 10/16        | 8    | **0**           | 1dp              |
 *
 * ⚠️ `shape="rounded"` là MỞ RỘNG NGOÀI FIGMA: bộ Avatar của ngân hàng chỉ có
 * hình tròn. Thêm vào vì logo tổ chức (hoá đơn, nhà cung cấp) trong các màn
 * thanh toán vốn là hình vuông, cắt tròn thì mất góc chữ.
 */
export const avatarStyles = tv(
  {
    slots: {
      // Ô ngoài KHÔNG cắt: chấm trạng thái nằm đè lên mép và tràn ra ngoài một
      // chút. Đặt `overflow-hidden` ở đây là chấm bị xén mất một nửa.
      root: 'relative',
      /**
       * Ô trong mới là chỗ cắt ảnh theo bo góc.
       *
       * ⚠️ Viền trắng là CÓ trong bản vẽ ở MỌI cỡ (2/2/1.5/1 dp) — chú thích cũ
       * ở đây khẳng định "bản vẽ không có" và đã bị xoá vì sai. Không có vành
       * này thì avatar đặt trên thẻ xám `bg-1` bị nhoè mép vào nền.
       *
       * ⚠️ Yoga tính viền vào TRONG hộp (`border-box`), nên khung vẫn đúng 48dp
       * và ảnh — vốn `absolute inset-0`, mà toạ độ tuyệt đối trong Yoga tính từ
       * mép ĐỆM — tự thụt vào sau vành trắng. Không phải cộng thêm gì.
       */
      frame:
        'h-full w-full items-center justify-center overflow-hidden border-border-white bg-surface-primary',
      image: 'absolute inset-0',
      // Màu chữ `fg-brand` = `#00453C` — đúng màu chữ viết tắt trong Figma, và
      // là token vai trò nên chế độ tối tự đổi sang xanh nhạt.
      initials: 'font-semibold text-fg-brand',
      /**
       * ⚠️ Viền trắng của chấm KHÔNG phải trang trí. Chấm `success` (#00810E)
       * dán thẳng lên ảnh chân dung tối màu — hoặc lên ảnh có nền xanh lá — thì
       * biến mất. Vành trắng tách nó khỏi mọi nền ảnh.
       */
      badge: 'absolute bottom-0 right-0 rounded-full border-border-white',
    },
    variants: {
      size: {
        // `h-6` = 24dp · `h-8` = 32 · `h-10` = 40 · `h-12` = 48 (thang số của
        // Tailwind được GIỮ nguyên trong repo này, xem tailwind.config.js).
        //
        // ⚠️ Vai trò chữ chép ĐÚNG bảng Figma ở đầu file, không chọn theo cảm
        // giác. Chữ viết tắt luôn IN HOA (viết hoa ở tầng dữ liệu, xem
        // `initials.ts`) nên dấu nằm ở tầng trên cùng và cần lineHeight rộng:
        // `text-label-xs` 10/16 = 1.60× ✅, `text-label-lg` 16/24 = 1.50× ✅.
        // `text-label-md` 14/20 = 1.43× — dưới mức 1.47× đo được cho chữ IN HOA
        // nhưng TRÊN ngưỡng 1.30× mà trình sinh thang chữ chặn cứng; đây là số
        // của bản vẽ và thang chữ không có bậc 14/21 nào để thay.
        // ⛔ Đừng quay lại `text-overline` cho cỡ 32: nó là 12/18 (to hơn bản vẽ
        // 2px) và kèm `letterSpacing: 0.6` — React Native chèn khoảng cách cả
        // SAU chữ cuối, nên cụm chữ lệch khỏi tâm vòng tròn 0.3px.
        xs: {
          root: 'h-6 w-6',
          frame: 'border-hairline',
          initials: 'text-label-xs',
          badge: 'h-2 w-2 border-0',
        },
        sm: {
          root: 'h-8 w-8',
          frame: 'border-medium',
          initials: 'text-label-xs',
          badge: 'h-2 w-2 border-medium',
        },
        md: {
          root: 'h-10 w-10',
          frame: 'border-thick',
          initials: 'text-label-md',
          badge: 'h-3 w-3 border-thick',
        },
        lg: {
          root: 'h-12 w-12',
          frame: 'border-thick',
          initials: 'text-label-lg',
          badge: 'h-3 w-3 border-thick',
        },
        // ⚠️ `xl` (64) và `2xl` (96) là MỞ RỘNG NGOÀI FIGMA (bộ của ngân hàng dừng ở 48) — cho đầu trang hồ sơ và đầu
        // trang nhóm, nơi avatar là ảnh chính chứ không phải một ô trong danh sách. Chữ viết tắt dùng vai trò tiêu đề
        // (24/32 · 28/37) để cân với đường kính; viền giữ 2dp như cỡ 40/48.
        xl: {
          root: 'h-16 w-16',
          frame: 'border-thick',
          initials: 'text-header-md',
          badge: 'h-4 w-4 border-thick',
        },
        '2xl': {
          root: 'h-24 w-24',
          frame: 'border-thick',
          initials: 'text-header-lg',
          badge: 'h-5 w-5 border-thick',
        },
      },
      shape: {
        circle: { frame: 'rounded-full' },
        rounded: { frame: 'rounded-2xs' },
      },
      /**
       * Nền khung đổi theo KIỂU RUỘT — đây là chỗ code từng vẽ NGƯỢC bản vẽ.
       *
       * · `light` = `Background/Primary/Light` #EBF5F5 — nền của ẢNH và của CHỮ
       *   VIẾT TẮT (`fg-brand` #00453C trên nền đó đo 9.87:1 ✅).
       * · `medium` = `Background/Primary/Medium` #B8D0CE — đĩa ĐẶC cho hình
       *   người mặc định, hình vẽ màu TRẮNG khoét ra (xem `Avatar.tsx`).
       *
       * ❌ Trước đây hai màu này bị đảo: nền #EBF5F5 + hình #B8D0CE đo được
       * **1.47:1** ⇒ ô avatar trông RỖNG, người dùng tưởng ảnh chưa tải xong;
       * còn ở chế độ tối nền `surface-primary` lật xuống #16332C nên cặp đó
       * vọt lên **8.39:1**, một hình người chói loà giữa danh sách. Đĩa đặc thì
       * ở cả hai chế độ đều đọc ra ngay là "một ô avatar chưa có ảnh".
       *
       * ⚠️ `primary-3` là THANG màu (giống nhau ở hai chế độ) chứ không phải
       * token vai trò — dùng ở đây vì bản vẽ gọi ĐÍCH DANH bậc này, đúng ngoại
       * lệ ghi trong `src/shared/ui/AGENTS.md`. Phần đổi theo chế độ nằm ở HÌNH
       * VẼ, không ở nền.
       */
      fill: {
        light: {},
        medium: { frame: 'bg-primary-3' },
      },
      badgeTone: {
        success: { badge: 'bg-success' },
        warning: { badge: 'bg-warning' },
        error: { badge: 'bg-error' },
        neutral: { badge: 'bg-fg-4' },
      },
    },
    defaultVariants: { size: 'md', shape: 'circle', fill: 'light', badgeTone: 'success' },
  },
  { twMergeConfig },
);

type AvatarVariants = VariantProps<typeof avatarStyles>;

export type AvatarSize = NonNullable<AvatarVariants['size']>;
export type AvatarShape = NonNullable<AvatarVariants['shape']>;
export type AvatarBadgeTone = NonNullable<AvatarVariants['badgeTone']>;

/**
 * Cỡ biểu tượng dự phòng, dp = **62.5% đường kính**.
 *
 * Tỉ lệ đo thẳng từ Figma (`259:94778`: icon 20 trong khung 32). Bộ số cũ là
 * 54–58% — nhỏ hơn bản vẽ, và ở cỡ 24 thì lệch 7%.
 */
export const FALLBACK_ICON_SIZE: Record<AvatarSize, number> = {
  xs: 15,
  sm: 20,
  md: 25,
  lg: 30,
  xl: 40,
  '2xl': 60,
};

/**
 * Trần hệ số phóng cỡ chữ cho CHỮ VIẾT TẮT, theo từng cỡ avatar.
 *
 * ⚠️ Đường kính avatar là RÀNG BUỘC THIẾT KẾ, không phải số đo tiện tay: ô
 * avatar xếp thành cột trong danh sách người nhận, một ô to hơn là cả cột so
 * le; và `shape="circle"` chỉ còn là hình tròn khi cao bằng rộng. Nên ⛔ KHÔNG
 * đổi `h-6 w-6`… sang `min-h-` — chặn hệ số phóng chữ thay vì cho khung nở.
 *
 * Quên là hỏng thật: Android cho phóng cỡ chữ tới 2×. Ở mức "Lớn nhất", chữ
 * viết tắt 10/16 của avatar `xs` cao 32dp trong vòng tròn đường kính 24dp —
 * hai chữ cái trào ra ngoài đĩa rồi bị `overflow-hidden` của `frame` xén ngang.
 *
 * Số lấy từ chỗ trống THẬT: (đường kính − 4dp thở) ÷ lineHeight.
 *   xs 24 ÷ 16 → 1.3 · sm 32 ÷ 16 → 1.7 · md 40 ÷ 20 → 1.8 · lg 48 ÷ 24 → 1.8 · xl 64 ÷ 32 → 1.8 · 2xl 96 ÷ 37 → 2 (trần của Android)
 *
 * ⚠️ Đây là TRẦN, không phải hệ số: ở mức phóng thường cỡ chữ KHÔNG nhỏ đi.
 */
export const INITIALS_MAX_FONT_SCALE: Record<AvatarSize, number> = {
  xs: 1.3,
  sm: 1.7,
  md: 1.8,
  lg: 1.8,
  xl: 1.8,
  '2xl': 2,
};
