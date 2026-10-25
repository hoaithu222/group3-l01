import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Tỉ lệ khung ảnh — **nguồn duy nhất** cho mọi ô ảnh của nhóm `card/`
 * (`MediaCard` và `Thumbnail`).
 *
 * Số đo lấy từ slide quy định `193:25737` ("Sử dụng 1 trong 2 loại Card với size
 * đã quy định") và slide `193:25366` (banner):
 *
 * | Khoá          | Ảnh trong bản vẽ | Dùng ở đâu                                  |
 * | ------------- | ---------------- | ------------------------------------------- |
 * | `square`      | vuông 1:1        | Loại 2 — lưới 2 cột (bề rộng thẻ 165.5)     |
 * | `wide`        | 276×170          | Loại 1 — rail cuộn ngang (bề rộng thẻ 276)  |
 * | `banner`      | 343×192          | Banner quảng cáo đầu màn (`193:25366`)      |
 * | `banner-slim` | 343×163          | Ô ảnh trần `Image view / Placeholder`       |
 *
 * ── ⚠️ `banner-slim` KHÔNG dành cho THẺ — nó là mặc định của `Thumbnail` ─────
 * Đo lại trên Figma: `259:123593` là **343×163** (không phải 343×192 như
 * `banner`), và chín ô `Image view / Placeholder` của bản vẽ — `222:13426`,
 * `1053:27971`, `193:25379/25424/25430/25436/25456/25751` — đều là ô ảnh TRẦN,
 * không nằm trong thẻ nào. Chúng thuộc về `Thumbnail`.
 *
 * ⛔ Vẫn khai ở ĐÂY chứ không mở một bảng tỉ lệ thứ hai trong `Thumbnail.tsx`:
 * hai bảng thì lần đổi bản vẽ sau chỉ sửa được một, và `MediaCard` với
 * `Thumbnail` sẽ lệch nhau đúng ở chỗ không ai nhìn ra. Ca một lần (bản vẽ
 * riêng của một feature) thì `Thumbnail` nhận thẳng một SỐ, không phải thêm
 * khoá vào đây.
 *
 * ── ⛔ Vì sao ở đây chỉ có TỈ LỆ, không có BỀ RỘNG ───────────────────────────
 * Bề rộng của loại 2 là **165.5** — một số LẺ, và nó không phải hằng số: nó là
 * `(343 − 12) / 2`, tức "khung nội dung trừ khe, chia đôi". Viết cứng 165.5 vào
 * component thì trên máy 320dp (khung nội dung 288) hai thẻ cộng khe thành 343 >
 * 288 ⇒ cột thứ hai bị đẩy ra ngoài mép phải, và trên máy tính bảng thì hai thẻ
 * bé tí nằm lọt thỏm bên trái. Không có lỗi nào báo ở cả hai ca.
 *
 * ✅ Bề rộng là việc của NƠI GỌI: `<View className="flex-row gap-sm">` rồi mỗi
 * thẻ bọc trong một ô `flex-1` — Yoga tự chia `(bề rộng khung − 12) / 2`, đúng
 * công thức của bản vẽ ở MỌI bề rộng màn. Rail ngang thì nơi gọi cho lớp bọc
 * `style={{ width: 276 }}` (bề rộng cố định là chủ ý của bản vẽ cho hàng cuộn
 * ngang).
 *
 * ⚠️ Là SỐ chứ không phải class `aspect-[276/170]`: thang `aspect` của Tailwind
 * sinh ra `aspect-ratio: 276/170` dạng phân số, còn React Native chỉ nhận một
 * SỐ THỰC ở `aspectRatio` — nơi gọi dùng `style={{ aspectRatio }}` cho banner.
 * `aspect-square` (tỉ lệ 1) thì chạy được
 * qua class, nhưng để hai cơ chế song song là mời người sau sửa nhầm một chỗ.
 */
export const MEDIA_ASPECT_RATIO = {
  square: 1,
  banner: 343 / 192,
  'banner-slim': 343 / 163,
  wide: 276 / 170,
} as const;

export type MediaCardAspect = keyof typeof MEDIA_ASPECT_RATIO;

/**
 * Công thức style của `MediaCard`. Tách khỏi `MediaCard.tsx` để file component
 * giữ dưới 200 dòng — cùng cách bố trí với `list/`, `alert/`, `button/`.
 *
 * ⛔ Ở đây KHÔNG có bo góc, nền thẻ, hay `overflow-hidden`: tất cả nằm trong
 * `Card` và `MediaCard` dựng BẰNG `Card` chứ không dựng lại. Thêm `rounded-md`
 * hay `bg-bg-1` vào đây là tạo bộ số đo thứ hai, và lần đổi token sau sẽ chỉ đổi
 * được một trong hai.
 */
export const mediaCardStyles = tv(
  {
    slots: {
      /**
       * ⛔ `gap-0` đè `gap-sm` của gốc `Card`.
       *
       * `Card` cách các khe của nó 12dp — đúng cho một chồng `<ListItem>`, SAI ở
       * đây: bản vẽ cho ảnh bìa DÍNH LIỀN khối chữ (`259:123597`, ảnh vuông kết
       * thúc ở y=165.5 và khối chữ bắt đầu ngay dưới, phần 12dp là ĐỆM của khối
       * chữ chứ không phải khe). Để nguyên `gap-sm` thì khoảng hở thành 12 + 12
       * = 24 và thẻ cao hơn bản vẽ 12dp — sai mà không có lỗi nào báo.
       */
      root: 'gap-0',
      /**
       * ⛔ Ở đây KHÔNG còn slot nào cho KHUNG ẢNH — nó đã dọn sang `Thumbnail`.
       *
       * Khung ảnh cần đúng ba thứ (nền giữ chỗ, `absolute inset-0`, `aspectRatio`
       * đặt bằng `style`) và cả ba đều là cách vòng qua CÙNG MỘT cái bẫy của
       * `expo-image` — xem lời giải thích đầy đủ ở `Thumbnail.tsx`. Bản chép tay
       * ở đây là bản thứ ba của cùng lời giải thích; giữ lại là mời người sau
       * viết bản thứ tư.
       */
      /**
       * Khối chữ. `p-sm` = 12 và `gap-2xs` = 4 lấy đúng slide `193:25737`
       * ("đệm 12") và khe tên → giá 4 của `259:123597`.
       */
      body: 'gap-2xs p-sm',
      title: 'text-body-lg font-semibold text-fg-1',
      description: 'text-label-md text-fg-2',
    },
    variants: {
      /**
       * Thẻ khoá. ⛔ Hạ bằng MÀU CHỮ chứ không bằng `opacity-*`: lớp mờ ăn luôn
       * ảnh bìa (ảnh sản phẩm nhoè trông như lỗi tải, không như "hết hàng"), mà
       * nền khoá của thẻ đã do `Card` lo rồi.
       *
       * ⚠️ Khai SAU không quan trọng ở đây (không đụng `tone`), nhưng cả hai
       * class đều là `text-*` màu nên chúng phải THẮNG màu ở slot gốc — và chúng
       * thắng vì `tv()` nối theo thứ tự khai báo rồi để `tailwind-merge` xử lý.
       */
      disabled: {
        true: {
          description: 'text-action-disabled-fg',
          title: 'text-action-disabled-fg',
        },
      },
    },
    defaultVariants: { disabled: false },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

export type MediaCardVariants = VariantProps<typeof mediaCardStyles>;
